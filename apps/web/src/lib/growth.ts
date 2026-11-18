'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from './api';
import type { PostMedia, Provider } from './types';

export type CheckLevel = 'good' | 'warn' | 'bad' | 'info';
export interface ScoreResult {
  overall: number;
  grade: string;
  platforms: { provider: Provider; label: string; score: number; grade: string; checks: { level: CheckLevel; text: string }[]; tips: string[] }[];
}
export interface HashtagResult {
  niche: string[];
  suggestions: { tag: string; source: 'yours' | 'niche' | 'keyword'; reach?: string; note: string }[];
  limits: { provider: Provider; label: string; min: number; max: number }[];
}
export interface MediaMeta {
  type: 'IMAGE' | 'VIDEO';
  width?: number;
  height?: number;
  duration?: number;
}
export type AiTask = 'caption' | 'improve' | 'hashtags' | 'hooks' | 'youtube_seo' | 'ideas';

export function useGrowthStatus() {
  return useQuery({ queryKey: ['growth-status'], queryFn: () => api<{ ai: boolean }>('/growth/status'), staleTime: 5 * 60_000 });
}

/** Debounces a value (used so scoring runs after the user pauses typing). */
export function useDebounced<T>(value: T, ms = 600) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Reads width/height/duration of attached media in the browser (no server processing needed). */
export function useMediaMeta(media: PostMedia[]) {
  const [meta, setMeta] = useState<Record<string, MediaMeta>>({});
  useEffect(() => {
    let cancelled = false;
    for (const m of media) {
      if (meta[m.id]) continue;
      if (m.type === 'VIDEO') {
        const v = document.createElement('video');
        v.preload = 'metadata';
        v.muted = true;
        v.onloadedmetadata = () => {
          if (!cancelled) setMeta((x) => ({ ...x, [m.id]: { type: 'VIDEO', width: v.videoWidth, height: v.videoHeight, duration: v.duration } }));
        };
        v.onerror = () => !cancelled && setMeta((x) => ({ ...x, [m.id]: { type: 'VIDEO' } }));
        v.src = m.url;
      } else {
        const img = new Image();
        img.onload = () => !cancelled && setMeta((x) => ({ ...x, [m.id]: { type: 'IMAGE', width: img.naturalWidth, height: img.naturalHeight } }));
        img.onerror = () => !cancelled && setMeta((x) => ({ ...x, [m.id]: { type: 'IMAGE' } }));
        img.src = m.url;
      }
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [media.map((m) => m.id).join(',')]);
  return media.map((m) => meta[m.id] ?? { type: m.type });
}

export const scoreColor = (s: number) => (s >= 85 ? '#16A34A' : s >= 70 ? '#2563EB' : s >= 50 ? '#D97706' : '#DC2626');
