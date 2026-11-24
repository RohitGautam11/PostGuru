import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { del as blobDelete } from '@vercel/blob';
import { generateClientTokenFromReadWriteToken } from '@vercel/blob/client';
import { promises as fs } from 'fs';
import { dirname, join, resolve } from 'path';
import { env } from '../../config/env';

export const LOCAL_UPLOAD_DIR = resolve(process.cwd(), 'uploads');

@Injectable()
export class StorageService {
  private s3: S3Client | null = null;

  get driver() {
    return env().STORAGE_DRIVER;
  }

  private client() {
    if (this.s3) return this.s3;
    const e = env();
    if (!e.S3_BUCKET || !e.S3_ACCESS_KEY_ID || !e.S3_SECRET_ACCESS_KEY) {
      throw new InternalServerErrorException('S3 storage is not configured');
    }
    this.s3 = new S3Client({
      region: e.S3_REGION,
      endpoint: e.S3_ENDPOINT || undefined,
      forcePathStyle: Boolean(e.S3_ENDPOINT),
      credentials: { accessKeyId: e.S3_ACCESS_KEY_ID, secretAccessKey: e.S3_SECRET_ACCESS_KEY },
    });
    return this.s3;
  }

  private blobToken() {
    const token = env().BLOB_READ_WRITE_TOKEN;
    if (!token) throw new InternalServerErrorException('Vercel Blob storage is not configured (BLOB_READ_WRITE_TOKEN)');
    return token;
  }

  /** Vercel Blob: a short-lived client token that only allows uploading this one pathname. */
  async blobClientToken(key: string, mimeType: string) {
    return generateClientTokenFromReadWriteToken({
      token: this.blobToken(),
      pathname: key,
      allowedContentTypes: [mimeType],
      maximumSizeInBytes: env().MAX_UPLOAD_MB * 1024 * 1024,
      addRandomSuffix: false,
      validUntil: Date.now() + 10 * 60 * 1000,
    });
  }

  /** True if `url` is the public Vercel Blob URL of `key` (as returned to the browser after upload). */
  isBlobUrlFor(url: string, key: string) {
    try {
      const u = new URL(url);
      return u.protocol === 'https:' && u.hostname.endsWith('.public.blob.vercel-storage.com') && decodeURIComponent(u.pathname) === `/${key}`;
    } catch {
      return false;
    }
  }

  publicUrl(key: string) {
    const e = env();
    if (this.driver === 'local') return `${e.WEB_URL}/api/uploads/${key}`;
    if (this.driver === 'blob') {
      // Read-write tokens look like vercel_blob_rw_<storeId>_<secret>.
      const storeId = (e.BLOB_READ_WRITE_TOKEN ?? '').split('_')[3]?.toLowerCase();
      return `https://${storeId}.public.blob.vercel-storage.com/${key}`;
    }
    const base = e.S3_PUBLIC_URL || `https://${e.S3_BUCKET}.s3.${e.S3_REGION}.amazonaws.com`;
    return `${base.replace(/\/$/, '')}/${key}`;
  }

  /** Browser uploads straight to the bucket, bypassing serverless body-size limits. */
  async presignPut(key: string, mimeType: string, size: number) {
    const cmd = new PutObjectCommand({
      Bucket: env().S3_BUCKET,
      Key: key,
      ContentType: mimeType,
      ContentLength: size,
      CacheControl: 'public, max-age=31536000, immutable',
    });
    return getSignedUrl(this.client(), cmd, { expiresIn: 600 });
  }

  async saveLocal(key: string, buffer: Buffer) {
    const path = join(LOCAL_UPLOAD_DIR, key);
    if (!path.startsWith(LOCAL_UPLOAD_DIR)) throw new InternalServerErrorException('Invalid key');
    await fs.mkdir(dirname(path), { recursive: true });
    await fs.writeFile(path, buffer);
  }

  async remove(key: string, url?: string) {
    if (this.driver === 'blob') {
      await blobDelete(url ?? this.publicUrl(key), { token: this.blobToken() });
      return;
    }
    if (this.driver === 'local') {
      const path = join(LOCAL_UPLOAD_DIR, key);
      if (path.startsWith(LOCAL_UPLOAD_DIR)) await fs.rm(path, { force: true });
      return;
    }
    await this.client().send(new DeleteObjectCommand({ Bucket: env().S3_BUCKET, Key: key }));
  }
}
