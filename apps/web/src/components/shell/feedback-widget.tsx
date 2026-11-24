'use client';

import { useMutation } from '@tanstack/react-query';
import { Bug, CircleHelp, Heart, Lightbulb, MessageSquarePlus, Plug } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Btn, FieldLabel, Modal, TextInput } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { C } from '@/lib/design';

const KINDS = [
  { key: 'BUG', label: 'Report a bug', icon: Bug, color: C.red, hint: 'What happened, and what did you expect?' },
  { key: 'IDEA', label: 'Feature idea', icon: Lightbulb, color: C.amber, hint: 'What would you like to do? Ideas go on the public roadmap for votes.' },
  { key: 'INTEGRATION', label: 'Platform issue', icon: Plug, color: C.blue, hint: 'Which platform (Instagram, LinkedIn…) and what went wrong when connecting or posting?' },
  { key: 'QUESTION', label: 'Question', icon: CircleHelp, color: C.violet, hint: 'Ask us anything about the product.' },
  { key: 'PRAISE', label: 'Something you love', icon: Heart, color: '#E11D48', hint: 'Tell us what works well so we keep it.' },
] as const;

/** In-app feedback widget: bug reports, feature requests and platform edge cases, sent straight to the team. */
export function FeedbackWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<(typeof KINDS)[number]['key']>('IDEA');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');

  const send = useMutation({
    mutationFn: () =>
      api<{ public: boolean }>('/feedback', {
        method: 'POST',
        body: { kind, title: title.trim(), message: message.trim(), page: `${pathname} · ${typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 200) : ''}` },
      }),
    onSuccess: (r) => {
      toast.success(r.public ? 'Thanks! Your idea is on the roadmap for others to upvote.' : 'Thanks! The team has your feedback.');
      setOpen(false);
      setTitle('');
      setMessage('');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const current = KINDS.find((k) => k.key === kind)!;
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full px-4 py-2.5 transition-all hover:-translate-y-0.5 hover:shadow-lg"
        style={{ background: C.ink, color: '#fff', fontSize: 13, fontWeight: 600, boxShadow: '0 6px 20px rgba(15,23,42,0.25)' }}
        aria-label="Send feedback"
      >
        <MessageSquarePlus size={15} /> <span className="hidden sm:inline">Feedback</span>
      </button>
      <Modal open={open} onClose={() => setOpen(false)} width={520}>
        <form
          className="p-6"
          onSubmit={(e) => {
            e.preventDefault();
            if (title.trim().length < 3 || message.trim().length < 5) return toast.error('Add a short title and a few words of detail');
            send.mutate();
          }}
        >
          <h2 style={{ fontSize: 17, fontWeight: 700, color: C.ink }}>Share feedback</h2>
          <p style={{ fontSize: 13, color: C.faint, marginTop: 4 }}>We read every message during the beta. Thank you for helping us build this.</p>
          <div className="mt-5 flex flex-wrap gap-2">
            {KINDS.map((k) => (
              <button
                type="button"
                key={k.key}
                onClick={() => setKind(k.key)}
                className="flex items-center gap-1.5 rounded-xl px-3 py-2 transition-colors"
                style={{
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: kind === k.key ? k.color : C.muted,
                  background: kind === k.key ? '#fff' : '#F8FAFC',
                  border: `1.5px solid ${kind === k.key ? k.color : C.border2}`,
                }}
              >
                <k.icon size={13} /> {k.label}
              </button>
            ))}
          </div>
          <div className="mt-5">
            <FieldLabel>Title</FieldLabel>
            <TextInput value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} placeholder="One line summary" autoFocus />
          </div>
          <div className="mt-4">
            <FieldLabel>Details</FieldLabel>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={5000}
              rows={5}
              placeholder={current.hint}
              className="w-full resize-none rounded-xl px-4 py-3 outline-none transition-shadow focus:border-[#2563EB] focus:shadow-[0_0_0_3px_rgba(37,99,235,0.09)]"
              style={{ fontSize: 13, border: `1px solid ${C.border3}`, color: C.ink, lineHeight: 1.6 }}
            />
            <p style={{ fontSize: 11.5, color: C.faint, marginTop: 6 }}>We attach the page you are on and your browser version to help us reproduce issues.</p>
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <Link href="/roadmap" onClick={() => setOpen(false)} style={{ fontSize: 13, fontWeight: 600, color: C.blue }} className="transition-opacity hover:opacity-70">
              See the roadmap →
            </Link>
            <div className="flex gap-2">
              <Btn type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Btn>
              <Btn type="submit" loading={send.isPending}>
                Send
              </Btn>
            </div>
          </div>
        </form>
      </Modal>
    </>
  );
}
