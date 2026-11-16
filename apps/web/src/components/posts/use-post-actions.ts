'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import type { Post } from '@/lib/types';

export function usePostActions() {
  const qc = useQueryClient();
  const refresh = () => {
    for (const key of ['posts', 'planner', 'dashboard', 'post', 'analytics']) qc.invalidateQueries({ queryKey: [key] });
  };
  const onError = (err: unknown) => toast.error(errorMessage(err));

  const publish = useMutation({
    mutationFn: (id: string) => api<Post>(`/posts/${id}/publish`, { method: 'POST' }),
    onSuccess: (post) => {
      refresh();
      if (post.status === 'PUBLISHED') toast.success('Published successfully');
      else if (post.status === 'PARTIAL') toast.warning('Published to some accounts only');
      else if (post.status === 'FAILED') toast.error(post.targets.find((t) => t.error)?.error ?? 'Publishing failed');
      else toast.message('Publishing in progress…');
    },
    onError,
  });

  const duplicate = useMutation({
    mutationFn: (id: string) => api<Post>(`/posts/${id}/duplicate`, { method: 'POST' }),
    onSuccess: () => {
      refresh();
      toast.success('Duplicated as a draft');
    },
    onError,
  });

  const remove = useMutation({
    mutationFn: ({ id, remote }: { id: string; remote: boolean }) => api<{ remoteErrors: string[] }>(`/posts/${id}`, { method: 'DELETE', query: { remote } }),
    onSuccess: (res) => {
      refresh();
      if (res.remoteErrors?.length) toast.warning(`Deleted here, but: ${res.remoteErrors.join('; ')}`);
      else toast.success('Post deleted');
    },
    onError,
  });

  const reschedule = useMutation({
    mutationFn: ({ id, scheduledAt }: { id: string; scheduledAt: string }) => api<Post>(`/posts/${id}/schedule`, { method: 'PATCH', body: { scheduledAt } }),
    onSuccess: () => {
      refresh();
      toast.success('Post rescheduled');
    },
    onError,
  });

  return { publish, duplicate, remove, reschedule };
}
