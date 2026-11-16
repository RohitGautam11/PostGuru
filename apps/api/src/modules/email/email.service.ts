import { Global, Injectable, Logger, Module } from '@nestjs/common';
import nodemailer, { Transporter } from 'nodemailer';
import { env } from '../../config/env';

export interface EmailMessage {
  to: string;
  subject: string;
  /** Short heading shown at the top of the email */
  heading: string;
  /** Plain-text paragraphs (HTML-escaped when rendered) */
  paragraphs: string[];
  /** Optional label/value rows, e.g. weekly report metrics */
  stats?: { label: string; value: string }[];
  action?: { label: string; url: string };
  footer?: string;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Transactional email over SMTP. Without SMTP settings, messages are written to the API log so
 * every flow (password reset links, notifications, reports) still works in local development.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: Transporter | null = null;

  get enabled() {
    return Boolean(env().SMTP_HOST);
  }

  private transport(): Transporter {
    if (this.transporter) return this.transporter;
    const e = env();
    this.transporter = nodemailer.createTransport({
      host: e.SMTP_HOST,
      port: e.SMTP_PORT,
      secure: e.SMTP_SECURE,
      auth: e.SMTP_USER ? { user: e.SMTP_USER, pass: e.SMTP_PASS } : undefined,
    });
    return this.transporter;
  }

  /** Never throws: email is best-effort and must not fail the request that triggered it. */
  async send(msg: EmailMessage): Promise<boolean> {
    const text = [
      msg.heading,
      '',
      ...msg.paragraphs,
      ...(msg.stats?.length ? ['', ...msg.stats.map((s) => `${s.label}: ${s.value}`)] : []),
      ...(msg.action ? ['', `${msg.action.label}: ${msg.action.url}`] : []),
      ...(msg.footer ? ['', msg.footer] : []),
    ].join('\n');
    if (!this.enabled) {
      this.logger.log(`[SMTP not configured — email not sent] to=${msg.to} subject="${msg.subject}"\n${text}`);
      return false;
    }
    try {
      await this.transport().sendMail({
        from: env().EMAIL_FROM ?? `${env().APP_NAME} <no-reply@${new URL(env().WEB_URL).hostname}>`,
        to: msg.to,
        subject: msg.subject,
        text,
        html: this.render(msg),
      });
      return true;
    } catch (err) {
      this.logger.warn(`Email to ${msg.to} failed: ${(err as Error).message}`);
      return false;
    }
  }

  private render(msg: EmailMessage) {
    const p = (t: string) => `<p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#475569">${esc(t)}</p>`;
    const stats = msg.stats?.length
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0 4px;border:1px solid #EEF0F4;border-radius:12px">${msg.stats
          .map(
            (s, i) =>
              `<tr><td style="padding:10px 14px;font-size:13px;color:#64748B;${i ? 'border-top:1px solid #F1F5F9;' : ''}">${esc(s.label)}</td><td align="right" style="padding:10px 14px;font-size:14px;font-weight:700;color:#0F172A;${i ? 'border-top:1px solid #F1F5F9;' : ''}">${esc(s.value)}</td></tr>`,
          )
          .join('')}</table>`
      : '';
    const button = msg.action
      ? `<p style="margin:28px 0 8px"><a href="${esc(msg.action.url)}" style="display:inline-block;background:#2563EB;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 22px;border-radius:12px">${esc(msg.action.label)}</a></p>`
      : '';
    const footer = msg.footer
      ? `<p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #F1F5F9;font-size:12px;line-height:1.55;color:#94A3B8">${esc(msg.footer)}</p>`
      : '';
    return `<!doctype html><html><body style="margin:0;background:#F4F6F8;font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:16px;padding:36px 36px 28px;box-shadow:0 2px 16px rgba(15,23,42,0.07)"><tr><td>
<p style="margin:0 0 24px;font-size:17px;font-weight:800;letter-spacing:-0.04em;color:#0F172A">${esc(env().APP_NAME)}</p>
<h1 style="margin:0 0 14px;font-size:20px;font-weight:700;color:#0F172A;letter-spacing:-0.02em">${esc(msg.heading)}</h1>
${msg.paragraphs.map(p).join('')}${stats}${button}${footer}
</td></tr></table></td></tr></table></body></html>`;
  }
}

@Global()
@Module({ providers: [EmailService], exports: [EmailService] })
export class EmailModule {}
