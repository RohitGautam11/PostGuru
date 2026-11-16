'use client';

import { useQuery } from '@tanstack/react-query';
import { Check, Play, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Btn, EmptyNote, Modal, Spinner } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { C } from '@/lib/design';
import type { MediaAsset } from '@/lib/types';

export function MediaThumb({ url, type, className, style }: { url: string; type: 'IMAGE' | 'VIDEO'; className?: string; style?: React.CSSProperties }) {
  if (type === 'VIDEO') {
    return (
      <div className={`relative overflow-hidden bg-black ${className ?? ''}`} style={style}>
        <video src={`${url}#t=0.5`} className="h-full w-full object-cover" muted playsInline preload="metadata" />
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex items-center justify-center rounded-full bg-black/55 text-white" style={{ width: 30, height: 30 }}>
            <Play size={14} fill="currentColor" />
          </span>
        </span>
      </div>
    );
  }
  return <img src={url} alt="" loading="lazy" className={`object-cover ${className ?? ''}`} style={style} />;
}

/** Media library picker (images & videos already uploaded to the workspace). */
export function MediaPicker({ open, onClose, onSelect, max }: { open: boolean; onClose: () => void; onSelect: (a: MediaAsset[]) => void; max: number }) {
  const [selected, setSelected] = useState<MediaAsset[]>([]);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['media'],
    queryFn: () => api<{ items: MediaAsset[] }>('/media'),
    enabled: open,
  });
  const toggle = (a: MediaAsset) =>
    setSelected((s) => (s.some((x) => x.id === a.id) ? s.filter((x) => x.id !== a.id) : s.length < max ? [...s, a] : s));

  async function remove(a: MediaAsset) {
    try {
      await api(`/media/${a.id}`, { method: 'DELETE' });
      setSelected((s) => s.filter((x) => x.id !== a.id));
      refetch();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  return (
    <Modal open={open} onClose={onClose} width={720}>
      <div style={{ padding: 24 }}>
        <h2 style={{ fontSize: 17, fontWeight: 700, color: C.ink }}>Media library</h2>
        <p style={{ fontSize: 13, color: C.faint, marginTop: 4 }}>Select up to {max} file{max === 1 ? '' : 's'}</p>
        <div className="scrollbar-thin mt-5 max-h-[55vh] overflow-y-auto">
          {isLoading ? (
            <div className="flex justify-center py-16">
              <Spinner />
            </div>
          ) : !data?.items.length ? (
            <EmptyNote>No media yet — upload images or videos from the composer.</EmptyNote>
          ) : (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
              {data.items.map((a) => {
                const idx = selected.findIndex((x) => x.id === a.id);
                return (
                  <div key={a.id} className="group relative">
                    <button
                      onClick={() => toggle(a)}
                      className="block aspect-square w-full overflow-hidden rounded-xl transition"
                      style={{ outline: idx >= 0 ? `2px solid ${C.blue}` : '1px solid #EEF2F6', outlineOffset: idx >= 0 ? 1 : 0 }}
                    >
                      <MediaThumb url={a.url} type={a.type} className="h-full w-full" />
                    </button>
                    {idx >= 0 && (
                      <span className="absolute right-1.5 top-1.5 flex items-center justify-center rounded-full text-white" style={{ width: 22, height: 22, background: C.blue, fontSize: 11, fontWeight: 700 }}>
                        {max > 1 ? idx + 1 : <Check size={13} />}
                      </span>
                    )}
                    <button
                      onClick={() => remove(a)}
                      className="absolute bottom-1.5 right-1.5 flex items-center justify-center rounded-lg bg-white opacity-0 transition-opacity group-hover:opacity-100"
                      style={{ width: 26, height: 26, boxShadow: '0 1px 4px rgba(0,0,0,0.15)' }}
                      title="Delete from library"
                    >
                      <Trash2 size={12} color={C.red} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="mt-6 flex justify-end gap-2.5">
          <Btn variant="outline" onClick={onClose}>
            Cancel
          </Btn>
          <Btn
            disabled={!selected.length}
            onClick={() => {
              onSelect(selected);
              setSelected([]);
              onClose();
            }}
          >
            Add {selected.length || ''} selected
          </Btn>
        </div>
      </div>
    </Modal>
  );
}
