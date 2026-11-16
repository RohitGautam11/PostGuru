import { Image as ImageIcon } from 'lucide-react';
import { MediaThumb } from '@/components/media-picker';
import { GradientAvatar } from '@/components/ui';
import { C } from '@/lib/design';
import type { AccountRef, PostMedia, Provider } from '@/lib/types';

/** Platform-styled post preview ("T9" in the design), rendered with the real account and media. */
export function PlatformPreview({
  provider,
  account,
  content,
  media,
  title,
}: {
  provider: Provider;
  account?: AccountRef;
  content: string;
  media: PostMedia[];
  title?: string;
}) {
  const name = account?.name ?? 'Your account';
  const handle = account?.username ? (account.username.startsWith('@') ? account.username : `@${account.username}`) : '';
  const first = media[0];

  const mediaBlock = (height: number, emptyText?: string) =>
    first ? (
      <MediaThumb url={first.url} type={first.type} className="w-full" style={{ height }} />
    ) : emptyText ? (
      <div className="flex items-center justify-center" style={{ height, background: '#F8FAFC' }}>
        <div className="text-center">
          <ImageIcon size={32} color={C.ghost} className="mx-auto" />
          <p style={{ fontSize: 12, color: C.ghost, marginTop: 8 }}>{emptyText}</p>
        </div>
      </div>
    ) : null;

  if (provider === 'X') {
    return (
      <div className="rounded-xl p-4" style={{ border: `1px solid ${C.border2}`, background: '#fff' }}>
        <div className="flex items-start gap-3">
          <GradientAvatar name={name} src={account?.avatarUrl} size={40} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>{name}</span>
              <span style={{ fontSize: 13, color: C.muted }}>{handle} · now</span>
            </div>
            <p style={{ fontSize: 14, color: C.ink, marginTop: 4, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {content || <span style={{ color: C.faint }}>Start typing to see your preview...</span>}
            </p>
            {first && (
              <div className="mt-3 overflow-hidden rounded-xl" style={{ border: `1px solid ${C.border2}` }}>
                {mediaBlock(180)}
              </div>
            )}
            <div className="mt-3 flex items-center gap-5" style={{ color: C.muted }}>
              {['💬', '🔁', '❤️', '📊'].map((e) => (
                <span key={e} style={{ fontSize: 13 }}>
                  {e} 0
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (provider === 'INSTAGRAM') {
    return (
      <div className="overflow-hidden rounded-xl" style={{ border: `1px solid ${C.border2}`, background: '#fff' }}>
        <div className="flex items-center gap-3 px-4 py-3">
          {account?.avatarUrl ? (
            <GradientAvatar name={name} src={account.avatarUrl} size={36} />
          ) : (
            <div className="flex flex-shrink-0 items-center justify-center rounded-full" style={{ width: 36, height: 36, background: 'linear-gradient(45deg, #f09433, #dc2743, #bc1888)' }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: '#fff' }}>{name.slice(0, 2).toUpperCase()}</span>
            </div>
          )}
          <p style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{account?.username ?? name}</p>
        </div>
        <div style={{ borderTop: `1px solid ${C.line}`, borderBottom: `1px solid ${C.line}` }}>{mediaBlock(220, 'No media added — Instagram requires an image or video')}</div>
        <div className="px-4 py-3">
          <p style={{ fontSize: 13, color: C.ink, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            <span style={{ fontWeight: 700 }}>{account?.username ?? name} </span>
            {content || <span style={{ color: C.faint }}>Your caption will appear here...</span>}
          </p>
        </div>
      </div>
    );
  }

  if (provider === 'YOUTUBE') {
    return (
      <div className="overflow-hidden rounded-xl" style={{ border: `1px solid ${C.border2}`, background: '#fff' }}>
        {first?.type === 'VIDEO' ? (
          <MediaThumb url={first.url} type="VIDEO" className="aspect-video w-full" />
        ) : (
          <div className="flex aspect-video items-center justify-center" style={{ background: '#F8FAFC' }}>
            <p style={{ fontSize: 12, color: C.ghost }}>YouTube requires a video</p>
          </div>
        )}
        <div className="flex gap-3 p-4">
          <GradientAvatar name={name} src={account?.avatarUrl} size={36} />
          <div className="min-w-0">
            <p className="line-clamp-2-safe" style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>
              {title || content.split('\n')[0] || 'Video title'}
            </p>
            <p style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{name} · 0 views · just now</p>
          </div>
        </div>
      </div>
    );
  }

  // Facebook & LinkedIn
  return (
    <div className="overflow-hidden rounded-xl" style={{ border: `1px solid ${C.border2}`, background: '#fff' }}>
      <div className="flex items-center gap-3 px-4 py-3">
        <GradientAvatar name={name} src={account?.avatarUrl} size={40} />
        <div>
          <p style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{name}</p>
          <p style={{ fontSize: 11, color: C.muted }}>{provider === 'LINKEDIN' ? 'Company · now · 🌐' : 'Just now · 🌐'}</p>
        </div>
      </div>
      <div className="px-4 pb-3">
        <p style={{ fontSize: 13, color: C.ink, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {content || <span style={{ color: C.faint }}>Your post content will appear here...</span>}
        </p>
      </div>
      {first && <div style={{ borderTop: `1px solid ${C.line}` }}>{mediaBlock(200)}</div>}
      <div className="flex items-center gap-4 px-4 py-2.5" style={{ borderTop: `1px solid ${C.line}` }}>
        {['👍 Like', '💬 Comment', provider === 'LINKEDIN' ? '🔁 Repost' : '↗️ Share'].map((a) => (
          <span key={a} style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>
            {a}
          </span>
        ))}
      </div>
    </div>
  );
}
