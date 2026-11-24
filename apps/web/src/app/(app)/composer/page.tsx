'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { addDays, format } from 'date-fns';
import {
  ArrowLeft,
  AtSign,
  CalendarDays,
  CircleAlert,
  CircleCheckBig,
  Clock,
  FileText,
  FolderOpen,
  Hash,
  Image as ImageIcon,
  Link as LinkIcon,
  Plus,
  Send,
  Smile,
  Upload,
  X,
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { GrowthAssistant } from '@/components/growth/growth-assistant';
import { MediaPicker, MediaThumb } from '@/components/media-picker';
import { useMediaMeta } from '@/lib/growth';
import { PlatformPreview } from '@/components/posts/platform-preview';
import { PlatformOptions, type PlatformOptionsState } from '@/components/posts/platform-options';
import { Btn, Card, Dropdown, MenuItem, PageLoader, StatusPill } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { C, CARD_SHADOW, colorFor } from '@/lib/design';
import { useAccounts, useCan, useMe } from '@/lib/hooks';
import { PLATFORMS, PlatformGlyph } from '@/lib/platforms';
import type { Post, PostMedia, Provider, SocialAccount } from '@/lib/types';
import { ACCEPTED_MEDIA, uploadFile } from '@/lib/upload';
import { charCount, initials } from '@/lib/utils';

type Mode = 'now' | 'schedule' | 'draft';
const EMOJIS = ['😀', '😂', '😍', '🥳', '🔥', '🚀', '✨', '🎉', '👏', '🙌', '💯', '❤️', '👉', '✅', '📣', '💡', '📅', '🎯', '👇', '🙏', '💪', '🌟', '📈', '🤝'];
const label = { fontSize: 12, fontWeight: 700, color: C.faint, textTransform: 'uppercase' as const, letterSpacing: '0.07em', marginBottom: 12 };

function issuesFor(accounts: SocialAccount[], content: string, media: PostMedia[], link: string, xThread = false) {
  const out: string[] = [];
  const images = media.filter((m) => m.type === 'IMAGE').length;
  const videos = media.filter((m) => m.type === 'VIDEO').length;
  for (const a of accounts) {
    const caps = a.capabilities;
    const name = `${PLATFORMS[a.provider].short} (${a.name})`;
    const full = link && !content.includes(link) ? `${content} ${link}` : content;
    if (a.status !== 'CONNECTED') out.push(`${name}: reconnect this account first`);
    if (!(a.provider === 'X' && xThread) && charCount(full, a.provider) > caps.maxChars) out.push(`${name}: over ${caps.maxChars.toLocaleString()} characters`);
    if (caps.requiresVideo && !videos) out.push(`${name}: add a video`);
    else if (caps.requiresMedia && !media.length) out.push(`${name}: add an image or video`);
    if (images > caps.maxImages && !caps.requiresVideo) out.push(`${name}: max ${caps.maxImages} images`);
    if (videos && images && a.provider !== 'INSTAGRAM') out.push(`${name}: can't mix images and video`);
    if (videos > 1 && a.provider !== 'INSTAGRAM') out.push(`${name}: only one video per post`);
  }
  if (!content.trim() && !media.length) out.push('Write something or add media');
  return out;
}

/** Next local date/time matching the best UTC weekday/hour from analytics. */
function nextSlot(day: number, hour: number) {
  const now = new Date();
  for (let i = 0; i < 8; i++) {
    const d = addDays(now, i);
    const c = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hour, 0));
    if (c.getUTCDay() === day && c.getTime() > now.getTime() + 10 * 60_000) return c;
  }
  return null;
}

