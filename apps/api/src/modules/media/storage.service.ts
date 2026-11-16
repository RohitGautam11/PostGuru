import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, InternalServerErrorException } from '@nestjs/common';
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

  publicUrl(key: string) {
    const e = env();
    if (this.driver === 'local') return `${e.WEB_URL}/api/uploads/${key}`;
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

  async remove(key: string) {
    if (this.driver === 'local') {
      const path = join(LOCAL_UPLOAD_DIR, key);
      if (path.startsWith(LOCAL_UPLOAD_DIR)) await fs.rm(path, { force: true });
      return;
    }
    await this.client().send(new DeleteObjectCommand({ Bucket: env().S3_BUCKET, Key: key }));
  }
}
