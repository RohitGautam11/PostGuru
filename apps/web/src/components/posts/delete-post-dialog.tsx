'use client';

import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/ui';
import { C } from '@/lib/design';
import { usePostActions } from './use-post-actions';

export function DeletePostDialog({
  post,
  onClose,
  onDeleted,
}: {
  post: { id: string; status: string } | null;
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const { remove } = usePostActions();
  const [remote, setRemote] = useState(false);
  const published = post && ['PUBLISHED', 'PARTIAL'].includes(post.status);
  return (
    <ConfirmDialog
      open={!!post}
      onClose={onClose}
      danger
      icon={<Trash2 size={15} color={C.red} />}
      title="Delete post?"
      confirmLabel="Delete"
      loading={remove.isPending}
      onConfirm={() =>
        post &&
        remove.mutate(
          { id: post.id, remote },
          {
            onSuccess: () => {
              onClose();
              onDeleted?.();
            },
          },
        )
      }
      description="This removes the post from your workspace. This can't be undone."
    >
      {published && (
        <label className="mt-4 flex cursor-pointer items-start gap-2.5 rounded-xl p-3" style={{ background: '#F8FAFC', border: `1px solid ${C.line2}`, marginLeft: 48 }}>
          <input type="checkbox" className="mt-0.5" style={{ accentColor: C.blue }} checked={remote} onChange={(e) => setRemote(e.target.checked)} />
          <span style={{ fontSize: 12.5, color: C.slate }}>
            Also delete it from the social platforms
            <span className="block" style={{ fontSize: 11.5, color: C.faint, marginTop: 2 }}>
              Instagram doesn&apos;t allow deleting posts through its API.
            </span>
          </span>
        </label>
      )}
    </ConfirmDialog>
  );
}
