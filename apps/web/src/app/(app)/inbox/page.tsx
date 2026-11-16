'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  ArrowLeft,
  BookOpen,
  CheckCheck,
  ChevronDown,
  CircleAlert,
  Ellipsis,
  ExternalLink,
  Eye,
  EyeOff,
  Flag,
  Heart,
  Mail,
  MessageCircle,
  RefreshCw,
  Quote,
  Repeat2,
  Search,
  StickyNote,
  Send,
  Smile,
  ThumbsUp,
  Trash2,
  UserPlus,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Avatar, ConfirmDialog, Dropdown, MenuDivider, MenuItem, MenuLabel, PageLoader, Spinner } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { C, GRADIENT } from '@/lib/design';
import { useCan, useMe } from '@/lib/hooks';
import { PLATFORMS, PROVIDER_ORDER, PlatformBadge } from '@/lib/platforms';
import type { InboxThread, Provider, ThreadMessage, ThreadNote, ThreadType } from '@/lib/types';
import { cn, initials, shortAge } from '@/lib/utils';

const TYPES: Record<ThreadType, { label: string; color: string }> = {
  comment: { label: 'Comment', color: C.blue },
  dm: { label: 'DM', color: C.violet },
  mention: { label: 'Mention', color: C.orange },
  reply: { label: 'Reply', color: C.muted },
  page_message: { label: 'Message', color: '#0A66C2' },
};
const SENTIMENT = {
  positive: { color: C.green, label: 'Positive' },
  neutral: { color: C.amber, label: 'Neutral' },
  negative: { color: C.red, label: 'Negative' },
};
type Filter = 'all' | 'unread' | 'comments' | 'dms' | 'mentions' | 'muted';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'comments', label: 'Comments' },
  { id: 'dms', label: 'DMs' },
  { id: 'mentions', label: 'Mentions' },
  { id: 'muted', label: 'Muted' },
];
const isDm = (t: { type: ThreadType }) => t.type === 'dm' || t.type === 'page_message';

interface ThreadDetail extends InboxThread {
  messages: ThreadMessage[];
  notes: ThreadNote[];
}

