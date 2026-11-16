import { api, ApiError } from './api';
import type { MediaAsset } from './types';

export const ACCEPTED_MEDIA = 'image/jpeg,image/png,image/gif,image/webp,video/mp4,video/quicktime,video/webm';

function putWithProgress(url: string, file: File, onProgress?: (pct: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new ApiError(`Upload failed (${xhr.status})`, xhr.status)));
    xhr.onerror = () => reject(new ApiError('Upload failed. Check your storage CORS settings.', 0));
    xhr.send(file);
  });
}

/** Uploads a file straight to object storage (S3/R2) or, in local mode, through the API. */
export async function uploadFile(file: File, onProgress?: (pct: number) => void): Promise<MediaAsset> {
  const target = await api<{ mode: 'local' | 's3'; key: string; uploadUrl?: string }>('/media/upload-url', {
    method: 'POST',
    body: { fileName: file.name, mimeType: file.type, size: file.size },
  });
  if (target.mode === 'local') {
    const form = new FormData();
    form.append('file', file);
    onProgress?.(50);
    const asset = await api<MediaAsset>('/media/local', { method: 'POST', body: form });
    onProgress?.(100);
    return asset;
  }
  await putWithProgress(target.uploadUrl!, file, onProgress);
  return api<MediaAsset>('/media/complete', {
    method: 'POST',
    body: { key: target.key, fileName: file.name, mimeType: file.type, size: file.size },
  });
}
