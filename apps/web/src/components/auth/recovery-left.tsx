import { MARKETING, Quote } from '@/components/auth/auth-shell';
import { C } from '@/lib/design';

/** Left brand panel for the forgot / reset password screens. */
export function RecoveryLeft() {
  return (
    <>
      <div className="mb-auto">
        <h2 style={{ fontSize: 30, fontWeight: 700, color: '#fff', letterSpacing: '-0.03em', lineHeight: 1.25 }}>
          Locked out?
          <br />
          It happens.
        </h2>
        <p style={{ fontSize: 15, color: C.body, marginTop: 14, lineHeight: 1.65 }}>
          We&apos;ll email you a secure, single-use link to choose a new password. Your scheduled posts keep publishing while you&apos;re away.
        </p>
      </div>
      <Quote q={MARKETING.loginQuote} />
    </>
  );
}
