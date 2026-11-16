// End-to-end smoke test against a RUNNING local stack (db + api + web).
// Usage (from repo root):  node apps/api/scripts/e2e-local.mjs
// It goes through the web proxy (http://localhost:3002/api) exactly like a browser does,
// creates throwaway users/workspaces (e2e-*@example.test), and deletes them at the end.
// A fake Facebook account is inserted so posting/inbox flows can run without real OAuth;
// publishing to it is EXPECTED to fail gracefully (that is one of the things being tested).
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const apiDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(apiDir, 'package.json'));
require('./dist/load-env.js'); // loads apps/api/.env
const { encrypt } = require('./dist/common/crypto.js');
const { hotp } = require('./dist/common/totp.js');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const BASE = process.env.E2E_BASE ?? 'http://localhost:3002';
const RUN = Date.now().toString(36);
const results = [];
let section = '';

// ─── tiny HTTP client with a cookie jar per "browser" ──────────────────────────
function browser() {
  const jar = new Map();
  return async function call(method, url, body, headers = {}) {
    const h = { ...headers };
    if (jar.size && !h.Authorization) h.Cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    let payload;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) { payload = JSON.stringify(body); h['Content-Type'] = 'application/json'; }
    const res = await fetch(BASE + url, { method, headers: h, body: payload, redirect: 'manual' });
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [kv] = c.split(';'); const i = kv.indexOf('=');
      const k = kv.slice(0, i), v = kv.slice(i + 1);
      if (v === '' || /Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(c)) jar.delete(k); else jar.set(k, v);
    }
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { json = text; }
    return { status: res.status, body: json, headers: res.headers };
  };
}

