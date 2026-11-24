'use client';

import { Eye, PenLine, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Spinner } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { C } from '@/lib/design';
import type { InboxThread, ThreadMessage } from '@/lib/types';

interface Presence {
  userId: string;
  userName: string;
  action: 'viewing' | 'replying';
}

/**
 * Collision detection: heartbeats this user's presence on a thread (viewing / replying) and returns
 * teammates on the same thread, so two people don't answer the same customer.
 */
export function useThreadPresence(threadId: string | null, replying: boolean) {
  const [others, setOthers] = useState<Presence[]>([]);
  const replyingRef = useRef(replying);
  replyingRef.current = replying;

  useEffect(() => {
    if (!threadId) return;
    let stopped = false;
    const beat = (action: 'viewing' | 'replying' | 'left') =>
      api<{ others: Presence[] }>(`/inbox/threads/${threadId}/presence`, { method: 'POST', body: { action } })
        .then((r) => !stopped && setOthers(r.others))
        .catch(() => undefined);
    beat(replyingRef.current ? 'replying' : 'viewing');
    const timer = setInterval(() => beat(replyingRef.current ? 'replying' : 'viewing'), 20_000);
    return () => {
      stopped = true;
      clearInterval(timer);
      setOthers([]);
      beat('left');
    };
  }, [threadId]);

  // Announce "replying" promptly when the user starts typing.
  useEffect(() => {
    if (!threadId || !replying) return;
    api<{ others: Presence[] }>(`/inbox/threads/${threadId}/presence`, { method: 'POST', body: { action: 'replying' } })
      .then((r) => setOthers(r.others))
      .catch(() => undefined);
  }, [threadId, replying]);

  return others;
}

export function PresenceBanner({ others }: { others: Presence[] }) {
  if (!others.length) return null;
  const replying = others.filter((o) => o.action === 'replying');
  const list = (replying.length ? replying : others).map((o) => o.userName.split(' ')[0]);
  const names = list.length > 2 ? `${list.slice(0, 2).join(', ')} +${list.length - 2}` : list.join(' and ');
  return (
    <div
      className="mx-3 mb-2 flex items-center gap-2 rounded-xl px-3 py-2 sm:mx-5"
      style={{ background: replying.length ? C.amberSoft : C.blueSoft, border: `1px solid ${replying.length ? C.amberBorder : C.blueBorder}` }}
      role="status"
    >
      {replying.length ? <PenLine size={13} color={C.amber} /> : <Eye size={13} color={C.blue} />}
      <span style={{ fontSize: 12, color: C.slate }}>
        <b>{names}</b> {replying.length ? `${replying.length > 1 ? 'are' : 'is'} replying to this right now. Check before you send.` : `${list.length > 1 ? 'are' : 'is'} also viewing this conversation.`}
      </span>
    </div>
  );
}

const VOICE_KEY = 'postguru-brand-voice';

/** One-click AI reply suggestions, tuned to the brand voice saved in this browser. */
export function AiReplySuggestions({
  thread,
  messages,
  replyTo,
  dm,
  onPick,
}: {
  thread: InboxThread;
  messages: ThreadMessage[];
  replyTo: ThreadMessage | null;
  dm: boolean;
  onPick: (text: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [replies, setReplies] = useState<{ text: string; tone: string }[]>([]);
  const [voice, setVoice] = useState('');
  const [editVoice, setEditVoice] = useState(false);

  useEffect(() => {
    try {
      setVoice(localStorage.getItem(VOICE_KEY) ?? '');
    } catch {
      /* storage unavailable */
    }
  }, []);
  useEffect(() => setReplies([]), [thread.id]);

  const target = replyTo ?? [...messages].reverse().find((m) => m.from === 'them') ?? null;

  async function suggest() {
    if (!target?.text) return toast.message('There is no incoming message to reply to yet.');
    setLoading(true);
    try {
      const recent = messages
        .slice(-6)
        .map((m) => `${m.from === 'us' ? 'Us' : m.author}: ${m.text}`)
        .join('\n');
      const context = dm ? recent : [thread.sourcePost?.title ? `Post: ${thread.sourcePost.title}` : null, recent].filter(Boolean).join('\n\n');
      const r = await api<{ replies: { text: string; tone: string }[] }>('/growth/replies', {
        method: 'POST',
        body: { platform: thread.provider, kind: dm ? 'dm' : 'comment', message: target.text, authorName: target.author, context, brandVoice: voice || undefined },
      });
      setReplies(r.replies);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  function saveVoice(v: string) {
    setVoice(v);
    try {
      localStorage.setItem(VOICE_KEY, v);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="px-4 pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={suggest}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 transition-colors hover:bg-[#F5F3FF] disabled:opacity-60"
          style={{ fontSize: 12, fontWeight: 600, color: C.violet, border: '1px solid #DDD6FE' }}
        >
          {loading ? <Spinner size={11} color={C.violet} /> : <Sparkles size={12} />} {replies.length ? 'New suggestions' : 'Suggest replies'}
        </button>
        <button onClick={() => setEditVoice((v) => !v)} style={{ fontSize: 11.5, color: C.faint }} className="transition-opacity hover:opacity-70">
          {voice ? `Voice: ${voice.slice(0, 32)}${voice.length > 32 ? '…' : ''}` : 'Set brand voice'}
        </button>
      </div>
      {editVoice && (
        <input
          autoFocus
          value={voice}
          onChange={(e) => saveVoice(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && setEditVoice(false)}
          maxLength={300}
          placeholder="e.g. warm, playful, uses “we”, one emoji max"
          className="mt-2 w-full rounded-lg px-3 py-1.5 outline-none focus:border-[#7C3AED]"
          style={{ fontSize: 12, border: `1px solid ${C.border2}`, color: C.ink }}
        />
      )}
      {replies.length > 0 && (
        <div className="mt-2 flex flex-col gap-1.5">
          {replies.map((r) => (
            <button
              key={r.text}
              onClick={() => onPick(r.text)}
              className="rounded-xl px-3 py-2 text-left transition-colors hover:bg-[#F5F3FF]"
              style={{ border: `1px solid ${C.line2}`, background: '#FAFBFD' }}
            >
              <span style={{ fontSize: 10.5, fontWeight: 700, color: C.violet, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{r.tone}</span>
              <p style={{ fontSize: 12.5, color: C.slate, lineHeight: 1.5, marginTop: 2 }}>{r.text}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
