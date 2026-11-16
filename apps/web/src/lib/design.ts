/** Design tokens taken from the Figma (Postly) design. */
export const C = {
  page: '#F4F6F8',
  shell: '#F4F6F9',
  ink: '#0F172A',
  ink2: '#1E293B',
  slate: '#334155',
  slate2: '#374151',
  body: '#475569',
  muted: '#64748B',
  faint: '#94A3B8',
  faint2: '#B0BAC9',
  ghost: '#CBD5E1',
  line: '#F1F5F9',
  line2: '#EEF2F6',
  border: '#E8ECF2',
  border2: '#E2E8F0',
  border3: '#E8ECF0',
  divider: '#EAECEF',
  blue: '#2563EB',
  blueSoft: '#EFF6FF',
  blueBorder: '#BFDBFE',
  blueTint: '#F0F5FF',
  violet: '#7C3AED',
  green: '#16A34A',
  greenSoft: '#F0FDF4',
  greenBorder: '#BBF7D0',
  red: '#DC2626',
  redSoft: '#FEF2F2',
  redBorder: '#FECACA',
  amber: '#D97706',
  amberSoft: '#FFFBEB',
  amberBorder: '#FDE68A',
  orange: '#EA580C',
  orangeSoft: '#FFF7ED',
  purple: '#9333EA',
  purpleSoft: '#FAF5FF',
} as const;

export const GRADIENT = 'linear-gradient(135deg, #2563EB 0%, #7C3AED 100%)';
export const CARD_SHADOW = '0 1px 3px rgba(15,23,42,0.04), 0 1px 2px rgba(15,23,42,0.03)';
export const POP_SHADOW = '0 8px 28px rgba(15,23,42,0.10), 0 2px 8px rgba(15,23,42,0.06)';
export const TOOLTIP_STYLE = {
  background: '#0F172A',
  border: 'none',
  borderRadius: 10,
  fontSize: 12,
  boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
  padding: '8px 12px',
};

export const POST_STATUS = {
  SCHEDULED: { label: 'Scheduled', color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE', dot: '#2563EB' },
  PUBLISHED: { label: 'Published', color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0', dot: '#16A34A' },
  PARTIAL: { label: 'Partial', color: '#D97706', bg: '#FFFBEB', border: '#FDE68A', dot: '#D97706' },
  PUBLISHING: { label: 'Publishing', color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE', dot: '#7C3AED' },
  FAILED: { label: 'Failed', color: '#DC2626', bg: '#FEF2F2', border: '#FECACA', dot: '#DC2626' },
  DRAFT: { label: 'Draft', color: '#64748B', bg: '#F8FAFC', border: '#E2E8F0', dot: '#94A3B8' },
} as const;

/** Stable avatar color for a name (the design colors initials avatars per person). */
const AVATAR_COLORS = ['#2563EB', '#7C3AED', '#059669', '#EA580C', '#E1306C', '#0A66C2', '#9333EA', '#0891B2'];
export function colorFor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