function check(name, ok, detail) {
  results.push({ section, name, ok: !!ok, detail: ok ? '' : detail });
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${name}${ok ? '' : `  →  ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 300)}`}`);
}
const expect = (name, r, statuses) => {
  const list = [].concat(statuses);
  check(name, list.includes(r.status), `HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 250)}`);
  return r;
};
const begin = (s) => { section = s; console.log(`\n■ ${s}`); };
const totpNow = (secret) => hotp(secret, Math.floor(Date.now() / 30000));
const future = (min) => new Date(Date.now() + min * 60_000).toISOString();
const arr = (b) => (Array.isArray(b) ? b : b?.items ?? b?.data ?? b?.posts ?? []);

const ownerEmail = `e2e-owner-${RUN}@example.test`;
const viewerEmail = `e2e-viewer-${RUN}@example.test`;
const outsiderEmail = `e2e-outsider-${RUN}@example.test`;
let password = 'Passw0rd123';

// Sign-up is rate limited (5/min per IP); wait out the window instead of failing.
async function register(client, body) {
  for (let i = 0; i < 3; i++) {
    const r = await client('POST', '/api/auth/register', body);
    if (r.status !== 429) return r;
    console.log('    (sign-up rate limit hit – waiting 60s)');
    await new Promise((res) => setTimeout(res, 61_000));
  }
  return client('POST', '/api/auth/register', body);
}

const A = browser(); // workspace owner
const V = browser(); // invited viewer
const O = browser(); // unrelated user in another workspace

try {
  // ─── Infrastructure ─────────────────────────────────────────────────────────
  begin('Infrastructure');
  expect('API health (via web proxy)', await A('GET', '/api/health'), 200);
  for (const p of ['/login', '/signup', '/forgot-password']) {
    const r = await fetch(BASE + p);
    check(`Public page ${p} renders`, r.status === 200, `HTTP ${r.status}`);
  }
  const prov = await A('GET', '/api/auth/providers');
  expect('Sign-in providers endpoint', prov, 200);

  // ─── Sign up / login ────────────────────────────────────────────────────────
  begin('Sign up & login');
  expect('Rejects weak password', await register(A, { name: 'Owner', email: ownerEmail, password: 'short' }), 400);
  expect('Rejects invalid email', await register(A, { name: 'Owner', email: 'not-an-email', password }), 400);
  expect('Sign up', await register(A, { name: 'E2E Owner', email: ownerEmail, password, workspaceName: 'E2E Agency' }), [200, 201]);
  expect('Duplicate email rejected', await register(O, { name: 'Dup', email: ownerEmail, password }), [400, 409]);
  const me = expect('Current user (/auth/me)', await A('GET', '/api/auth/me'), 200).body;
  const ownerWorkspaceId = me?.workspace?.id ?? me?.workspaceId ?? me?.currentWorkspace?.id;
  expect('Wrong password rejected', await O('POST', '/api/auth/login', { email: ownerEmail, password: 'Wrong12345' }), 401);
  expect('Protected route without login → 401', await O('GET', '/api/posts'), 401);
  expect('Refresh session', await A('POST', '/api/auth/refresh'), [200, 201]);
  expect('Forgot password (always generic 200)', await O('POST', '/api/auth/forgot-password', { email: ownerEmail }), [200, 201, 204]);
  expect('Reset with bad token rejected', await O('POST', '/api/auth/reset-password', { token: 'bogus', password: 'NewPassw0rd1' }), [400, 401, 404]);

  // ─── Profile, password, notifications, 2FA ─────────────────────────────────
  begin('Profile & security');
  expect('Update profile', await A('PATCH', '/api/users/me', { name: 'E2E Owner Renamed', jobTitle: 'Social Lead', timezone: 'Asia/Kolkata' }), 200);
  expect('Get notification preferences', await A('GET', '/api/users/me/notifications'), 200);
  expect('Change password: wrong current rejected', await A('POST', '/api/users/me/password', { currentPassword: 'Nope12345', newPassword: 'Another123x' }), [400, 401, 403]);
  expect('Change password', await A('POST', '/api/users/me/password', { currentPassword: password, newPassword: 'Another123x' }), [200, 201, 204]);
  password = 'Another123x';
  const setup = expect('2FA setup returns secret + QR', await A('POST', '/api/users/me/2fa/setup'), 200).body;
  expect('2FA enable: wrong code rejected', await A('POST', '/api/users/me/2fa/enable', { code: '000000' }), 400);
  const en = expect('2FA enable with valid code', await A('POST', '/api/users/me/2fa/enable', { code: totpNow(setup.secret) }), 200).body;
  check('2FA gives recovery codes', Array.isArray(en?.recoveryCodes ?? en?.codes) && (en.recoveryCodes ?? en.codes).length > 0, en);
  const T = browser();
  const step1 = await T('POST', '/api/auth/login', { email: ownerEmail, password });
  check('Login with 2FA asks for a code', step1.status === 200 && (step1.body?.mfaRequired || step1.body?.twoFactorRequired || step1.body?.requiresTwoFactor || !step1.body?.accessToken), step1.body);
  expect('2FA login: wrong code rejected', await T('POST', '/api/auth/login/2fa', { code: '123456' }), [400, 401]);
  await new Promise((r) => setTimeout(r, 31_000)); // next TOTP window (same code can't be reused)
  expect('2FA login with valid code', await T('POST', '/api/auth/login/2fa', { code: totpNow(setup.secret) }), [200, 201]);
  expect('2FA disable', await A('POST', '/api/users/me/2fa/disable', { code: totpNow(setup.secret) }), [200, 201]);

  // ─── Social integrations ────────────────────────────────────────────────────
  begin('Connect accounts');
  const integ = expect('List platforms', await A('GET', '/api/integrations'), 200).body;
  for (const i of integ ?? []) {
    const c = await A('GET', `/api/integrations/${i.key.toLowerCase()}/connect`);
    if (!i.configured) {
      console.log(`    NOTE: ${i.name} is not configured yet (no credentials in apps/api/.env)`);
      check(`${i.name} "Connect" refused cleanly while unconfigured`, c.status >= 400 && c.status < 500, c);
      continue;
    }
    check(`${i.name} "Connect" opens provider login`, c.status === 200 && /^https:\/\//.test(c.body?.url ?? ''), c.body);
  }
  expect('Unknown platform rejected', await A('GET', '/api/integrations/myspace/connect'), [400, 404]);
  expect('OAuth callback with forged state rejected', await A('GET', '/api/integrations/facebook/callback?code=x&state=forged'), [302, 303, 400, 401, 403]);

  // Fake connected account (no real tokens) so the posting/inbox flows can be exercised.
  const fb = await prisma.socialAccount.create({
    data: { workspaceId: ownerWorkspaceId, provider: 'FACEBOOK', externalId: `e2e-${RUN}`, name: 'E2E Test Page', username: 'e2etestpage', accessToken: encrypt('invalid-token'), scopes: [], followers: 1234 },
  });
  const xAcc = await prisma.socialAccount.create({
    data: { workspaceId: ownerWorkspaceId, provider: 'X', externalId: `e2e-x-${RUN}`, name: 'E2E X', username: 'e2ex', accessToken: encrypt('invalid-token'), scopes: [] },
  });
  const accs = expect('Connected accounts list', await A('GET', '/api/accounts'), 200).body;
  check('Fake accounts visible', arr(accs).length >= 2, accs);

  // ─── Media ──────────────────────────────────────────────────────────────────
  begin('Media upload');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  const fd = new FormData(); fd.append('file', new Blob([png], { type: 'image/png' }), 'pixel.png');
  const up = expect('Upload image (local storage)', await A('POST', '/api/media/local', fd), [200, 201]);
  const mediaId = up.body?.id;
  const bad = new FormData(); bad.append('file', new Blob(['MZ'], { type: 'application/x-msdownload' }), 'virus.exe');
  expect('Rejects disallowed file type', await A('POST', '/api/media/local', bad), [400, 415]);
  expect('Media library', await A('GET', '/api/media'), 200);

  // ─── Posts / composer / planner ─────────────────────────────────────────────
  begin('Composer & planner');
  const draft = expect('Save draft', await A('POST', '/api/posts', { content: 'E2E draft 🚀 #launch', accountIds: [fb.id], action: 'draft' }), [200, 201]).body;
  expect('Edit draft', await A('PUT', `/api/posts/${draft.id}`, { content: 'E2E draft edited ✅', accountIds: [fb.id], action: 'draft', mediaIds: mediaId ? [mediaId] : [] }), 200);
  expect('Open post details', await A('GET', `/api/posts/${draft.id}`), 200);
  expect('Schedule in the past rejected', await A('POST', '/api/posts', { content: 'past', accountIds: [fb.id], action: 'schedule', scheduledAt: '2020-01-01T00:00:00Z' }), 400);
  expect('Schedule without date rejected', await A('POST', '/api/posts', { content: 'nodate', accountIds: [fb.id], action: 'schedule' }), 400);
  expect('Publish with no account rejected', await A('POST', '/api/posts', { content: 'noacc', accountIds: [], action: 'publish' }), 400);
  expect('X 280-char limit enforced', await A('POST', '/api/posts', { content: 'x'.repeat(300), accountIds: [xAcc.id], action: 'publish' }), 400);
  expect('Per-platform override fixes X limit', await A('POST', '/api/posts', { content: 'y'.repeat(300), accountIds: [xAcc.id, fb.id], action: 'draft', overrides: { X: { content: 'Short X version' } } }), [200, 201]);
  expect('Unknown fields rejected (DTO whitelist)', await A('POST', '/api/posts', { content: 'z', accountIds: [fb.id], action: 'draft', hacker: true }), 400);
  const sched = expect('Schedule post (+2 days)', await A('POST', '/api/posts', { content: 'E2E scheduled', accountIds: [fb.id], action: 'schedule', scheduledAt: future(2 * 24 * 60) }), [200, 201]).body;
  const range = `from=${encodeURIComponent(new Date().toISOString())}&to=${encodeURIComponent(future(7 * 24 * 60))}`;
  const cal = expect('Planner calendar range', await A('GET', `/api/posts?${range}`), 200).body;
  check('Scheduled post appears in planner', arr(cal).some((p) => p.id === sched.id), cal);
  expect('Drag-to-reschedule', await A('PATCH', `/api/posts/${sched.id}/schedule`, { scheduledAt: future(3 * 24 * 60) }), 200);
  expect('Planner search', await A('GET', '/api/posts?search=scheduled'), 200);
  const dup = expect('Duplicate post', await A('POST', `/api/posts/${draft.id}/duplicate`), [200, 201]).body;
  expect('Delete post', await A('DELETE', `/api/posts/${dup.id}`), [200, 204]);
  expect('Deleted post is gone', await A('GET', `/api/posts/${dup.id}`), 404);

  // Publish now → provider rejects the fake token → must fail gracefully, not crash
  const pub = await A('POST', '/api/posts', { content: 'E2E publish now', accountIds: [fb.id], action: 'publish' });
  check('Publish now accepted (no 500)', pub.status < 500, pub);
  let finalPost;
  for (let i = 0; i < 20; i++) {
    finalPost = (await A('GET', `/api/posts/${pub.body?.id}`)).body;
    if (finalPost && !['PUBLISHING', 'QUEUED', 'SCHEDULED'].includes(finalPost.status)) break;
    await new Promise((r) => setTimeout(r, 1500));
  }
  check('Failed publish is reported to the user (status + reason)', ['FAILED', 'PARTIAL'].includes(finalPost?.status) || finalPost?.targets?.some((t) => t.error || t.status === 'FAILED'), { status: finalPost?.status, targets: finalPost?.targets?.map((t) => [t.status, t.error]) });
  expect('Retry publish does not crash', await A('POST', `/api/posts/${pub.body?.id}/publish`), [200, 201, 400, 409]);

  // ─── Scheduler / cron security ──────────────────────────────────────────────
  begin('Scheduler');
  expect('Cron without secret rejected', await O('POST', '/api/cron/publish'), [401, 403]);
  expect('Cron with secret runs', await O('POST', '/api/cron/publish', undefined, { Authorization: `Bearer ${process.env.CRON_SECRET}` }), [200, 201]);
  expect('Meta webhook verify with wrong token rejected', await O('GET', '/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=123'), [400, 401, 403]);
  expect('Meta webhook with bad signature rejected', await O('POST', '/api/webhooks/meta', { object: 'page', entry: [] }, { 'X-Hub-Signature-256': 'sha256=deadbeef' }), [400, 401, 403]);

  // ─── Inbox & comments (seeded data) ─────────────────────────────────────────
  begin('Unified inbox & comments');
  const conv = await prisma.conversation.create({
    data: {
      workspaceId: ownerWorkspaceId, socialAccountId: fb.id, externalId: `conv-${RUN}`, participantName: 'Priya Customer', participantExternalId: 'psid-1',
      lastMessageAt: new Date(), lastMessagePreview: 'Hi, what are your prices?', unreadCount: 1,
      messages: { create: [{ direction: 'INBOUND', text: 'Hi, what are your prices?', senderName: 'Priya Customer', sentAt: new Date(), externalId: `m-${RUN}` }] },
    },
  });
  await prisma.comment.createMany({
    data: [
      { workspaceId: ownerWorkspaceId, socialAccountId: fb.id, externalId: `c1-${RUN}`, externalPostId: 'p1', authorName: 'Happy Fan', text: 'Love this product!', sentiment: 'POSITIVE', postedAt: new Date() },
      { workspaceId: ownerWorkspaceId, socialAccountId: fb.id, externalId: `c2-${RUN}`, externalPostId: 'p1', authorName: 'Angry Guy', text: 'Worst service ever', sentiment: 'NEGATIVE', postedAt: new Date() },
    ],
  });
  const threads = expect('Inbox thread list', await A('GET', '/api/inbox/threads'), 200).body;
  check('DM and comments appear in inbox', (threads?.items?.length ?? 0) >= 2, threads?.counts);
  for (const f of ['unread', 'comments', 'dms', 'mentions']) expect(`Inbox filter: ${f}`, await A('GET', `/api/inbox/threads?filter=${f}`), 200);
  expect('Inbox search', await A('GET', '/api/inbox/threads?search=priya'), 200);
  const dmThread = threads?.items?.find((t) => t.type === 'dm' || t.type === 'page_message') ?? threads?.items?.[0];
  if (dmThread) {
    expect('Open thread', await A('GET', `/api/inbox/threads/${dmThread.id}`), 200);
    const note = expect('Add internal note', await A('POST', `/api/inbox/threads/${dmThread.id}/notes`, { text: 'VIP lead – call back' }), [200, 201]).body;
    if (note?.id) expect('Delete internal note', await A('DELETE', `/api/inbox/threads/${dmThread.id}/notes/${note.id}`), [200, 204]);
    expect('Flag + mark read', await A('PATCH', `/api/inbox/threads/${dmThread.id}`, { flagged: true, read: true }), 200);
    expect('Resolve', await A('PATCH', `/api/inbox/threads/${dmThread.id}`, { resolved: true }), 200);
    expect('Assign to me', await A('PATCH', `/api/inbox/threads/${dmThread.id}`, { assigneeId: me?.user?.id ?? me?.id, resolved: false }), 200);
    const rep = await A('POST', `/api/inbox/threads/${dmThread.id}/reply`, { text: 'Thanks! Prices start at $29.' });
    check('Reply with revoked token fails gracefully (4xx/502, not 500)', rep.status !== 500, rep);
    expect('Mute contact', await A('POST', `/api/inbox/threads/${dmThread.id}/mute`, { muted: true }), [200, 201]);
    expect('Muted filter', await A('GET', '/api/inbox/threads?filter=muted'), 200);
    expect('Unmute contact', await A('POST', `/api/inbox/threads/${dmThread.id}/mute`, { muted: false }), [200, 201]);
  }
  const comments = expect('Comments list', await A('GET', '/api/comments'), 200).body;
  expect('Comments: negative sentiment filter', await A('GET', '/api/comments?sentiment=NEGATIVE'), 200);
  const c1 = arr(comments)[0];
  if (c1) {
    expect('Comment: set status', await A('PATCH', `/api/comments/${c1.id}`, { status: 'RESOLVED' }), [200, 400]);
    const h = await A('POST', `/api/comments/${c1.id}/hide`, { hidden: true });
    check('Hide comment with revoked token fails gracefully', h.status !== 500, h);
  }

  // ─── Dashboard & analytics ──────────────────────────────────────────────────
  begin('Dashboard & analytics');
  expect('Dashboard', await A('GET', '/api/dashboard'), 200);
  for (const d of [7, 30, 90]) expect(`Analytics ${d} days`, await A('GET', `/api/analytics/overview?days=${d}`), [200, 403]);
  expect('Analytics by platform', await A('GET', '/api/analytics/overview?days=30&providers=FACEBOOK'), 200);
  expect('Send weekly report (logs email locally)', await A('POST', '/api/analytics/weekly-report/send'), [200, 201]);
  const notes = expect('Notifications bell', await A('GET', '/api/notifications'), 200).body;
  check('Failure notification created', (notes?.items ?? []).length > 0, notes);
  expect('Mark all notifications read', await A('POST', '/api/notifications/read-all'), [200, 201, 204]);

  // ─── Team, roles, API keys ──────────────────────────────────────────────────
  begin('Team & permissions');
  expect('Workspace info', await A('GET', '/api/workspace'), 200);
  expect('Rename workspace', await A('PATCH', '/api/workspace', { name: 'E2E Agency Renamed' }), 200);
  expect('Free plan blocks extra members (upsell)', await A('POST', '/api/workspace/invitations', { email: `e2e-x-${RUN}@example.test`, role: 'EDITOR' }), 403);
  await prisma.workspace.update({ where: { id: ownerWorkspaceId }, data: { plan: 'PRO' } }); // simulate a paid upgrade
  const inv = expect('Invite member by email (Pro)', await A('POST', '/api/workspace/invitations', { email: `e2e-invitee-${RUN}@example.test`, role: 'EDITOR' }), [200, 201]).body;
  expect('Members + pending invites', await A('GET', '/api/workspace/members'), 200);
  if (inv?.id) expect('Cancel invitation', await A('DELETE', `/api/workspace/invitations/${inv.id}`), [200, 204]);
  const link = expect('Create invite link (Viewer)', await A('POST', '/api/workspace/invite-link', { role: 'VIEWER' }), [200, 201]).body;
  const token = link?.url?.split('/invite/')[1];
  expect('Invite link preview (public)', await O('GET', `/api/auth/invite/${token}`), 200);
  expect('Viewer signs up via invite link', await register(V,{ name: 'E2E Viewer', email: viewerEmail, password, inviteToken: token }), [200, 201]);
  const vme = (await V('GET', '/api/auth/me')).body;
  check('Viewer lands in the owner workspace', JSON.stringify(vme).includes(ownerWorkspaceId), vme);
  expect('Viewer can read posts', await V('GET', '/api/posts'), 200);
  expect('Viewer cannot create posts', await V('POST', '/api/posts', { content: 'nope', accountIds: [fb.id], action: 'draft' }), 403);
  expect('Viewer cannot invite people', await V('POST', '/api/workspace/invitations', { email: 'x@example.test', role: 'ADMIN' }), 403);
  expect('Viewer cannot open billing checkout', await V('POST', '/api/billing/checkout', { plan: 'PRO' }), [400, 403]);
  const members = (await A('GET', '/api/workspace/members')).body;
  const vm = (members?.members ?? arr(members)).find((m) => m.user?.email === viewerEmail);
  if (vm) {
    expect('Promote viewer → editor', await A('PATCH', `/api/workspace/members/${vm.id}`, { role: 'EDITOR' }), 200);
    expect('Editor can now draft', await V('POST', '/api/posts', { content: 'editor draft', accountIds: [fb.id], action: 'draft' }), [200, 201]);
    expect('Remove member', await A('DELETE', `/api/workspace/members/${vm.id}`), [200, 204]);
    expect('Removed member loses access', await V('GET', '/api/posts'), [401, 403]);
  } else check('Viewer membership found', false, members);
  expect('Revoke invite link', await A('DELETE', '/api/workspace/invite-link'), [200, 204]);

  const key = expect('Create API key', await A('POST', '/api/workspace/api-keys', { name: 'E2E key' }), [200, 201]).body;
  const raw = key?.key ?? key?.token ?? key?.secret;
  expect('API key works', await O('GET', '/api/posts', undefined, { Authorization: `Bearer ${raw}` }), 200);
  expect('API key cannot touch billing', await O('GET', '/api/billing', undefined, { Authorization: `Bearer ${raw}` }), [401, 403]);
  expect('Revoke API key', await A('DELETE', `/api/workspace/api-keys/${key?.id}`), [200, 204]);
  expect('Revoked API key rejected', await O('GET', '/api/posts', undefined, { Authorization: `Bearer ${raw}` }), 401);

  // ─── Tenant isolation ───────────────────────────────────────────────────────
  begin('Data isolation between customers');
  expect('Outsider signs up', await register(O, { name: 'E2E Outsider', email: outsiderEmail, password }), [200, 201]);
  expect("Outsider cannot read owner's post", await O('GET', `/api/posts/${draft.id}`), [403, 404]);
  expect("Outsider cannot delete owner's post", await O('DELETE', `/api/posts/${draft.id}`), [403, 404]);
  expect("Outsider cannot post to owner's account", await O('POST', '/api/posts', { content: 'hijack', accountIds: [fb.id], action: 'draft' }), [400, 403, 404]);
  if (dmThread) expect("Outsider cannot open owner's inbox thread", await O('GET', `/api/inbox/threads/${dmThread.id}`), [403, 404]);
  const oPosts = (await O('GET', '/api/posts')).body;
  check("Outsider's post list is empty", arr(oPosts).length === 0, oPosts);

  // ─── Workspaces & billing ───────────────────────────────────────────────────
  begin('Workspaces & billing');
  const ws2 = expect('Create second workspace (client)', await A('POST', '/api/workspace', { name: 'E2E Client B' }), [200, 201]).body;
  expect('Switch workspace', await A('POST', '/api/auth/switch-workspace', { workspaceId: ws2?.id }), [200, 201]);
  const p2 = (await A('GET', '/api/posts')).body;
  check('Second workspace starts empty', arr(p2).length === 0, p2);
  expect('Switch back', await A('POST', '/api/auth/switch-workspace', { workspaceId: ownerWorkspaceId }), [200, 201]);
  expect('Billing overview', await A('GET', '/api/billing'), 200);
  const co = await A('POST', '/api/billing/checkout', { plan: 'PRO' });
  check('Checkout: Stripe URL, or clear "not configured" message', co.status < 500 || (co.status === 503 && /not configured/i.test(co.body?.message ?? '')), co);
  if (co.status === 503) console.log('    NOTE: Stripe is not configured – customers cannot pay yet.');
  expect('Stripe webhook without signature rejected', await O('POST', '/api/billing/webhook', { type: 'checkout.session.completed' }), [400, 401, 403, 503]);

  // ─── Signed-in pages render (server side) ───────────────────────────────────
  begin('App pages');
  for (const p of ['/dashboard', '/composer', '/planner', '/planner?view=list', '/inbox', '/analytics', '/connect', `/posts/${draft.id}`,
    '/settings?tab=profile', '/settings?tab=team', '/settings?tab=billing', '/settings?tab=notifications', '/settings?tab=integrations', `/invite/${token}`, '/reset-password?token=x']) {
    const r = await A('GET', p);
    check(`Page ${p}`, [200, 307, 308].includes(r.status) && !/Application error|Internal Server Error/i.test(String(r.body)), `HTTP ${r.status}`);
  }

  begin('Logout');
  expect('Logout', await A('POST', '/api/auth/logout'), [200, 201, 204]);
  expect('Logged out user is blocked', await A('GET', '/api/posts'), 401);
} catch (e) {
  check('Test run crashed', false, e?.stack ?? String(e));
} finally {
  // ─── Cleanup ────────────────────────────────────────────────────────────────
  const users = await prisma.user.findMany({ where: { email: { startsWith: 'e2e-', endsWith: '@example.test' } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  const wss = await prisma.membership.findMany({ where: { userId: { in: ids }, role: 'OWNER' }, select: { workspaceId: true } });
  await prisma.workspace.deleteMany({ where: { id: { in: wss.map((w) => w.workspaceId) } } }).catch((e) => console.log('cleanup ws:', e.message));
  await prisma.user.deleteMany({ where: { id: { in: ids } } }).catch((e) => console.log('cleanup users:', e.message));
  await prisma.$disconnect();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  if (failed.length) {
    console.log('\nFailures:');
    for (const f of failed) console.log(` - [${f.section}] ${f.name}`);
  }
  process.exitCode = failed.length ? 1 : 0;
}
