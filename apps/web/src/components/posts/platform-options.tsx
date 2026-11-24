'use client';

import { Crop, Hash, ListOrdered } from 'lucide-react';
import { Toggle } from '@/components/ui';
import { C } from '@/lib/design';
import type { Provider } from '@/lib/types';

export interface PlatformOptionsState {
  xThread: boolean;
  hashtagsFirstComment: boolean;
  firstComment: string;
}

/** Mirrors the API's thread splitter (apps/api/src/common/thread.ts) for the live part count. */
export function splitThread(text: string, limit = 280): string[] {
  const clean = text.trim();
  if ([...clean].length <= limit) return [clean];
  const room = limit - 6;
  const tokens = clean.split(/(\s+)/).filter((w) => w !== '');
  const parts: string[] = [];
  let cur = '';
  for (const w of tokens) {
    if ([...(cur + w)].length <= room) {
      cur += w;
      continue;
    }
    if (cur.trim()) parts.push(cur.trim());
    let rest = w.trim();
    while ([...rest].length > room) {
      parts.push([...rest].slice(0, room).join(''));
      rest = [...rest].slice(room).join('');
    }
    cur = rest;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts.length > 1 ? parts.map((p, i) => `${p} ${i + 1}/${parts.length}`) : parts;
}

const hashtagCount = (text: string) => (text.match(/(^|\s)#[\p{L}\p{N}_]+/gu) ?? []).length;

/** Instagram feed accepts 4:5 to 1.91:1; Reels/Stories are 9:16. Flags images outside 4:5–1.91:1. */
function ratioWarnings(meta: { type: string; width?: number; height?: number }[]) {
  const out: string[] = [];
  for (const m of meta) {
    if (!m.width || !m.height) continue;
    const r = m.width / m.height;
    if (m.type === 'IMAGE' && (r < 0.8 - 0.01 || r > 1.91 + 0.01)) {
      out.push(`An image is ${m.width}×${m.height}. Instagram feed posts need 4:5 (portrait) to 1.91:1 (landscape); crop it to 4:5 (1080×1350) for the most reach.`);
    }
    if (m.type === 'VIDEO' && Math.abs(r - 9 / 16) > 0.05) {
      out.push(`A video is ${m.width}×${m.height}. Videos publish as Reels; vertical 9:16 (1080×1920) fills the screen.`);
    }
  }
  return [...new Set(out)];
}

export function PlatformOptions({
  providers,
  content,
  value,
  onChange,
  mediaMeta,
  disabled,
}: {
  providers: Provider[];
  content: string;
  value: PlatformOptionsState;
  onChange: (v: PlatformOptionsState) => void;
  mediaMeta: { type: string; width?: number; height?: number }[];
  disabled?: boolean;
}) {
  const hasX = providers.includes('X');
  const hasFirstComment = providers.includes('INSTAGRAM') || providers.includes('FACEBOOK');
  const parts = hasX ? splitThread(content) : [];
  const tags = hashtagCount(content);
  const warnings = providers.includes('INSTAGRAM') ? ratioWarnings(mediaMeta) : [];
  if (!hasX && !hasFirstComment && !warnings.length) return null;

  const row = 'flex items-start justify-between gap-4 py-3';
  return (
    <div className="mt-4 rounded-xl px-4" style={{ border: `1px solid ${C.border2}`, background: '#FAFBFD' }}>
      {hasX && (
        <div className={row}>
          <div className="flex items-start gap-2.5">
            <ListOrdered size={15} color={C.muted} className="mt-0.5 flex-shrink-0" />
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>X: post long text as a thread</p>
              <p style={{ fontSize: 12, color: C.faint, marginTop: 2 }}>
                {parts.length > 1
                  ? value.xThread
                    ? `Will publish as ${parts.length} numbered posts (280 characters each).`
                    : `Your text is over 280 characters. Turn this on to split it into ${parts.length} posts.`
                  : 'Short posts publish as a single tweet.'}
              </p>
            </div>
          </div>
          <Toggle value={value.xThread} onChange={(v) => onChange({ ...value, xThread: v })} disabled={disabled} />
        </div>
      )}
      {hasFirstComment && (
        <div className={row} style={{ borderTop: hasX ? `1px solid ${C.line}` : undefined }}>
          <div className="flex min-w-0 flex-1 items-start gap-2.5">
            <Hash size={15} color={C.muted} className="mt-0.5 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>Instagram / Facebook: move hashtags to the first comment</p>
              <p style={{ fontSize: 12, color: C.faint, marginTop: 2 }}>
                {tags ? `${tags} hashtag${tags === 1 ? '' : 's'} will be posted as the first comment, keeping the caption clean.` : 'Keeps captions clean; add #hashtags to your text to use it.'}
              </p>
              <input
                value={value.firstComment}
                onChange={(e) => onChange({ ...value, firstComment: e.target.value })}
                disabled={disabled}
                maxLength={2200}
                placeholder="Optional first comment (e.g. a link or a question)"
                className="mt-2 w-full rounded-lg bg-white px-3 py-2 outline-none focus:border-[#2563EB]"
                style={{ fontSize: 12.5, border: `1px solid ${C.border2}`, color: C.ink }}
              />
            </div>
          </div>
          <Toggle value={value.hashtagsFirstComment} onChange={(v) => onChange({ ...value, hashtagsFirstComment: v })} disabled={disabled} />
        </div>
      )}
      {warnings.map((w) => (
        <div key={w} className="flex items-start gap-2.5 py-3" style={{ borderTop: `1px solid ${C.line}` }}>
          <Crop size={15} color={C.amber} className="mt-0.5 flex-shrink-0" />
          <p style={{ fontSize: 12, color: C.slate, lineHeight: 1.5 }}>{w}</p>
        </div>
      ))}
    </div>
  );
}