// ─── Internal notes ─────────────────────────────────────────────────────────
/** Team-only notes on a thread (never sent to the platform). */
function NotesSection({ t, canAct }: { t: ThreadDetail; canAct: boolean }) {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const isAdmin = useCan('ADMIN');
  const [text, setText] = useState('');
  const refresh = () => qc.invalidateQueries({ queryKey: ['inbox-thread', t.id] });
  const add = useMutation({
    mutationFn: () => api(`/inbox/threads/${t.id}/notes`, { method: 'POST', body: { text } }),
    onSuccess: () => {
      setText('');
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/inbox/threads/${t.id}/notes/${id}`, { method: 'DELETE' }),
    onSuccess: refresh,
    onError: (e) => toast.error(errorMessage(e)),
  });
  const notes = t.notes ?? [];
  return (
    <div className="px-5 py-4" style={{ borderBottom: `1px solid ${C.line2}` }}>
      <p style={{ fontSize: 11, color: C.faint2, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
        Internal notes{notes.length ? ` · ${notes.length}` : ''}
      </p>
      <div className="flex flex-col gap-2">
        {notes.map((n) => (
          <div key={n.id} className="group rounded-xl px-3 py-2.5" style={{ background: C.amberSoft, border: `1px solid ${C.amberBorder}` }}>
            <p style={{ fontSize: 12.5, color: C.ink2, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{n.text}</p>
            <div className="mt-1.5 flex items-center justify-between">
              <span style={{ fontSize: 11, color: C.muted }}>
                {n.authorName} · {shortAge(n.createdAt)} ago
              </span>
              {canAct && (n.authorId === me?.user.id || isAdmin) && (
                <button onClick={() => remove.mutate(n.id)} className="opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100" style={{ fontSize: 11, color: C.faint }} aria-label="Delete note">
                  <Trash2 size={11} />
                </button>
              )}
            </div>
          </div>
        ))}
        {!notes.length && !canAct && <p style={{ fontSize: 12, color: C.faint }}>No notes yet.</p>}
        {canAct && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (text.trim()) add.mutate();
            }}
            className="rounded-xl bg-white"
            style={{ border: `1px solid ${C.line2}` }}
          >
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && text.trim()) add.mutate();
              }}
              rows={2}
              maxLength={2000}
              placeholder="Add a note for your team…"
              className="w-full resize-none bg-transparent px-3 pt-2.5 outline-none"
              style={{ fontSize: 12.5, color: C.ink2, lineHeight: 1.5 }}
            />
            <div className="flex items-center justify-between gap-2 px-3 pb-2">
              <span className="min-w-0 truncate" style={{ fontSize: 10.5, color: C.faint2 }}>Team only</span>
              <button type="submit" disabled={!text.trim() || add.isPending} className="flex flex-shrink-0 items-center gap-1 whitespace-nowrap transition-opacity disabled:opacity-40" style={{ fontSize: 12, fontWeight: 600, color: C.blue }}>
                <StickyNote size={11} /> {add.isPending ? 'Saving…' : 'Add note'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ─── Avatars ────────────────────────────────────────────────────────────────
function BrandAvatar({ name, src, size = 32 }: { name: string; src?: string | null; size?: number }) {
  if (src) return <img src={src} alt={name} referrerPolicy="no-referrer" className="flex-shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />;
  return (
    <div className="flex flex-shrink-0 items-center justify-center rounded-full" style={{ width: size, height: size, background: GRADIENT }}>
      <span style={{ fontSize: size * 0.31, fontWeight: 700, color: '#fff' }}>{initials(name)}</span>
    </div>
  );
}
function Who({ m, size }: { m: ThreadMessage; size: number }) {
  return m.from === 'us' ? <BrandAvatar name={m.author} src={m.avatar} size={size} /> : <Avatar name={m.author} src={m.avatar} size={size} />;
}

// ─── Message renderers (per platform, as in the design) ─────────────────────
interface MsgActions {
  canAct: boolean;
  onReply: (m: ThreadMessage) => void;
  onHide?: (m: ThreadMessage) => void;
  onDelete?: (m: ThreadMessage) => void;
}

function CommentThread({ messages, actions }: { messages: ThreadMessage[]; actions: MsgActions }) {
  return (
    <div className="flex flex-col px-6 py-6">
      {messages.map((m, i) => (
        <div key={m.id} className={cn('group flex gap-3', m.isNested ? 'ml-11 mt-3' : i > 0 ? 'mt-6' : '')}>
          <Who m={m} size={28} />
          <div className="min-w-0 flex-1">
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{m.author}</span>
              <span style={{ fontSize: 11, color: '#C0CBDA' }}>{format(new Date(m.sentAt), 'MMM d, h:mm a')}</span>
              {m.hidden && <span style={{ fontSize: 10.5, color: C.amber, fontWeight: 600 }}>Hidden</span>}
            </div>
            <p style={{ fontSize: 14, color: C.ink2, lineHeight: 1.65, opacity: m.hidden ? 0.55 : 1, wordBreak: 'break-word' }}>{m.text}</p>
            <div className="mt-2.5 flex items-center gap-4 opacity-0 transition-opacity group-hover:opacity-100">
              <span className="flex items-center gap-1" style={{ fontSize: 12, color: C.faint2 }}>
                <Heart size={12} /> {m.likes ?? 0}
              </span>
              {actions.canAct && (
                <>
                  <button onClick={() => actions.onReply(m)} className="flex items-center gap-1 transition-colors hover:text-blue-500" style={{ fontSize: 12, color: C.faint2 }}>
                    <MessageCircle size={12} /> Reply
                  </button>
                  {m.from === 'them' && actions.onHide && (
                    <button onClick={() => actions.onHide!(m)} className="flex items-center gap-1 transition-colors hover:text-amber-500" style={{ fontSize: 12, color: C.faint2 }}>
                      {m.hidden ? <Eye size={12} /> : <EyeOff size={12} />} {m.hidden ? 'Unhide' : 'Hide'}
                    </button>
                  )}
                  {actions.onDelete && (
                    <button onClick={() => actions.onDelete!(m)} className="flex items-center gap-1 transition-colors hover:text-red-500" style={{ fontSize: 12, color: C.faint2 }}>
                      <Trash2 size={12} /> Delete
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ChatThread({ messages, provider }: { messages: ThreadMessage[]; provider: Provider }) {
  const accent = PLATFORMS[provider].accent;
  return (
    <div className="flex flex-col gap-5 px-4 py-6 sm:px-6">
      {messages.map((m) => {
        const us = m.from === 'us';
        return (
          <div key={m.id} className={cn('flex items-end gap-2.5', us ? 'justify-end' : 'justify-start')}>
            {!us && <Who m={m} size={30} />}
            <div style={{ maxWidth: '72%' }}>
              {!us && <p style={{ fontSize: 11, color: C.faint2, marginBottom: 4, fontWeight: 500 }}>{m.author}</p>}
              <div
                className="rounded-2xl px-4 py-3"
                style={{
                  background: us ? accent : '#fff',
                  border: us ? 'none' : `1px solid ${C.line2}`,
                  borderBottomRightRadius: us ? 4 : 16,
                  borderBottomLeftRadius: us ? 16 : 4,
                  boxShadow: us ? 'none' : '0 1px 3px rgba(15,23,42,0.05)',
                }}
              >
                {m.attachments?.map((a, i) => (
                  <a key={i} href={a.url} target="_blank" rel="noreferrer" className="mb-1 block">
                    {a.type.startsWith('image') ? <img src={a.url} alt="" className="max-h-48 rounded-lg" /> : <span className="underline">Attachment</span>}
                  </a>
                ))}
                {m.text && <p style={{ fontSize: 14, color: us ? '#fff' : C.ink2, lineHeight: 1.65, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.text}</p>}
              </div>
              <div className={cn('mt-1.5 flex items-center gap-1.5', us ? 'justify-end' : 'justify-start')}>
                <span style={{ fontSize: 11, color: C.faint2 }}>{format(new Date(m.sentAt), 'MMM d, h:mm a')}</span>
                {us && m.delivered && <CheckCheck size={12} color={C.muted} />}
              </div>
            </div>
            {us && <Who m={m} size={30} />}
          </div>
        );
      })}
    </div>
  );
}

function LinkedInThread({ messages, actions }: { messages: ThreadMessage[]; actions: MsgActions }) {
  return (
    <div className="flex flex-col gap-5 px-4 py-6 sm:px-6">
      {messages.map((m) => (
        <div key={m.id} className={cn('group flex gap-3', m.isNested ? 'ml-11' : '')}>
          <Who m={m} size={36} />
          <div className="min-w-0 flex-1 rounded-2xl bg-white px-5 py-4" style={{ border: `1px solid ${C.line2}`, boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }}>
            <div className="mb-2">
              <p style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{m.author}</p>
              <p style={{ fontSize: 11, color: C.faint2 }}>{m.from === 'us' ? 'Company Page' : 'Professional'} · {format(new Date(m.sentAt), 'MMM d, h:mm a')}</p>
            </div>
            <p style={{ fontSize: 14, color: C.ink2, lineHeight: 1.65, wordBreak: 'break-word' }}>{m.text}</p>
            <div className="mt-3 flex items-center gap-4 pt-3" style={{ borderTop: `1px solid ${C.page}` }}>
              <span className="flex items-center gap-1.5" style={{ fontSize: 12, color: C.faint }}>
                <ThumbsUp size={12} /> {m.likes ?? 0}
              </span>
              {actions.canAct && (
                <button onClick={() => actions.onReply(m)} className="flex items-center gap-1.5 transition-colors hover:text-[#0A66C2]" style={{ fontSize: 12, color: C.faint }}>
                  <MessageCircle size={12} /> Reply
                </button>
              )}
              {actions.canAct && actions.onDelete && m.from === 'us' && (
                <button onClick={() => actions.onDelete!(m)} className="flex items-center gap-1.5 opacity-0 transition-all hover:text-red-500 group-hover:opacity-100" style={{ fontSize: 12, color: C.faint }}>
                  <Trash2 size={12} /> Delete
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function XThread({ messages, actions }: { messages: ThreadMessage[]; actions: MsgActions }) {
  return (
    <div className="flex flex-col gap-5 px-4 py-6 sm:px-6">
      {messages.map((m, i) => (
        <div key={m.id}>
          {i > 0 && <div className="mb-5 ml-5 h-4 w-px" style={{ background: '#E8ECF0' }} />}
          <div className="group rounded-2xl bg-white px-5 py-5" style={{ border: `1px solid ${C.line2}`, boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }}>
            <div className="flex items-start gap-3">
              <Who m={m} size={38} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>{m.author}</span>
                  {m.handle && <span style={{ fontSize: 12.5, color: C.faint }}>@{m.handle}</span>}
                  <span style={{ fontSize: 12.5, color: C.faint }}>· {shortAge(m.sentAt)}</span>
                  {m.hidden && <span style={{ fontSize: 10.5, color: C.amber, fontWeight: 600 }}>Hidden</span>}
                </div>
                <p style={{ fontSize: 14.5, color: C.ink2, lineHeight: 1.65, marginTop: 6, wordBreak: 'break-word' }}>{m.text}</p>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-5 pt-3" style={{ borderTop: `1px solid ${C.page}` }}>
              {actions.canAct && (
                <button onClick={() => actions.onReply(m)} className="flex items-center gap-1.5 transition-colors hover:text-blue-500" style={{ fontSize: 13, color: C.faint }}>
                  <MessageCircle size={14} strokeWidth={1.5} /> Reply
                </button>
              )}
              <span className="flex items-center gap-1.5" style={{ fontSize: 13, color: C.faint }}>
                <Repeat2 size={14} strokeWidth={1.5} />
              </span>
              <span className="flex items-center gap-1.5" style={{ fontSize: 13, color: C.faint }}>
                <Heart size={14} strokeWidth={1.5} /> {m.likes ?? 0}
              </span>
              {actions.canAct && m.from === 'them' && actions.onHide && (
                <button onClick={() => actions.onHide!(m)} className="ml-auto flex items-center gap-1.5 opacity-0 transition-all hover:text-amber-500 group-hover:opacity-100" style={{ fontSize: 13, color: C.faint }}>
                  {m.hidden ? <Eye size={14} strokeWidth={1.5} /> : <EyeOff size={14} strokeWidth={1.5} />} {m.hidden ? 'Unhide' : 'Hide reply'}
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Reply box ───────────────────────────────────────────────────────────────
const EMOJIS = ['😀', '😂', '😍', '🙏', '👍', '🔥', '🎉', '❤️', '🙌', '✅', '👀', '💯'];

function ReplyBox({
  thread,
  replyTo,
  onClearReplyTo,
  onSend,
  sending,
}: {
  thread: ThreadDetail;
  replyTo: ThreadMessage | null;
  onClearReplyTo: () => void;
  onSend: (text: string) => Promise<void>;
  sending: boolean;
}) {
  const [text, setText] = useState('');
  const [emoji, setEmoji] = useState(false);
  const p = PLATFORMS[thread.provider];
  const limit = thread.provider === 'X' ? 280 : null;
  const left = limit ? limit - [...text].length : null;
  const over = left !== null && left < 0;
  const dm = isDm(thread);
  const placeholder = dm ? `Message ${thread.author.name}...` : `Reply to ${replyTo?.author ?? thread.author.name}...`;
  const send = async () => {
    if (!text.trim() || over || sending) return;
    await onSend(text.trim());
    setText('');
  };
  return (
    <div className="flex-shrink-0 px-3 pb-4 pt-3 sm:px-5 sm:pb-5">
      <div className="relative overflow-visible rounded-2xl bg-white" style={{ border: `1px solid ${C.border}`, boxShadow: '0 1px 4px rgba(15,23,42,0.05)' }}>
        {replyTo && !dm && (
          <div className="flex items-center gap-2 px-5 pt-3" style={{ fontSize: 12, color: C.faint }}>
            Replying to <span style={{ color: C.body, fontWeight: 600 }}>{replyTo.author}</span>
            <button onClick={onClearReplyTo} aria-label="Cancel reply target">
              <X size={11} />
            </button>
          </div>
        )}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              send();
            }
          }}
          placeholder={placeholder}
          className="w-full resize-none bg-transparent px-5 pb-2 pt-4 outline-none"
          style={{ fontSize: 14, color: C.ink2, minHeight: 80, lineHeight: 1.65 }}
          rows={3}
        />
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5" style={{ borderTop: `1px solid ${C.page}` }}>
          <div className="relative flex items-center gap-1">
            <button onClick={() => setEmoji((v) => !v)} className="flex items-center justify-center rounded-lg transition-colors hover:bg-slate-50" style={{ width: 30, height: 30 }} title="Emoji">
              <Smile size={14} color={C.faint2} />
            </button>
            {emoji && (
              <div className="absolute bottom-9 left-0 z-30 grid grid-cols-6 gap-1 rounded-xl bg-white p-2" style={{ width: 200, border: `1px solid ${C.line2}`, boxShadow: '0 8px 24px rgba(15,23,42,0.10)' }}>
                {EMOJIS.map((e) => (
                  <button key={e} className="rounded-lg p-1 text-lg hover:bg-slate-50" onClick={() => { setText((t) => t + e); setEmoji(false); }}>
                    {e}
                  </button>
                ))}
              </div>
            )}
            {limit && (
              <div className="ml-2 flex items-center gap-2">
                <svg width="20" height="20" viewBox="0 0 20 20" className="rotate-[-90deg]">
                  <circle cx="10" cy="10" r="7" fill="none" stroke="#F1F5F9" strokeWidth="2" />
                  <circle
                    cx="10"
                    cy="10"
                    r="7"
                    fill="none"
                    stroke={over ? C.red : left! < 30 ? C.amber : C.faint}
                    strokeWidth="2"
                    strokeDasharray={`${Math.PI * 14 * Math.min([...text].length / limit, 1)} ${Math.PI * 14}`}
                    strokeLinecap="round"
                  />
                </svg>
                <span style={{ fontSize: 11.5, color: over ? C.red : left! < 30 ? C.amber : C.faint2, fontWeight: over ? 700 : 400 }}>{left}</span>
              </div>
            )}
            <span className="hidden sm:inline" style={{ fontSize: 11, color: '#C8D0DA', marginLeft: 6 }}>
              ⌘↵
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden max-w-[160px] truncate sm:inline" style={{ fontSize: 11, color: C.faint2 }}>
              as {thread.account.username ? (thread.account.username.startsWith('@') ? thread.account.username : `@${thread.account.username}`) : thread.account.name}
            </span>
            <button
              onClick={send}
              disabled={!text.trim() || over || sending}
              className="flex items-center gap-1.5 rounded-xl px-4 py-2 transition-all hover:opacity-90 disabled:cursor-not-allowed"
              style={{ fontSize: 13, fontWeight: 600, color: '#fff', background: text.trim() && !over ? p.accent : '#D1D9E6' }}
            >
              {sending ? <Spinner size={12} color="#fff" /> : <Send size={12} strokeWidth={2.5} />}
              {dm ? 'Send' : 'Reply'}
            </button>
          </div>
        </div>
      </div>
      {dm && thread.provider !== 'X' && (
        <p className="mt-1.5 px-1" style={{ fontSize: 11, color: C.faint2 }}>
          Meta only allows replies within 24 hours of the customer&apos;s last message.
        </p>
      )}
    </div>
  );
}

// ─── Context panel ───────────────────────────────────────────────────────────
function ContextPanel({
  t,
  members,
  canAct,
  onUpdate,
}: {
  t: ThreadDetail;
  members: { id: string; name: string; avatarUrl: string | null }[];
  canAct: boolean;
  onUpdate: (body: Record<string, unknown>) => void;
}) {
  const { data: me } = useMe();
  const p = PLATFORMS[t.provider];
  const s = SENTIMENT[t.sentiment] ?? SENTIMENT.neutral;
  const ty = TYPES[t.type];
  const rows: [string, React.ReactNode][] = [
    [
      'Platform',
      <span key="p" className="flex items-center gap-1.5">
        <PlatformBadge provider={t.provider} size="sm" />
        <span style={{ fontSize: 12, fontWeight: 500, color: p.text }}>{p.short}</span>
      </span>,
    ],
    ['Type', <span key="t" style={{ fontSize: 12, fontWeight: 500, color: ty.color }}>{ty.label}</span>],
    [
      'Sentiment',
      <span key="s" className="flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />
        <span style={{ fontSize: 12, fontWeight: 500, color: s.color }}>{s.label}</span>
      </span>,
    ],
    [
      'Status',
      <span key="st" style={{ fontSize: 12, fontWeight: 500, color: t.status === 'resolved' ? C.green : t.status === 'assigned' ? C.amber : C.blue }}>
        {t.status.charAt(0).toUpperCase() + t.status.slice(1)}
      </span>,
    ],
    ['Received', <span key="r" style={{ fontSize: 12, color: C.body }}>{shortAge(t.lastActivityAt)} ago</span>],
  ];
  const sectionLabel = { fontSize: 11, color: C.faint2, fontWeight: 500, textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 10 };
  return (
    <div className="scrollbar-thin flex h-full flex-col overflow-y-auto" style={{ background: '#FAFBFD', borderLeft: `1px solid ${C.line2}` }}>
      <div className="px-5 py-5" style={{ borderBottom: `1px solid ${C.line2}` }}>
        <div className="mb-4 flex items-center gap-3">
          <Avatar name={t.author.name} src={t.author.avatar} size={38} />
          <div className="min-w-0">
            <p className="truncate" style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>
              {t.author.name}
            </p>
            {t.author.handle && <p className="truncate" style={{ fontSize: 11.5, color: C.faint }}>{t.author.handle.startsWith('@') ? t.author.handle : `@${t.author.handle}`}</p>}
          </div>
        </div>
        <div className="flex flex-col gap-2.5">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between">
              <span style={{ fontSize: 11.5, color: C.faint }}>{k}</span>
              {v}
            </div>
          ))}
        </div>
      </div>
      <div className="px-5 py-4" style={{ borderBottom: `1px solid ${C.line2}` }}>
        <p style={sectionLabel}>Assignee</p>
        <Dropdown
          width={210}
          trigger={
            t.assignee ? (
              <button className="flex w-full items-center gap-2.5 text-left" disabled={!canAct}>
                <Avatar name={t.assignee.name} src={t.assignee.avatarUrl} size={26} color={C.violet} />
                <span className="flex-1 truncate" style={{ fontSize: 12.5, fontWeight: 500, color: C.ink2 }}>
                  {t.assignee.name}
                </span>
                {canAct && <span style={{ fontSize: 11.5, color: C.blue, fontWeight: 500 }}>Change</span>}
              </button>
            ) : (
              <button className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 transition-colors hover:bg-white" style={{ border: '1.5px dashed #DDE3ED' }} disabled={!canAct}>
                <UserPlus size={12} color={C.faint2} />
                <span style={{ fontSize: 12, color: C.faint }}>Assign to team member</span>
              </button>
            )
          }
        >
          <div style={{ padding: '4px 0' }}>
            <MenuLabel>Assign to</MenuLabel>
            {members.map((m) => (
              <MenuItem key={m.id} active={t.assignee?.id === m.id} onClick={() => onUpdate({ assigneeId: m.id })} icon={<Avatar name={m.name} src={m.avatarUrl} size={20} />}>
                {m.name}
                {m.id === me?.user.id ? ' (you)' : ''}
              </MenuItem>
            ))}
            {t.assignee && (
              <>
                <MenuDivider />
                <MenuItem icon={<X size={13} />} onClick={() => onUpdate({ assigneeId: null })}>
                  Unassign
                </MenuItem>
              </>
            )}
          </div>
        </Dropdown>
      </div>
      <NotesSection t={t} canAct={canAct} />
      {t.sourcePost && (
        <div className="px-5 py-4" style={{ borderBottom: `1px solid ${C.line2}` }}>
          <p style={sectionLabel}>Source post</p>
          <div className="rounded-xl bg-white p-3.5" style={{ border: `1px solid ${C.line2}` }}>
            <p className="line-clamp-2-safe" style={{ fontSize: 12.5, fontWeight: 500, color: C.ink2, lineHeight: 1.45 }}>
              {t.sourcePost.title}
            </p>
            <p className="mt-2 truncate" style={{ fontSize: 11.5, color: p.text, fontWeight: 500 }}>
              {t.account.username ? `@${t.account.username.replace(/^@/, '')}` : t.account.name}
            </p>
            {t.sourcePost.permalink && (
              <a href={t.sourcePost.permalink} target="_blank" rel="noreferrer" className="mt-2.5 flex items-center gap-1 transition-opacity hover:opacity-70" style={{ fontSize: 11.5, color: C.faint }}>
                <ExternalLink size={10} /> View post
              </a>
            )}
          </div>
        </div>
      )}
      {canAct && (
        <div className="px-5 py-4">
          <p style={sectionLabel}>Actions</p>
          <div className="flex flex-col gap-1.5">
            {t.status !== 'resolved' ? (
              <button onClick={() => onUpdate({ resolved: true })} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-green-50" style={{ border: '1px solid #D1FAE5' }}>
                <CheckCheck size={12} color={C.green} />
                <span style={{ fontSize: 12.5, color: C.green }}>Mark resolved</span>
              </button>
            ) : (
              <button onClick={() => onUpdate({ resolved: false })} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-blue-50" style={{ border: '1px solid #DBEAFE' }}>
                <RefreshCw size={12} color={C.blue} />
                <span style={{ fontSize: 12.5, color: C.blue }}>Reopen</span>
              </button>
            )}
            {t.assignee?.id !== me?.user.id && (
              <button onClick={() => onUpdate({ assigneeId: me?.user.id })} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-blue-50" style={{ border: '1px solid #DBEAFE' }}>
                <UserPlus size={12} color={C.blue} />
                <span style={{ fontSize: 12.5, color: C.blue }}>Assign to me</span>
              </button>
            )}
            <button onClick={() => onUpdate({ flagged: !t.flagged })} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-amber-50" style={{ border: `1px solid ${C.amberBorder}`, background: t.flagged ? C.amberSoft : undefined }}>
              <Flag size={12} color={C.amber} />
              <span style={{ fontSize: 12.5, color: C.amber }}>{t.flagged ? 'Remove flag' : 'Flag for review'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────
function InboxView() {
  const params = useSearchParams();
  const router = useRouter();
  const qc = useQueryClient();
  const canAct = useCan('EDITOR');
  const [filter, setFilter] = useState<Filter>((params.get('filter') as Filter) ?? 'all');
  const [provider, setProvider] = useState<'all' | Provider>('all');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [context, setContext] = useState(true);
  const [replyTo, setReplyTo] = useState<ThreadMessage | null>(null);
  const [toDelete, setToDelete] = useState<ThreadMessage | null>(null);
  const [mobileThread, setMobileThread] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  const list = useQuery({
    queryKey: ['inbox-threads', filter, provider, debounced],
    queryFn: () =>
      api<{ items: InboxThread[]; counts: Record<Filter, number> }>('/inbox/threads', { query: { filter, provider: provider === 'all' ? undefined : provider, search: debounced } }),
    refetchInterval: 30_000,
  });
  const items = list.data?.items ?? [];
  const current = activeId ?? items[0]?.id ?? null;

  const thread = useQuery({
    queryKey: ['inbox-thread', current],
    queryFn: () => api<ThreadDetail>(`/inbox/threads/${current}`),
    enabled: !!current,
    refetchInterval: 20_000,
  });
  const { data: membersData } = useQuery({
    queryKey: ['members'],
    queryFn: () => api<{ members: { user: { id: string; name: string; avatarUrl: string | null } }[] }>('/workspace/members'),
    staleTime: 5 * 60_000,
  });
  const members = useMemo(() => (membersData?.members ?? []).map((m) => m.user), [membersData]);

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ['inbox-threads'] });
    qc.invalidateQueries({ queryKey: ['inbox-thread', current] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  };

  // Opening a thread marks it read on the server; refresh the list + badge afterwards.
  useEffect(() => {
    if (thread.data) {
      qc.invalidateQueries({ queryKey: ['inbox-threads'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      endRef.current?.scrollIntoView({ block: 'end' });
    }
  }, [thread.data?.id, thread.data?.messages.length, qc]); // eslint-disable-line react-hooks/exhaustive-deps

  const sync = useMutation({
    mutationFn: () => api<{ errors: string[] }[]>('/accounts/sync', { method: 'POST' }),
    onSuccess: (r) => {
      refreshAll();
      const errs = r.flatMap((x) => x.errors);
      if (errs.length) toast.warning(`Synced with issues: ${errs[0]}`);
      else toast.success('Inbox is up to date');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const reply = useMutation({
    mutationFn: (text: string) => api(`/inbox/threads/${current}/reply`, { method: 'POST', body: { text, replyToId: replyTo?.from === 'them' || replyTo?.isNested ? replyTo?.id : undefined } }),
    onSuccess: () => {
      setReplyTo(null);
      refreshAll();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const update = useMutation({
    mutationFn: (body: Record<string, unknown>) => api(`/inbox/threads/${current}`, { method: 'PATCH', body }),
    onSuccess: (_d, body) => {
      refreshAll();
      if (body.resolved === true) toast.success('Marked as resolved');
      if (body.read === false) toast.success('Marked as unread');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const hide = useMutation({
    mutationFn: (m: ThreadMessage) => api(`/comments/${m.id}/hide`, { method: 'POST', body: { hidden: !m.hidden } }),
    onSuccess: (_d, m) => {
      toast.success(m.hidden ? 'Comment is visible again' : 'Comment hidden');
      refreshAll();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const del = useMutation({
    mutationFn: (m: ThreadMessage) => api(`/comments/${m.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Comment deleted');
      setToDelete(null);
      refreshAll();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const mute = useMutation({
    mutationFn: (muted: boolean) => api<{ muted: boolean }>(`/inbox/threads/${current}/mute`, { method: 'POST', body: { muted } }),
    onSuccess: (r) => {
      toast.success(r.muted ? `${thread.data?.author.name ?? 'Contact'} muted — new messages stay out of your inbox` : 'Contact unmuted');
      if (r.muted && filter !== 'muted') setActiveId(null);
      refreshAll();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const t = thread.data;
  const unreadCount = list.data?.counts.unread ?? 0;
  const quoteUrl = t?.provider === 'X' ? t.messages.find((m) => m.from === 'them')?.permalink ?? null : null;
  const acts: MsgActions = {
    canAct,
    onReply: (m) => setReplyTo(m),
    onHide: t && !isDm(t) ? (m) => hide.mutate(m) : undefined,
    onDelete: t && !isDm(t) ? (m) => setToDelete(m) : undefined,
  };

  function renderMessages() {
    if (!t) return null;
    if (isDm(t)) return <ChatThread messages={t.messages} provider={t.provider} />;
    if (t.provider === 'LINKEDIN') return <LinkedInThread messages={t.messages} actions={acts} />;
    if (t.provider === 'X') return <XThread messages={t.messages} actions={acts} />;
    return <CommentThread messages={t.messages} actions={acts} />;
  }

  const open = (id: string) => {
    setActiveId(id);
    setReplyTo(null);
    setMobileThread(true);
  };

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 64px)', background: C.page }}>
      <div className="flex flex-shrink-0 items-center justify-between px-4 py-3 sm:px-6" style={{ background: C.page, borderBottom: `1px solid ${C.divider}` }}>
        <div className="flex items-center gap-2.5">
          <h1 style={{ fontSize: 17, fontWeight: 700, color: C.ink, letterSpacing: '-0.02em' }}>Inbox</h1>
          {unreadCount > 0 && (
            <span className="flex items-center justify-center rounded-full" style={{ minWidth: 20, height: 20, fontSize: 11, fontWeight: 700, background: C.blue, color: '#fff', padding: '0 5px' }}>
              {unreadCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setContext((v) => !v)}
            className="hidden items-center gap-1.5 rounded-lg px-3 py-1.5 transition-colors xl:flex"
            style={{ fontSize: 12, fontWeight: 500, color: context ? C.blue : C.muted, background: context ? C.blueSoft : 'transparent', border: `1px solid ${context ? C.blueBorder : C.border2}` }}
          >
            Context
          </button>
          <button onClick={() => sync.mutate()} disabled={sync.isPending} className="flex items-center justify-center rounded-lg transition-colors hover:bg-white" style={{ width: 32, height: 32, border: `1px solid ${C.border2}` }} title="Sync now">
            <RefreshCw size={13} color={C.faint} className={sync.isPending ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Thread list */}
        <div className={cn('flex w-full flex-shrink-0 flex-col md:w-[292px]', mobileThread && 'hidden md:flex')} style={{ background: '#fff', borderRight: `1px solid ${C.line2}` }}>
          <div className="px-4 pb-3 pt-4">
            <div className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: C.page, border: `1px solid ${C.line2}` }}>
              <Search size={13} color={C.faint2} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} type="text" placeholder="Search..." className="flex-1 bg-transparent outline-none" style={{ fontSize: 13, color: C.ink2 }} />
              {search && (
                <button onClick={() => setSearch('')} className="transition-opacity hover:opacity-60" aria-label="Clear">
                  <X size={12} color={C.faint2} />
                </button>
              )}
            </div>
          </div>
          <div className="scrollbar-thin flex items-center overflow-x-auto px-2" style={{ borderBottom: `1px solid ${C.line2}` }}>
            {FILTERS.filter((f) => f.id !== 'muted' || filter === 'muted' || (list.data?.counts.muted ?? 0) > 0).map((f) => {
              const on = filter === f.id;
              const n = list.data?.counts[f.id] ?? 0;
              return (
                <button key={f.id} onClick={() => setFilter(f.id)} className="relative flex flex-shrink-0 items-center gap-1 px-2 py-2.5 transition-colors" style={{ fontSize: 11.5, fontWeight: on ? 600 : 400, color: on ? C.ink : C.faint }}>
                  {f.label}
                  {n > 0 && on && (
                    <span className="inline-flex items-center justify-center rounded-full" style={{ fontSize: 9, fontWeight: 700, minWidth: 14, height: 14, padding: '0 3px', background: C.ink, color: '#fff' }}>
                      {n}
                    </span>
                  )}
                  {on && <span className="absolute bottom-0 left-2 right-2 rounded-t-full" style={{ height: 2, background: C.ink }} />}
                </button>
              );
            })}
          </div>
          <div className="flex-shrink-0 px-4 py-2.5" style={{ borderBottom: `1px solid ${C.line2}` }}>
            <Dropdown
              width="100%"
              trigger={
                <button className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-1.5 transition-colors hover:bg-slate-50" style={{ fontSize: 12, fontWeight: 500, background: '#F8FAFC', border: `1px solid ${C.line2}`, color: C.body }}>
                  <span className="flex items-center gap-2">
                    {provider !== 'all' && <PlatformBadge provider={provider} size="sm" />}
                    <span style={{ color: provider !== 'all' ? PLATFORMS[provider].text : C.muted }}>{provider === 'all' ? 'All platforms' : PLATFORMS[provider].short}</span>
                  </span>
                  <ChevronDown size={11} color={C.faint2} />
                </button>
              }
            >
              <div style={{ padding: '4px 0' }}>
                <MenuItem active={provider === 'all'} onClick={() => setProvider('all')}>
                  All platforms
                </MenuItem>
                {PROVIDER_ORDER.map((p) => (
                  <MenuItem key={p} active={provider === p} icon={<PlatformBadge provider={p} size="sm" />} onClick={() => setProvider(p)}>
                    {PLATFORMS[p].short}
                  </MenuItem>
                ))}
              </div>
            </Dropdown>
          </div>
          <div ref={listRef} className="scrollbar-thin flex-1 overflow-y-auto">
            {list.isLoading ? (
              <div className="flex justify-center py-16">
                <Spinner />
              </div>
            ) : !items.length ? (
              <div className="flex items-center justify-center px-6 py-16 text-center">
                <div>
                  <CircleAlert size={22} color="#DDE3ED" className="mx-auto mb-2" />
                  <p style={{ fontSize: 13, color: C.faint2 }}>{search || filter !== 'all' || provider !== 'all' ? 'No conversations match' : 'No messages yet. New comments and DMs from your connected accounts appear here.'}</p>
                </div>
              </div>
            ) : (
              items.map((th) => {
                const p = PLATFORMS[th.provider];
                const on = current === th.id;
                return (
                  <button
                    key={th.id}
                    onClick={() => open(th.id)}
                    className="flex w-full items-start gap-3 px-4 py-4 text-left transition-all hover:bg-slate-50"
                    style={{ background: on ? C.blueTint : 'transparent', borderBottom: `1px solid ${C.page}`, borderLeft: `2px solid ${on ? p.accent : 'transparent'}` }}
                  >
                    <div className="relative mt-0.5 flex-shrink-0">
                      <Avatar name={th.author.name} src={th.author.avatar} size={36} />
                      <div className="absolute -bottom-0.5 -right-0.5">
                        <PlatformBadge provider={th.provider} size="sm" />
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="truncate" style={{ fontSize: 13, fontWeight: th.unread ? 700 : 500, color: th.unread ? C.ink : C.slate }}>
                          {th.author.name}
                        </span>
                        <span className="flex-shrink-0" style={{ fontSize: 11, color: C.faint2 }}>
                          {shortAge(th.lastActivityAt)}
                        </span>
                      </div>
                      <p className="truncate" style={{ fontSize: 12.5, color: th.unread ? C.slate : C.faint, fontWeight: th.unread ? 500 : 400, lineHeight: 1.45 }}>
                        {th.preview || '…'}
                      </p>
                      {(th.status !== 'open' || th.flagged) && (
                        <span style={{ fontSize: 10.5, color: th.status === 'resolved' ? C.green : th.flagged ? C.amber : C.muted, fontWeight: 500, marginTop: 4, display: 'block' }}>
                          {th.status === 'resolved' ? 'Resolved' : th.status === 'assigned' ? `Assigned · ${th.assignee?.name ?? ''}` : ''}
                          {th.flagged ? `${th.status !== 'open' ? ' · ' : ''}Flagged` : ''}
                        </span>
                      )}
                    </div>
                    {th.unread && <div className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ background: C.blue }} />}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Conversation */}
        <div className={cn('min-w-0 flex-1 flex-col overflow-hidden', mobileThread ? 'flex' : 'hidden md:flex')} style={{ background: '#F8FAFD' }}>
          {!current ? (
            <div className="flex flex-1 items-center justify-center">
              <div className="text-center">
                <Mail size={26} color="#DDE3ED" className="mx-auto mb-2" />
                <p style={{ fontSize: 14, color: '#C0CBDA' }}>Select a conversation</p>
              </div>
            </div>
          ) : thread.isLoading || !t ? (
            <div className="flex flex-1 items-center justify-center">
              <Spinner />
            </div>
          ) : (
            <>
              <div className="flex-shrink-0 bg-white" style={{ borderBottom: `1px solid ${C.line2}` }}>
                <div style={{ height: 2, background: PLATFORMS[t.provider].accent }} />
                <div className="flex items-center gap-3 px-4 py-3.5 sm:px-5">
                  <button className="flex items-center justify-center rounded-lg hover:bg-slate-50 md:hidden" style={{ width: 30, height: 30 }} onClick={() => setMobileThread(false)} aria-label="Back">
                    <ArrowLeft size={16} color={C.muted} />
                  </button>
                  <div className="relative">
                    <Avatar name={t.author.name} src={t.author.avatar} size={38} />
                    <div className="absolute -bottom-0.5 -right-0.5">
                      <PlatformBadge provider={t.provider} size="sm" />
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate" style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>
                        {t.author.name}
                      </p>
                      {t.status === 'resolved' && (
                        <span style={{ fontSize: 11, color: C.green, background: C.greenSoft, padding: '1px 7px', borderRadius: 10, border: `1px solid ${C.greenBorder}`, fontWeight: 500 }}>Resolved</span>
                      )}
                    </div>
                    <p className="truncate" style={{ fontSize: 12, color: C.faint, marginTop: 1 }}>
                      {t.author.handle ? `${t.author.handle.startsWith('@') ? '' : '@'}${t.author.handle} · ` : ''}
                      {shortAge(t.lastActivityAt)} ago
                      {t.assignee && (
                        <span>
                          {' '}
                          · <span style={{ color: C.muted }}>{t.assignee.name}</span>
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {canAct && t.status !== 'resolved' && (
                      <button
                        onClick={() => update.mutate({ resolved: true })}
                        className="hidden items-center gap-1.5 rounded-xl px-3.5 py-2 transition-colors hover:bg-green-50 sm:flex"
                        style={{ fontSize: 12.5, fontWeight: 600, color: C.green, border: `1px solid ${C.greenBorder}` }}
                      >
                        <CheckCheck size={13} /> Resolve
                      </button>
                    )}
                    <Dropdown
                      align="right"
                      width={190}
                      trigger={
                        <button className="flex items-center justify-center rounded-xl transition-colors hover:bg-slate-50" style={{ width: 34, height: 34, border: `1px solid ${C.line2}` }} title="More actions">
                          <Ellipsis size={15} color={C.faint} />
                        </button>
                      }
                    >
                      <div style={{ padding: '4px 0' }}>
                        {canAct && t.status !== 'resolved' && (
                          <MenuItem icon={<CheckCheck size={13} />} onClick={() => update.mutate({ resolved: true })}>
                            Mark resolved
                          </MenuItem>
                        )}
                        {canAct && t.status === 'resolved' && (
                          <MenuItem icon={<RefreshCw size={13} />} onClick={() => update.mutate({ resolved: false })}>
                            Reopen
                          </MenuItem>
                        )}
                        <MenuItem icon={<Mail size={13} />} onClick={() => update.mutate({ read: false })}>
                          Mark as unread
                        </MenuItem>
                        {canAct && (
                          <MenuItem icon={<Flag size={13} />} onClick={() => update.mutate({ flagged: !t.flagged })}>
                            {t.flagged ? 'Remove flag' : 'Flag for review'}
                          </MenuItem>
                        )}
                        {t.sourcePost?.permalink && (
                          <MenuItem icon={<BookOpen size={13} />} onClick={() => window.open(t.sourcePost!.permalink!, '_blank', 'noopener')}>
                            Open on {PLATFORMS[t.provider].short}
                          </MenuItem>
                        )}
                        {canAct && quoteUrl && (
                          <MenuItem icon={<Quote size={13} />} onClick={() => router.push(`/composer?quote=${encodeURIComponent(quoteUrl)}&account=${t.account.id}`)}>
                            Quote tweet
                          </MenuItem>
                        )}
                        {canAct && (
                          <MenuItem icon={t.muted ? <Volume2 size={13} /> : <VolumeX size={13} />} onClick={() => mute.mutate(!t.muted)}>
                            {t.muted ? 'Unmute contact' : 'Mute contact'}
                          </MenuItem>
                        )}
                        {canAct && !isDm(t) && t.messages[0]?.from === 'them' && (
                          <>
                            <MenuDivider />
                            <MenuItem icon={t.messages[0].hidden ? <Eye size={13} /> : <EyeOff size={13} />} onClick={() => hide.mutate(t.messages[0])}>
                              {t.messages[0].hidden ? 'Unhide comment' : 'Hide comment'}
                            </MenuItem>
                            <MenuItem icon={<Trash2 size={13} />} danger onClick={() => setToDelete(t.messages[0])}>
                              Delete comment
                            </MenuItem>
                          </>
                        )}
                      </div>
                    </Dropdown>
                  </div>
                </div>
                {t.sourcePost && (
                  <div className="flex flex-shrink-0 items-center gap-3 px-5 py-2.5" style={{ background: '#F8FAFC', borderTop: `1px solid ${C.line2}` }}>
                    <span style={{ fontSize: 12, color: C.faint }}>Re:</span>
                    <p className="flex-1 truncate" style={{ fontSize: 12, fontWeight: 500, color: C.body }}>
                      {t.sourcePost.title}
                    </p>
                    <span className="hidden flex-shrink-0 truncate sm:inline" style={{ fontSize: 11.5, color: PLATFORMS[t.provider].text, fontWeight: 500, maxWidth: 160 }}>
                      {t.account.username ? `@${t.account.username.replace(/^@/, '')}` : t.account.name}
                    </span>
                    {t.sourcePost.permalink && (
                      <a href={t.sourcePost.permalink} target="_blank" rel="noreferrer" className="flex flex-shrink-0 items-center transition-opacity hover:opacity-70" aria-label="Open source post">
                        <ExternalLink size={11} color={C.faint} />
                      </a>
                    )}
                  </div>
                )}
              </div>
              <div className="scrollbar-thin flex-1 overflow-y-auto">
                {renderMessages()}
                <div ref={endRef} />
              </div>
              {canAct ? (
                <ReplyBox thread={t} replyTo={replyTo} onClearReplyTo={() => setReplyTo(null)} onSend={async (text) => void (await reply.mutateAsync(text))} sending={reply.isPending} />
              ) : (
                <p className="px-5 py-4 text-center" style={{ fontSize: 12, color: C.faint }}>
                  Viewers can read conversations but not reply.
                </p>
              )}
            </>
          )}
        </div>

        {/* Context */}
        {context && t && (
          <div className="hidden flex-shrink-0 overflow-hidden xl:block" style={{ width: 240 }}>
            <ContextPanel t={t} members={members} canAct={canAct} onUpdate={(b) => update.mutate(b)} />
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={() => toDelete && del.mutate(toDelete)}
        loading={del.isPending}
        danger
        icon={<Trash2 size={15} color={C.red} />}
        title="Delete comment?"
        description={`This permanently deletes the comment from ${t ? PLATFORMS[t.provider].short : 'the platform'}.`}
        confirmLabel="Delete"
      />
    </div>
  );
}

export default function InboxPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <InboxView />
    </Suspense>
  );
}
