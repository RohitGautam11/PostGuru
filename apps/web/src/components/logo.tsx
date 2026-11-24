import { Zap } from 'lucide-react';
import { GRADIENT } from '@/lib/design';

export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'PostGuru';

/** PostGuru mark: gradient tile with a lightning bolt, plus the wordmark. */
export function Logo({ size = 32, textSize = 17, dark, hideText }: { size?: number; textSize?: number; dark?: boolean; hideText?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="flex flex-shrink-0 items-center justify-center rounded-xl" style={{ width: size, height: size, background: GRADIENT }}>
        <Zap size={Math.round(size / 2)} strokeWidth={2.5} color="#fff" />
      </span>
      {!hideText && (
        <span style={{ fontSize: textSize, fontWeight: 800, letterSpacing: '-0.04em', color: dark ? '#fff' : '#0F172A', whiteSpace: 'nowrap' }}>
          {APP_NAME}
        </span>
      )}
    </span>
  );
}