function Composer() {
  const router = useRouter();
  const params = useSearchParams();
  const postId = params.get('id') ?? undefined;
  const qc = useQueryClient();
  const canEdit = useCan('EDITOR');
  const { data: me } = useMe();
  const { data: accounts, isLoading: loadingAccounts } = useAccounts();
  const { data: existing, isLoading: loadingPost } = useQuery({ queryKey: ['post', postId], queryFn: () => api<Post>(`/posts/${postId}`), enabled: !!postId });
  const { data: heat } = useQuery({
    queryKey: ['analytics', 'heat'],
    queryFn: () => api<{ heatmap: { day: number; hour: number; engagement: number; posts: number }[] }>('/analytics/overview', { query: { days: 30 } }),
    staleTime: 10 * 60_000,
  });

  const initialDate = params.get('date');
  const start = initialDate ? new Date(initialDate) : addDays(new Date(), 1);
  const [content, setContent] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [media, setMedia] = useState<PostMedia[]>([]);
  const [link, setLink] = useState('');
  const [showLink, setShowLink] = useState(false);
  const [ytTitle, setYtTitle] = useState('');
  const [ytTags, setYtTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState('');
  const [opts, setOpts] = useState<PlatformOptionsState>({ xThread: false, hashtagsFirstComment: false, firstComment: '' });
  const [mode, setMode] = useState<Mode>('schedule');
  const [date, setDate] = useState(format(start, 'yyyy-MM-dd'));
  const [time, setTime] = useState(initialDate ? format(start, 'HH:mm') : '10:00');
  const [preview, setPreview] = useState<Provider | null>(null);
  const [uploading, setUploading] = useState<number | null>(null);
  const [library, setLibrary] = useState(false);
  const [emoji, setEmoji] = useState(false);
  const [done, setDone] = useState<Post | null>(null);
  const [lastMode, setLastMode] = useState<Mode>('schedule');
  const [tried, setTried] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const initialised = useRef(false);

  // Default selection: every connected account (new post) or the post's targets (edit).
  useEffect(() => {
    if (initialised.current) return;
    if (postId && existing) {
      setContent(existing.content);
      setSelected(existing.targets.map((t) => t.socialAccount.id));
      setMedia(existing.media ?? []);
      setLink(existing.link ?? '');
      setShowLink(!!existing.link);
      setYtTitle(existing.overrides?.YOUTUBE?.title ?? '');
      setYtTags(existing.overrides?.YOUTUBE?.tags ?? []);
      const ig = existing.overrides?.INSTAGRAM ?? existing.overrides?.FACEBOOK;
      setOpts({
        xThread: !!existing.overrides?.X?.thread,
        hashtagsFirstComment: !!ig?.hashtagsInFirstComment,
        firstComment: ig?.firstComment ?? '',
      });
      if (existing.scheduledAt) {
        const d = new Date(existing.scheduledAt);
        setDate(format(d, 'yyyy-MM-dd'));
        setTime(format(d, 'HH:mm'));
      }
      setMode(existing.status === 'DRAFT' ? 'draft' : 'schedule');
      initialised.current = true;
    } else if (!postId && accounts) {
      // ?quote=<post url>&account=<id> comes from Inbox → Quote: quote the post from that account.
      const quote = params.get('quote');
      const fromAccount = accounts.find((a) => a.id === params.get('account') && a.status === 'CONNECTED');
      setSelected(fromAccount ? [fromAccount.id] : accounts.filter((a) => a.status === 'CONNECTED').map((a) => a.id));
      if (quote && /^https:\/\/(x|twitter)\.com\//.test(quote)) setContent(`\n\n${quote}`);
      // ?draft=1 comes from Growth Hub → "Create post from this idea".
      if (params.get('draft')) {
        try {
          const d = sessionStorage.getItem('composer-draft');
          if (d) setContent(d);
          sessionStorage.removeItem('composer-draft');
        } catch {
          /* storage unavailable */
        }
      }
      initialised.current = true;
    }
  }, [postId, existing, accounts, params]);

  const chosen = useMemo(() => (accounts ?? []).filter((a) => selected.includes(a.id)), [accounts, selected]);
  const providers = useMemo(() => [...new Set(chosen.map((a) => a.provider))], [chosen]);
  const active = preview && providers.includes(preview) ? preview : providers[0];
  const activeAccount = chosen.find((a) => a.provider === active);
  const limit = activeAccount?.capabilities.maxChars ?? 2200;
  const used = charCount(link && !content.includes(link) ? `${content} ${link}` : content, active ?? '');
  const ratio = Math.min(used / limit, 1);
  const issues = issuesFor(chosen, content, media, link, opts.xThread);
  const locked = existing && ['PUBLISHING', 'PUBLISHED', 'PARTIAL'].includes(existing.status);
  const scheduledAt = new Date(`${date}T${time}`);
  const scheduleInvalid = mode === 'schedule' && (Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() < Date.now() - 60_000);
  const invalid = mode !== 'draft' && (issues.length > 0 || scheduleInvalid);
  const blocked = !selected.length;
  const showIssues = mode !== 'draft' && issues.length > 0 && selected.length > 0 && (tried || content.trim().length > 0 || media.length > 0);
  const submit = () => {
    if (invalid) {
      setTried(true);
      toast.error(scheduleInvalid && !issues.length ? 'Pick a time in the future' : 'Fix the highlighted issues before publishing');
      return;
    }
    save.mutate(mode);
  };

  const best = useMemo(() => {
    const cells = heat?.heatmap?.filter((h) => h.posts > 0) ?? [];
    if (!cells.length) return null;
    const top = cells.reduce((a, b) => (b.engagement > a.engagement ? b : a));
    const when = nextSlot(top.day, top.hour);
    return when ? { when, avg: top.engagement } : null;
  }, [heat]);

  const save = useMutation({
    mutationFn: (m: Mode) => {
      const action = m === 'now' ? 'publish' : m;
      const body = {
        content,
        accountIds: selected,
        mediaIds: media.map((x) => x.id),
        link: link.trim() || undefined,
        overrides: buildOverrides(),
        action,
        scheduledAt: m === 'schedule' || (m === 'draft' && !Number.isNaN(scheduledAt.getTime())) ? scheduledAt.toISOString() : undefined,
      };
      return postId ? api<Post>(`/posts/${postId}`, { method: 'PUT', body }) : api<Post>('/posts', { method: 'POST', body });
    },
    onSuccess: (post, m) => {
      for (const k of ['posts', 'planner', 'dashboard', 'post']) qc.invalidateQueries({ queryKey: [k] });
      setLastMode(m);
      if (m === 'now' && post.status === 'FAILED') {
        toast.error(post.targets.find((t) => t.error)?.error ?? 'Publishing failed');
        router.push(`/posts/${post.id}`);
        return;
      }
      setDone(post);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  /** Per-platform settings: YouTube title/tags, X thread, Instagram/Facebook first comment. */
  function buildOverrides() {
    const out: Record<string, Record<string, unknown>> = {};
    if (ytTitle.trim() || ytTags.length) out.YOUTUBE = { ...(ytTitle.trim() ? { title: ytTitle.trim() } : {}), ...(ytTags.length ? { tags: ytTags } : {}) };
    if (opts.xThread && providers.includes('X')) out.X = { thread: true };
    const fc = opts.firstComment.trim();
    if (opts.hashtagsFirstComment || fc) {
      for (const p of ['INSTAGRAM', 'FACEBOOK'] as const) {
        if (providers.includes(p)) out[p] = { ...(opts.hashtagsFirstComment ? { hashtagsInFirstComment: true } : {}), ...(fc ? { firstComment: fc } : {}) };
      }
    }
    return Object.keys(out).length ? out : undefined;
  }

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    for (const file of Array.from(files)) {
      setUploading(0);
      try {
        const a = await uploadFile(file, setUploading);
        setMedia((m) => [...m, { id: a.id, url: a.url, type: a.type, mimeType: a.mimeType, size: a.size }]);
      } catch (e) {
        toast.error(`${file.name}: ${errorMessage(e)}`);
      }
    }
    setUploading(null);
    qc.invalidateQueries({ queryKey: ['media'] });
  }

  const mediaMeta = useMediaMeta(media);

  /** Appends hashtags that are not already in the post, on a trailing hashtag line. */
  function addHashtags(tags: string[]) {
    setContent((c) => {
      const have = new Set((c.match(/#[\p{L}\p{N}_]+/gu) ?? []).map((t) => t.slice(1).toLowerCase()));
      const fresh = tags.map((t) => t.replace(/^#/, '').replace(/\s+/g, '')).filter((t) => t && !have.has(t.toLowerCase()));
      if (!fresh.length) return c;
      const add = fresh.map((t) => `#${t}`).join(' ');
      const lastLine = c.trimEnd().split('\n').pop() ?? '';
      return /^(#[\p{L}\p{N}_]+\s*)+$/u.test(lastLine.trim()) ? `${c.trimEnd()} ${add}` : `${c.trimEnd()}${c.trim() ? '\n\n' : ''}${add}`;
    });
  }

  function addYtTags(list: string[]) {
    setYtTags((t) => {
      const out = [...t];
      for (const raw of list) {
        const v = raw.replace(/^#/, '').trim();
        if (v && !out.some((x) => x.toLowerCase() === v.toLowerCase()) && out.join('').length + v.length <= 480) out.push(v);
      }
      return out;
    });
  }

  function insert(snippet: string) {
    const el = textRef.current;
    if (!el) return setContent((c) => c + snippet);
    const s = el.selectionStart ?? content.length;
    const next = content.slice(0, s) + snippet + content.slice(el.selectionEnd ?? s);
    setContent(next);
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = s + snippet.length;
    });
  }

  if ((postId && loadingPost) || loadingAccounts) return <PageLoader />;

  // ─── Success screen ─────────────────────────────────────────────────────
  if (done) {
    const published = lastMode === 'now';
    const scheduled = lastMode === 'schedule';
    const names = [...new Set(done.targets.map((t) => PLATFORMS[t.socialAccount.provider].short))].join(', ');
    return (
      <div className="flex items-center justify-center" style={{ minHeight: 'calc(100vh - 64px)', padding: '40px 28px' }}>
        <div className="text-center" style={{ maxWidth: 480 }}>
          <div
            className="mx-auto mb-6 flex items-center justify-center rounded-full"
            style={{
              width: 72,
              height: 72,
              background: published ? C.greenSoft : scheduled ? C.blueSoft : '#F8FAFC',
              border: `2px solid ${published ? C.greenBorder : scheduled ? C.blueBorder : C.border2}`,
            }}
          >
            {published ? <CircleCheckBig size={32} color={C.green} /> : scheduled ? <CalendarDays size={32} color={C.blue} /> : <FileText size={32} color={C.muted} />}
          </div>
          <h2 style={{ fontSize: 26, fontWeight: 800, color: C.ink, letterSpacing: '-0.035em' }}>
            {published ? (done.status === 'PARTIAL' ? 'Partially published' : 'Post published!') : scheduled ? 'Post scheduled!' : 'Draft saved!'}
          </h2>
          <p style={{ fontSize: 15, color: C.muted, marginTop: 8 }}>
            {published
              ? done.status === 'PARTIAL'
                ? 'Some platforms rejected the post. Open it to see the details and retry.'
                : `Your post is now live on ${names}.`
              : scheduled
                ? `Scheduled for ${format(new Date(done.scheduledAt!), "MMM d, yyyy 'at' h:mm a")} across ${done.targets.length} account${done.targets.length > 1 ? 's' : ''}.`
                : 'Your draft has been saved. You can come back to edit it anytime.'}
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <button onClick={() => router.push(published ? `/posts/${done.id}` : '/planner')} className="flex items-center gap-2 rounded-xl px-5 py-2.5 transition-all hover:bg-[#EFF6FF]" style={{ fontSize: 13, fontWeight: 600, color: C.blue, border: `1px solid ${C.blueBorder}`, background: '#fff' }}>
              <CalendarDays size={14} /> {published ? 'View post' : 'View in Planner'}
            </button>
            <button
              onClick={() => {
                setDone(null);
                setContent('');
                setMedia([]);
                setLink('');
                setYtTitle('');
                setYtTags([]);
                if (postId) router.replace('/composer');
              }}
              className="flex items-center gap-2 rounded-xl px-5 py-2.5 transition-all hover:opacity-90"
              style={{ fontSize: 13, fontWeight: 600, color: '#fff', background: C.blue }}
            >
              <Plus size={14} /> Create another
            </button>
          </div>
          <button onClick={() => router.push('/dashboard')} className="mx-auto mt-4 flex items-center gap-1 transition-opacity hover:opacity-70" style={{ fontSize: 13, color: C.faint }}>
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const ws = me?.workspace;
  const wsColor = colorFor(ws?.id ?? 'w');

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-[1400px]">
        <div className="mb-6 flex items-center gap-4">
          <button onClick={() => router.back()} className="flex flex-shrink-0 items-center justify-center rounded-xl transition-colors hover:bg-white" style={{ width: 36, height: 36, border: `1px solid ${C.border2}` }} aria-label="Back">
            <ArrowLeft size={16} color={C.muted} />
          </button>
          <div className="min-w-0">
            <h1 style={{ fontSize: 20, fontWeight: 800, color: C.ink, letterSpacing: '-0.03em' }}>{postId ? 'Edit Post' : 'New Post'}</h1>
            <p style={{ fontSize: 13, color: C.faint }}>Create and schedule content across your channels</p>
          </div>
          <div className="ml-auto">
            {existing ? (
              <StatusPill status={existing.status} />
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1" style={{ fontSize: 11, fontWeight: 700, color: C.muted, background: '#F8FAFC', border: `1px solid ${C.border2}` }}>
                <span className="h-1.5 w-1.5 rounded-full bg-[#94A3B8]" /> Draft
              </span>
            )}
          </div>
        </div>

        {locked && (
          <div className="mb-6 flex items-center gap-3 rounded-2xl px-5 py-4" style={{ background: C.amberSoft, border: `1px solid ${C.amberBorder}` }}>
            <CircleAlert size={16} color={C.amber} />
            <p style={{ fontSize: 13, color: '#92400E' }}>This post has already been published and can&apos;t be edited. Duplicate it from the post details to reuse it.</p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
          {/* Left column */}
          <div className="flex min-w-0 flex-col gap-4">
            <Card className="p-6">
              <p style={label}>Post to</p>
              {!accounts?.length ? (
                <div className="flex flex-wrap items-center gap-3">
                  <span style={{ fontSize: 13, color: C.muted }}>Connect a social account to start publishing.</span>
                  <Btn size="sm" onClick={() => router.push('/connect')}>
                    <Plus size={12} /> Connect account
                  </Btn>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  {accounts.map((a) => {
                    const p = PLATFORMS[a.provider];
                    const on = selected.includes(a.id);
                    const disabled = !!locked || !canEdit || a.status !== 'CONNECTED';
                    return (
                      <button
                        key={a.id}
                        disabled={disabled}
                        onClick={() => setSelected((s) => (on ? s.filter((x) => x !== a.id) : [...s, a.id]))}
                        title={a.status !== 'CONNECTED' ? 'Reconnect this account to publish' : `${p.label} · ${a.name}`}
                        className="flex items-center gap-2 rounded-xl px-3 py-2 transition-all disabled:cursor-not-allowed disabled:opacity-50"
                        style={{ fontSize: 13, fontWeight: 600, color: on ? p.color : C.muted, background: on ? p.bg : '#F8FAFC', border: `1.5px solid ${on ? p.border : C.border2}` }}
                      >
                        <span style={{ color: on ? p.color : C.faint }}>
                          <PlatformGlyph provider={a.provider} size={14} />
                        </span>
                        <span className="max-w-[160px] truncate">{accounts.filter((x) => x.provider === a.provider).length > 1 ? a.name : p.label}</span>
                        {on && <X size={12} strokeWidth={2.5} color={p.color} />}
                      </button>
                    );
                  })}
                  {!selected.length && <span style={{ fontSize: 12, color: C.red }}>Select at least one platform</span>}
                </div>
              )}
            </Card>

            <Card className="overflow-hidden">
              <div className="p-6">
                {providers.includes('YOUTUBE') && (
                  <input
                    value={ytTitle}
                    onChange={(e) => setYtTitle(e.target.value)}
                    maxLength={100}
                    disabled={!!locked}
                    placeholder="YouTube video title (defaults to the first line)"
                    className="mb-3 w-full rounded-xl px-3 py-2 outline-none focus:border-[#2563EB]"
                    style={{ fontSize: 13, border: `1px solid ${C.border2}`, background: '#F8FAFC', color: C.ink }}
                  />
                )}
                {providers.includes('YOUTUBE') && (
                  <div className="mb-3 flex flex-wrap items-center gap-1.5 rounded-xl px-3 py-2" style={{ border: `1px solid ${C.border2}`, background: '#F8FAFC' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: C.faint }}>YouTube tags</span>
                    {ytTags.map((t) => (
                      <span key={t} className="flex items-center gap-1 rounded-full bg-white px-2 py-0.5" style={{ fontSize: 12, color: C.slate, border: `1px solid ${C.border2}` }}>
                        {t}
                        {!locked && (
                          <button onClick={() => setYtTags((x) => x.filter((y) => y !== t))} aria-label={`Remove ${t}`}>
                            <X size={10} color={C.faint} />
                          </button>
                        )}
                      </span>
                    ))}
                    <input
                      value={tagDraft}
                      disabled={!!locked}
                      onChange={(e) => setTagDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if ((e.key === 'Enter' || e.key === ',') && tagDraft.trim()) {
                          e.preventDefault();
                          addYtTags(tagDraft.split(','));
                          setTagDraft('');
                        }
                      }}
                      onBlur={() => {
                        if (tagDraft.trim()) addYtTags(tagDraft.split(','));
                        setTagDraft('');
                      }}
                      placeholder={ytTags.length ? 'Add tag…' : 'keyword, another keyword… (Enter to add)'}
                      className="min-w-[140px] flex-1 bg-transparent outline-none"
                      style={{ fontSize: 12, color: C.ink }}
                    />
                  </div>
                )}
                <textarea
                  ref={textRef}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  disabled={!!locked || !canEdit}
                  placeholder="Write your post content here... Use #hashtags and @mentions to boost reach."
                  className="w-full resize-none bg-transparent outline-none"
                  style={{ fontSize: 14, color: C.ink, lineHeight: 1.7, minHeight: 160 }}
                  rows={7}
                />
                {showLink && (
                  <div className="mt-2 flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: '#F8FAFC', border: `1px solid ${C.border2}` }}>
                    <LinkIcon size={13} color={C.faint} />
                    <input value={link} onChange={(e) => setLink(e.target.value)} type="url" placeholder="https://example.com/article" className="flex-1 bg-transparent outline-none" style={{ fontSize: 13, color: C.ink }} disabled={!!locked} />
                    <button onClick={() => { setLink(''); setShowLink(false); }} aria-label="Remove link">
                      <X size={12} color={C.faint} />
                    </button>
                  </div>
                )}
                <PlatformOptions providers={providers} content={content} value={opts} onChange={setOpts} mediaMeta={mediaMeta} disabled={!!locked || !canEdit} />
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 pt-3" style={{ borderTop: `1px solid ${C.line}` }}>
                  <div className="flex items-center gap-2">
                    <div className="relative flex items-center justify-center" style={{ width: 28, height: 28 }}>
                      <svg width="28" height="28" viewBox="0 0 28 28" className="rotate-[-90deg]">
                        <circle cx="14" cy="14" r="11" fill="none" stroke="#F1F5F9" strokeWidth="3" />
                        <circle cx="14" cy="14" r="11" fill="none" stroke={ratio > 0.9 ? C.red : C.blue} strokeWidth="3" strokeDasharray={`${Math.PI * 22 * ratio} ${Math.PI * 22}`} strokeLinecap="round" />
                      </svg>
                    </div>
                    <span style={{ fontSize: 12, color: ratio > 0.9 ? C.red : C.muted, fontWeight: 500 }}>
                      {used.toLocaleString()} / {limit.toLocaleString()} {active ? `(${PLATFORMS[active].short.toLowerCase()})` : ''}
                    </span>
                  </div>
                  {!locked && canEdit && (
                    <div className="relative flex items-center gap-1">
                      <input ref={fileRef} type="file" hidden multiple accept={ACCEPTED_MEDIA} onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }} />
                      <Dropdown
                        align="right"
                        width={200}
                        trigger={
                          <button title="Media" className="flex items-center justify-center rounded-lg transition-colors hover:bg-[#F8FAFC]" style={{ width: 32, height: 32 }}>
                            <ImageIcon size={14} color={media.length ? C.blue : C.faint} />
                          </button>
                        }
                      >
                        <div style={{ padding: '4px 0' }}>
                          <MenuItem icon={<Upload size={13} />} onClick={() => fileRef.current?.click()}>
                            Upload from computer
                          </MenuItem>
                          <MenuItem icon={<FolderOpen size={13} />} onClick={() => setLibrary(true)}>
                            Choose from library
                          </MenuItem>
                        </div>
                      </Dropdown>
                      <button title="Emoji" onClick={() => setEmoji((v) => !v)} className="flex items-center justify-center rounded-lg transition-colors hover:bg-[#F8FAFC]" style={{ width: 32, height: 32 }}>
                        <Smile size={14} color={emoji ? C.blue : C.faint} />
                      </button>
                      <button title="Hashtag" onClick={() => insert('#')} className="flex items-center justify-center rounded-lg transition-colors hover:bg-[#F8FAFC]" style={{ width: 32, height: 32 }}>
                        <Hash size={14} color={C.faint} />
                      </button>
                      <button title="Mention" onClick={() => insert('@')} className="flex items-center justify-center rounded-lg transition-colors hover:bg-[#F8FAFC]" style={{ width: 32, height: 32 }}>
                        <AtSign size={14} color={C.faint} />
                      </button>
                      <button title="Link" onClick={() => setShowLink((v) => !v)} className="flex items-center justify-center rounded-lg transition-colors hover:bg-[#F8FAFC]" style={{ width: 32, height: 32 }}>
                        <LinkIcon size={14} color={showLink ? C.blue : C.faint} />
                      </button>
                      {emoji && (
                        <div className="absolute bottom-10 right-0 z-30 grid grid-cols-8 gap-1 rounded-2xl bg-white p-2" style={{ width: 280, border: '1px solid #EEF2F6', boxShadow: '0 8px 28px rgba(15,23,42,0.10)' }}>
                          {EMOJIS.map((e) => (
                            <button key={e} className="rounded-lg p-1 text-lg hover:bg-[#F8FAFC]" onClick={() => { insert(e); setEmoji(false); }}>
                              {e}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              {(media.length > 0 || uploading !== null) && (
                <div className="flex flex-wrap gap-2 px-6 pb-5">
                  {media.map((m) => (
                    <div key={m.id} className="relative overflow-hidden rounded-xl" style={{ width: 96, height: 80, border: '1.5px dashed #CBD5E1' }}>
                      <MediaThumb url={m.url} type={m.type} className="h-full w-full" />
                      {!locked && (
                        <button onClick={() => setMedia((x) => x.filter((y) => y.id !== m.id))} className="absolute right-1.5 top-1.5 flex items-center justify-center rounded-full bg-white/90 hover:bg-white" style={{ width: 20, height: 20 }} aria-label="Remove media">
                          <X size={11} color={C.muted} />
                        </button>
                      )}
                    </div>
                  ))}
                  {uploading !== null && (
                    <div className="flex flex-col items-center justify-center rounded-xl" style={{ width: 96, height: 80, background: '#F8FAFC', border: '1.5px dashed #CBD5E1' }}>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#2563EB]/20 border-t-[#2563EB]" />
                      <p style={{ fontSize: 11, color: C.faint, marginTop: 4 }}>{uploading}%</p>
                    </div>
                  )}
                </div>
              )}
            </Card>

            {!locked && canEdit && (
              <Card className="p-6">
                <p style={label}>When to publish</p>
                <div className="mb-4 grid grid-cols-3 gap-2">
                  {(
                    [
                      ['now', 'Publish Now', Send],
                      ['schedule', 'Schedule', Clock],
                      ['draft', 'Save Draft', FileText],
                    ] as const
                  ).map(([k, text, Icon]) => (
                    <button
                      key={k}
                      onClick={() => setMode(k)}
                      className="flex flex-col items-center gap-2 rounded-xl py-3 transition-all"
                      style={{ fontSize: 12, fontWeight: 600, color: mode === k ? C.blue : C.muted, background: mode === k ? C.blueSoft : '#F8FAFC', border: `1.5px solid ${mode === k ? C.blueBorder : C.border2}` }}
                    >
                      <Icon size={16} strokeWidth={2} />
                      {text}
                    </button>
                  ))}
                </div>
                {mode === 'schedule' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: C.slate2, display: 'block', marginBottom: 6 }}>Date</label>
                      <input type="date" value={date} min={format(new Date(), 'yyyy-MM-dd')} onChange={(e) => setDate(e.target.value)} className="w-full rounded-xl px-3 py-2 outline-none focus:border-[#2563EB]" style={{ fontSize: 13, border: `1px solid ${C.border2}`, background: '#F8FAFC', color: C.ink }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: C.slate2, display: 'block', marginBottom: 6 }}>Time</label>
                      <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-full rounded-xl px-3 py-2 outline-none focus:border-[#2563EB]" style={{ fontSize: 13, border: `1px solid ${C.border2}`, background: '#F8FAFC', color: C.ink }} />
                    </div>
                    <div className="col-span-2 flex flex-wrap items-center justify-between gap-2">
                      {best ? (
                        <button
                          onClick={() => {
                            setDate(format(best.when, 'yyyy-MM-dd'));
                            setTime(format(best.when, 'HH:mm'));
                          }}
                          className="flex items-center gap-1.5 text-left transition-opacity hover:opacity-70"
                          style={{ fontSize: 12, fontWeight: 600, color: C.blue }}
                        >
                          <Clock size={12} /> Best time suggestion: {format(best.when, 'EEEE h:mm a')} (avg {best.avg} engagements)
                        </button>
                      ) : (
                        <span style={{ fontSize: 12, color: C.faint }}>Times are in your local timezone ({Intl.DateTimeFormat().resolvedOptions().timeZone})</span>
                      )}
                      {scheduleInvalid && <span style={{ fontSize: 12, color: C.red }}>Pick a time in the future</span>}
                    </div>
                  </div>
                )}
              </Card>
            )}
          </div>

          {/* Right column */}
          <div className="flex flex-col gap-4">
            <Card className="overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${C.line}` }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>Preview</span>
                <div className="flex items-center gap-1">
                  {providers.map((p) => {
                    const s = PLATFORMS[p];
                    return (
                      <button
                        key={p}
                        onClick={() => setPreview(p)}
                        className="flex items-center justify-center rounded-lg transition-all"
                        style={{ width: 28, height: 28, background: active === p ? s.bg : 'transparent', border: active === p ? `1.5px solid ${s.border}` : '1.5px solid transparent', color: s.color }}
                        title={s.label}
                      >
                        <PlatformGlyph provider={p} size={14} />
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="p-4">
                {active ? (
                  <PlatformPreview provider={active} account={activeAccount} content={link && !content.includes(link) ? `${content}\n${link}`.trim() : content} media={media} title={ytTitle} />
                ) : (
                  <div className="flex items-center justify-center py-12 text-center">
                    <p style={{ fontSize: 13, color: C.ghost }}>Select a platform to see preview</p>
                  </div>
                )}
              </div>
            </Card>

            <GrowthAssistant
              content={content}
              providers={providers}
              media={mediaMeta}
              link={link}
              title={ytTitle}
              tags={ytTags}
              scheduledAt={mode === 'schedule' && !scheduleInvalid ? scheduledAt.toISOString() : undefined}
              disabled={!!locked || !canEdit}
              onAddHashtags={addHashtags}
              onReplaceContent={(t) => setContent(t)}
              onReplaceHook={(h) => setContent((c) => (c.includes('\n') ? `${h}\n${c.slice(c.indexOf('\n') + 1)}` : h))}
              onYoutube={(v) => {
                if (v.title) setYtTitle(v.title.slice(0, 100));
                if (v.description) setContent(v.description);
                if (v.tags) addYtTags(v.tags);
              }}
            />

            <Card className="p-4">
              <p style={{ ...label, marginBottom: 10 }}>Publishing as</p>
              <div className="flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5" style={{ border: `1px solid ${C.line2}`, boxShadow: '0 1px 2px rgba(15,23,42,0.04)' }}>
                <div className="flex flex-shrink-0 items-center justify-center rounded-lg" style={{ width: 28, height: 28, background: `${wsColor}18` }}>
                  <span style={{ fontSize: 9, fontWeight: 800, color: wsColor }}>{initials(ws?.name ?? '')}</span>
                </div>
                <div className="min-w-0 flex-1 text-left">
                  <p className="truncate" style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>
                    {ws?.name}
                  </p>
                  <p style={{ fontSize: 11, color: C.faint }}>
                    {selected.length} account{selected.length !== 1 ? 's' : ''} selected
                  </p>
                </div>
              </div>
            </Card>

            {!locked && canEdit && (
              <>
                {showIssues && (
                  <div className="rounded-2xl px-4 py-3" style={{ background: C.redSoft, border: `1px solid ${C.redBorder}` }}>
                    {issues.map((i) => (
                      <p key={i} className="flex items-start gap-2 py-0.5" style={{ fontSize: 12, color: C.red }}>
                        <CircleAlert size={12} className="mt-0.5 flex-shrink-0" /> {i}
                      </p>
                    ))}
                  </div>
                )}
                <div className="flex flex-col gap-2">
                  <button
                    onClick={submit}
                    disabled={blocked || save.isPending}
                    className="flex w-full items-center justify-center gap-2 rounded-xl py-3 transition-all hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed"
                    style={{ fontSize: 14, fontWeight: 600, color: '#fff', background: blocked ? '#CBD5E1' : C.blue, boxShadow: blocked ? 'none' : '0 1px 3px rgba(37,99,235,0.2)' }}
                  >
                    {save.isPending ? (
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    ) : mode === 'now' ? (
                      <>
                        <Send size={15} strokeWidth={2.5} /> Publish Now
                      </>
                    ) : mode === 'schedule' ? (
                      <>
                        <Clock size={15} strokeWidth={2.5} /> {postId ? 'Update Schedule' : 'Schedule Post'}
                      </>
                    ) : (
                      <>
                        <FileText size={15} strokeWidth={2.5} /> Save as Draft
                      </>
                    )}
                  </button>
                  <button onClick={() => router.push(postId ? `/posts/${postId}` : '/dashboard')} className="w-full rounded-xl py-2.5 transition-colors hover:bg-[#F8FAFC]" style={{ fontSize: 13, fontWeight: 600, color: C.muted, border: `1px solid ${C.border2}`, boxShadow: CARD_SHADOW }}>
                    Discard
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      <MediaPicker
        open={library}
        onClose={() => setLibrary(false)}
        max={10}
        onSelect={(assets) => setMedia((m) => [...m, ...assets.filter((a) => !m.some((x) => x.id === a.id)).map((a) => ({ id: a.id, url: a.url, type: a.type, mimeType: a.mimeType, size: a.size }))].slice(0, 10))}
      />
    </div>
  );
}

export default function ComposerPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Composer />
    </Suspense>
  );
}
