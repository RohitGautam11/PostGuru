import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsInt, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';
import { extname } from 'path';
import { env } from '../../config/env';
import { randomToken } from '../../common/crypto';
import { AuthUser, CurrentUser, MinRole } from '../../common/decorators';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from './storage.service';

const ALLOWED = /^(image\/(jpeg|png|gif|webp)|video\/(mp4|quicktime|webm))$/;

class UploadRequestDto {
  @IsString() @MaxLength(200) fileName: string;
  @IsString() @Matches(ALLOWED, { message: 'Unsupported file type. Use JPG, PNG, GIF, WEBP, MP4, MOV or WEBM.' }) mimeType: string;
  @IsInt() @Min(1) size: number;
}

class CompleteUploadDto extends UploadRequestDto {
  @IsString() @MaxLength(300) key: string;
  /** Vercel Blob: the public URL returned by the upload. */
  @IsOptional() @IsString() @MaxLength(600) url?: string;
}

@Controller('media')
export class MediaController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  @Get()
  async list(@CurrentUser() user: AuthUser, @Query('type') type?: string, @Query('cursor') cursor?: string) {
    const items = await this.prisma.mediaAsset.findMany({
      where: { workspaceId: user.workspaceId, ...(type === 'IMAGE' || type === 'VIDEO' ? { type } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 41,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = items.length > 40;
    return { items: items.slice(0, 40), nextCursor: hasMore ? items[39].id : null };
  }

  /** Step 1: ask for an upload target. S3 → presigned URL; local → use POST /media/local. */
  @MinRole('EDITOR')
  @Post('upload-url')
  async uploadUrl(@CurrentUser() user: AuthUser, @Body() dto: UploadRequestDto) {
    this.assertSize(dto.size);
    const key = this.makeKey(user.workspaceId, dto.fileName, dto.mimeType);
    if (this.storage.driver === 'local') return { mode: 'local', key };
    if (this.storage.driver === 'blob') return { mode: 'blob', key, clientToken: await this.storage.blobClientToken(key, dto.mimeType) };
    return { mode: 's3', key, uploadUrl: await this.storage.presignPut(key, dto.mimeType, dto.size) };
  }

  /** Local-disk upload (development / self-hosted only). */
  @MinRole('EDITOR')
  @Post('local')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 200 * 1024 * 1024 } }))
  async uploadLocal(@CurrentUser() user: AuthUser, @UploadedFile() file: Express.Multer.File) {
    if (this.storage.driver !== 'local') throw new BadRequestException('Local uploads are disabled');
    if (!file) throw new BadRequestException('No file uploaded');
    if (!ALLOWED.test(file.mimetype)) throw new BadRequestException('Unsupported file type');
    this.assertSize(file.size);
    const key = this.makeKey(user.workspaceId, file.originalname, file.mimetype);
    await this.storage.saveLocal(key, file.buffer);
    return this.register(user, { key, fileName: file.originalname, mimeType: file.mimetype, size: file.size });
  }

  /** Step 2 (S3): record the asset once the browser finished uploading. */
  @MinRole('EDITOR')
  @Post('complete')
  async complete(@CurrentUser() user: AuthUser, @Body() dto: CompleteUploadDto) {
    if (!dto.key.startsWith(`${user.workspaceId}/`)) throw new BadRequestException('Invalid key');
    if (dto.url && !this.storage.isBlobUrlFor(dto.url, dto.key)) throw new BadRequestException('Invalid upload URL');
    return this.register(user, dto);
  }

  @MinRole('EDITOR')
  @Delete(':id')
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const asset = await this.prisma.mediaAsset.findFirst({ where: { id, workspaceId: user.workspaceId } });
    if (!asset) throw new NotFoundException('Media not found');
    await this.storage.remove(asset.key, asset.url).catch(() => undefined);
    await this.prisma.mediaAsset.delete({ where: { id } });
    return { ok: true };
  }

  private register(user: AuthUser, dto: CompleteUploadDto) {
    return this.prisma.mediaAsset.create({
      data: {
        workspaceId: user.workspaceId,
        uploaderId: user.id,
        key: dto.key,
        url: this.storage.driver === 'blob' && dto.url ? dto.url : this.storage.publicUrl(dto.key),
        fileName: dto.fileName.slice(0, 200),
        mimeType: dto.mimeType,
        size: dto.size,
        type: dto.mimeType.startsWith('video/') ? 'VIDEO' : 'IMAGE',
      },
    });
  }

  private assertSize(size: number) {
    if (size > env().MAX_UPLOAD_MB * 1024 * 1024) {
      throw new BadRequestException(`File is larger than ${env().MAX_UPLOAD_MB} MB`);
    }
  }

  private makeKey(workspaceId: string, fileName: string, mimeType: string) {
    const ext = (extname(fileName).toLowerCase().replace(/[^.a-z0-9]/g, '') || `.${mimeType.split('/')[1]}`).slice(0, 8);
    const month = new Date().toISOString().slice(0, 7);
    return `${workspaceId}/${month}/${randomToken(16)}${ext}`;
  }
}
