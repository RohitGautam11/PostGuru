import { Injectable } from '@nestjs/common';
import { Provider } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CTA_RE, EMOJI_RE, HASHTAG_RE, HOOK_RE, NICHES, RULES } from './growth.rules';

export type CheckLevel = 'good' | 'warn' | 'bad' | 'info';
export interface Check {
  level: CheckLevel;
  text: string;
}
export interface MediaMeta {
  type: 'IMAGE' | 'VIDEO';
  width?: number;
  height?: number;
  duration?: number;
}
export interface ScoreInput {
  content: string;
  providers: Provider[];
  media?: MediaMeta[];
  link?: string;
  title?: string;
  tags?: string[];
  overrides?: Partial<Record<Provider, { content?: string }>>;
  scheduledAt?: string;
}

const hashtagsOf = (text: string) => [...text.matchAll(HASHTAG_RE)].map((m) => m[1].toLowerCase());
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

@Injectable()
export class GrowthService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Content score ────────────────────────────────────────────────────────
  async score(workspaceId: string, input: ScoreInput) {
    const best = await this.bestSlots(workspaceId);
    const platforms = input.providers.filter((p) => RULES[p]).map((provider) => this.scoreOne(provider, input, best));
    const overall = platforms.length ? clamp(platforms.reduce((s, p) => s + p.score, 0) / platforms.length) : 0;
    return { overall, grade: grade(overall), platforms };
  }

  private scoreOne(provider: Provider, input: ScoreInput, best: { day: number; hour: number }[]) {
    const r = RULES[provider];
    const text = (input.overrides?.[provider]?.content?.trim() ? input.overrides[provider]!.content! : input.content).trim();
    const media = input.media ?? [];
    const checks: Check[] = [];
    let s = 50;
    const add = (pts: number, level: CheckLevel, msg: string) => {
      s += pts;
      checks.push({ level, text: msg });
    };

    // Length
    const len = [...text].length;
    if (!len) add(-15, 'bad', 'No caption. Even a short caption helps search and context.');
    else if (len < r.idealLength[0]) add(2, 'info', `Short caption (${len} chars). ${r.label} posts often perform best at ${r.idealLength[0]}–${r.idealLength[1]}.`);
    else if (len <= r.idealLength[1]) add(10, 'good', `Caption length (${len}) is in the ${r.label} sweet spot.`);
    else add(-3, 'warn', `Long caption (${len} chars). Consider trimming to under ${r.idealLength[1]}.`);

    // Hook (first line)
    const firstLine = text.split('\n')[0] ?? '';
    if (len) {
      if ([...firstLine].length > r.foldAt) add(-4, 'warn', `Your first line is cut off after ~${r.foldAt} characters. Put the hook before that.`);
      if (HOOK_RE.test(firstLine) || /[?!]$/.test(firstLine.trim()) || /^\p{Extended_Pictographic}/u.test(firstLine)) add(8, 'good', 'Strong opening hook.');
      else add(-2, 'info', 'Start with a hook: a number, a question, or a bold claim ("3 mistakes…", "Stop doing…").');
    }

    // Call to action / conversation
    if (CTA_RE.test(text)) add(8, 'good', 'Has a call to action.');
    else add(-4, 'warn', 'Add a call to action (comment, save, share, follow, link in bio).');
    if (text.includes('?')) add(4, 'good', 'Asks a question. Questions drive comments.');

    // Hashtags
    const tags = hashtagsOf(text);
    const unique = new Set(tags);
    const [lo, hi] = r.hashtags;
    if (unique.size !== tags.length) add(-3, 'warn', 'Duplicate hashtags.');
    if (tags.length === 0 && lo > 0) add(-5, 'warn', `Add ${lo}–${hi} relevant hashtags.`);
    else if (tags.length > hi) add(-6, 'warn', `${tags.length} hashtags is too many for ${r.label}. Use ${lo}–${hi}.`);
    else if (tags.length >= lo) add(6, 'good', `${tags.length} hashtag${tags.length === 1 ? '' : 's'}, a good amount for ${r.label}.`);

    // Emoji & readability
    const emojis = (text.match(EMOJI_RE) ?? []).length;
    if (emojis > 0 && emojis <= 6) add(2, 'good', 'Emoji add personality.');
    if (emojis > 12) add(-3, 'warn', 'Lots of emoji can look spammy.');
    const letters = text.replace(/[^\p{L}]/gu, '');
    if (letters.length > 20 && letters === letters.toUpperCase()) add(-6, 'warn', 'All caps reads like shouting.');
    if (len > 400 && !text.includes('\n')) add(-4, 'warn', 'Break long text into short paragraphs.');

    // Links
    const hasLink = !!input.link || /https?:\/\//.test(text);
    if (hasLink && !r.linksClickable) add(-4, 'warn', `Links aren't clickable on ${r.label}. Say "link in bio" instead.`);
    else if (hasLink && r.linkPenalty) add(-2, 'info', `${r.label} shows posts with external links to fewer people. Consider posting the link as a comment.`);
    else if (hasLink && provider === 'PINTEREST') add(5, 'good', 'Destination link added. Pins drive traffic.');
    else if (provider === 'PINTEREST') add(-4, 'warn', 'Add a destination link. Pinterest is built for traffic.');

    // Media & format
    const videos = media.filter((m) => m.type === 'VIDEO');
    const images = media.filter((m) => m.type === 'IMAGE');
    if (!media.length) {
      if (r.prefersVideo) add(-8, 'warn', `${r.label} rewards video. Add a Reel/short video for more reach.`);
      else add(-4, 'info', 'Posts with an image or video get more engagement than text only.');
    } else {
      add(videos.length && r.prefersVideo ? 10 : 6, 'good', videos.length ? 'Video attached.' : 'Visual attached.');
      for (const m of media) {
        if (m.width && m.height) {
          const ratio = m.width / m.height;
          const fit = r.ratios.find((x) => Math.abs(x.value - ratio) / x.value < 0.06);
          if (fit) add(3, 'good', `${m.type === 'VIDEO' ? 'Video' : 'Image'} is ${fit.label}, a good fit.`);
          else add(-5, 'warn', `${m.type === 'VIDEO' ? 'Video' : 'Image'} is ${m.width}×${m.height}. ${r.label} works best with ${r.ratios[0].label}.`);
        }
        if (m.type === 'VIDEO' && m.duration && r.video) {
          const d = Math.round(m.duration);
          if (d > r.video.max) add(-12, 'bad', `Video is ${fmtDur(d)}. ${r.label} allows up to ${fmtDur(r.video.max)} for most accounts.`);
          else if (d >= r.video.ideal[0] && d <= r.video.ideal[1]) add(5, 'good', `Video length (${fmtDur(d)}) is in the recommended range.`);
          else add(-2, 'info', `Recommended video length on ${r.label}: ${fmtDur(r.video.ideal[0])}–${fmtDur(r.video.ideal[1])} (yours: ${fmtDur(d)}).`);
        }
      }
      if (provider === 'YOUTUBE' && videos[0]?.width && videos[0]?.height && videos[0].height > videos[0].width && (videos[0].duration ?? 0) <= 180)
        checks.push({ level: 'info', text: 'Vertical video under 3 minutes: YouTube will publish it as a Short.' });
      if (images.length > 1 && (provider === 'INSTAGRAM' || provider === 'LINKEDIN')) add(4, 'good', 'Carousel posts get extra swipes and dwell time.');
    }

    // YouTube / Pinterest SEO
    if (provider === 'YOUTUBE') {
      const title = (input.title || firstLine).trim();
      if (title.length < 20) add(-6, 'warn', 'Write a descriptive title (40–70 characters) with your main keyword first.');
      else if (title.length <= 70) add(6, 'good', 'Title length is good for search.');
      else add(-2, 'info', 'Titles over 70 characters get cut off in search results.');
      const t = input.tags?.length ?? 0;
      if (t === 0) add(-4, 'warn', 'Add 5–15 tags (keywords) to help YouTube understand the video.');
      else if (t >= 5) add(4, 'good', `${t} tags added.`);
      if (len < 200) add(-4, 'warn', 'Write a 200+ character description with keywords in the first 150 characters.');
    }
    if (provider === 'PINTEREST' && firstLine.length > 100) add(-2, 'info', 'The first line becomes the Pin title. Keep it under 100 characters.');

    // Timing
    if (input.scheduledAt && best.length) {
      const d = new Date(input.scheduledAt);
      const hit = best.some((b) => b.day === d.getUTCDay() && Math.abs(b.hour - d.getUTCHours()) <= 1);
      if (hit) add(6, 'good', 'Scheduled at one of your best-performing times.');
      else checks.push({ level: 'info', text: 'Tip: use the "Best time" suggestion. Your audience is most active at other times.' });
    }

    return { provider, label: r.label, score: clamp(s), grade: grade(clamp(s)), checks: sortChecks(checks), tips: r.tips };
  }

  /** Top weekday/hour cells (UTC) by average engagement from the last 90 days. */
  private async bestSlots(workspaceId: string) {
    const rows = await this.prisma.postTarget.findMany({
      where: { post: { workspaceId }, status: 'PUBLISHED', publishedAt: { gte: new Date(Date.now() - 90 * 86400_000) } },
      select: { publishedAt: true, likes: true, comments: true, shares: true },
      take: 2000,
    });
    const cells = new Map<string, { day: number; hour: number; total: number; n: number }>();
    for (const r of rows) {
      if (!r.publishedAt) continue;
      const day = r.publishedAt.getUTCDay();
      const hour = r.publishedAt.getUTCHours();
      const k = `${day}-${hour}`;
      const c = cells.get(k) ?? { day, hour, total: 0, n: 0 };
      c.total += r.likes + r.comments * 2 + r.shares * 3;
      c.n += 1;
      cells.set(k, c);
    }
    return [...cells.values()].sort((a, b) => b.total / b.n - a.total / a.n).slice(0, 3);
  }

  // ─── Hashtag suggestions ─────────────────────────────────────────────────
  async hashtags(workspaceId: string, content: string, providers: Provider[]) {
    const used = new Set(hashtagsOf(content));
    const text = content.toLowerCase();

    // 1. The workspace's own best hashtags (ranked by average engagement per post).
    const mine = (await this.topHashtags(workspaceId)).filter((h) => !used.has(h.tag)).slice(0, 8);

    // 2. Niche library matched against the draft text.
    const scored = NICHES.map((n) => ({ n, hits: n.keywords.filter((k) => text.includes(k)).length })).filter((x) => x.hits > 0);
    scored.sort((a, b) => b.hits - a.hits);
    const niches = scored.slice(0, 2).map((x) => x.n);

    // 3. Keywords from the draft itself turned into tags (long-tail).
    const words = (text.match(/\b[a-z][a-z]{4,}\b/g) ?? []).filter((w) => !STOP.has(w));
    const freq = new Map<string, number>();
    for (const w of words) freq.set(w, (freq.get(w) ?? 0) + 1);
    const keywordTags = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([w]) => w);

    const seen = new Set<string>([...used]);
    const out: { tag: string; source: 'yours' | 'niche' | 'keyword'; reach?: string; note: string }[] = [];
    const push = (tag: string, source: 'yours' | 'niche' | 'keyword', note: string, reach?: string) => {
      if (seen.has(tag)) return;
      seen.add(tag);
      out.push({ tag, source, note, reach });
    };
    for (const h of mine) push(h.tag, 'yours', `Your top performer: avg ${h.avg} engagements across ${h.posts} posts`);
    for (const n of niches) for (const t of n.tags) push(t.tag, 'niche', `${n.niche}: ${t.reach} reach`, t.reach);
    for (const w of keywordTags) push(w, 'keyword', 'Keyword from your post (long-tail, less competition)');

    const limits = providers.map((p) => ({ provider: p, label: RULES[p]?.label ?? p, min: RULES[p]?.hashtags[0] ?? 0, max: RULES[p]?.hashtags[1] ?? 5 }));
    return { niche: niches.map((n) => n.niche), suggestions: out.slice(0, 18), limits };
  }

  private async topHashtags(workspaceId: string) {
    const posts = await this.prisma.post.findMany({
      where: { workspaceId, status: { in: ['PUBLISHED', 'PARTIAL'] }, publishedAt: { gte: new Date(Date.now() - 180 * 86400_000) } },
      select: { content: true, targets: { select: { likes: true, comments: true, shares: true } } },
      take: 500,
      orderBy: { publishedAt: 'desc' },
    });
    const stats = new Map<string, { total: number; posts: number }>();
    for (const p of posts) {
      const eng = p.targets.reduce((s, t) => s + t.likes + t.comments + t.shares, 0);
      for (const tag of new Set(hashtagsOf(p.content))) {
        const x = stats.get(tag) ?? { total: 0, posts: 0 };
        x.total += eng;
        x.posts += 1;
        stats.set(tag, x);
      }
    }
    return [...stats.entries()]
      .map(([tag, x]) => ({ tag, posts: x.posts, avg: Math.round(x.total / x.posts) }))
      .filter((x) => x.posts >= 1)
      .sort((a, b) => b.avg - a.avg);
  }

  // ─── Workspace insights (Growth page) ────────────────────────────────────
  async insights(workspaceId: string) {
    const since = new Date(Date.now() - 90 * 86400_000);
    const targets = await this.prisma.postTarget.findMany({
      where: { post: { workspaceId }, status: 'PUBLISHED', publishedAt: { gte: since } },
      select: {
        publishedAt: true, likes: true, comments: true, shares: true, impressions: true,
        socialAccount: { select: { provider: true } },
        post: { select: { content: true, media: true } },
      },
      take: 3000,
    });
    const eng = (t: (typeof targets)[number]) => t.likes + t.comments + t.shares;

    // Per platform
    const byProvider = new Map<Provider, { posts: number; engagement: number; impressions: number; last30: number }>();
    const d30 = Date.now() - 30 * 86400_000;
    for (const t of targets) {
      const p = t.socialAccount.provider;
      const x = byProvider.get(p) ?? { posts: 0, engagement: 0, impressions: 0, last30: 0 };
      x.posts += 1;
      x.engagement += eng(t);
      x.impressions += t.impressions;
      if (t.publishedAt && t.publishedAt.getTime() >= d30) x.last30 += 1;
      byProvider.set(p, x);
    }
    const accounts = await this.prisma.socialAccount.findMany({ where: { workspaceId }, select: { provider: true } });
    const connected = [...new Set(accounts.map((a) => a.provider))];
    const platforms = connected.map((p) => {
      const x = byProvider.get(p) ?? { posts: 0, engagement: 0, impressions: 0, last30: 0 };
      return {
        provider: p,
        label: RULES[p].label,
        posts: x.posts,
        avgEngagement: x.posts ? Math.round(x.engagement / x.posts) : 0,
        engagementRate: x.impressions ? Math.round((x.engagement / x.impressions) * 1000) / 10 : null,
        postsLast30: x.last30,
        recommendedCadence: RULES[p].cadence,
      };
    });

    // Length buckets
    const buckets = [
      { label: 'Short (< 100 chars)', min: 0, max: 100 },
      { label: 'Medium (100–300)', min: 100, max: 300 },
      { label: 'Long (300–1000)', min: 300, max: 1000 },
      { label: 'Very long (1000+)', min: 1000, max: Infinity },
    ].map((b) => {
      const xs = targets.filter((t) => t.post.content.length >= b.min && t.post.content.length < b.max);
      return { label: b.label, posts: xs.length, avgEngagement: xs.length ? Math.round(xs.reduce((s, t) => s + eng(t), 0) / xs.length) : 0 };
    });

    // Media type
    const mediaKind = (t: (typeof targets)[number]) => {
      const m = (t.post.media as { type: string }[] | null) ?? [];
      if (m.some((x) => x.type === 'VIDEO')) return 'Video';
      if (m.length > 1) return 'Carousel';
      if (m.length === 1) return 'Single image';
      return 'Text only';
    };
    const formats = ['Video', 'Carousel', 'Single image', 'Text only'].map((k) => {
      const xs = targets.filter((t) => mediaKind(t) === k);
      return { label: k, posts: xs.length, avgEngagement: xs.length ? Math.round(xs.reduce((s, t) => s + eng(t), 0) / xs.length) : 0 };
    });

    const best = await this.bestSlots(workspaceId);
    const hashtags = (await this.topHashtags(workspaceId)).slice(0, 12);

    // Recommendations
    const recs: string[] = [];
    const topFormat = [...formats].filter((f) => f.posts >= 2).sort((a, b) => b.avgEngagement - a.avgEngagement)[0];
    if (topFormat) recs.push(`${topFormat.label} posts get your best engagement (avg ${topFormat.avgEngagement}). Make more of them.`);
    const topLen = [...buckets].filter((b) => b.posts >= 2).sort((a, b) => b.avgEngagement - a.avgEngagement)[0];
    if (topLen) recs.push(`${topLen.label} captions perform best for your audience.`);
    for (const p of platforms) {
      if (p.postsLast30 < 4) recs.push(`${p.label}: only ${p.postsLast30} post${p.postsLast30 === 1 ? '' : 's'} in 30 days. Recommended: ${p.recommendedCadence}.`);
    }
    if (hashtags[0]) recs.push(`#${hashtags[0].tag} is your strongest hashtag. Keep using it where relevant.`);
    if (!targets.length) recs.push('Publish a few posts to unlock personalised insights. Until then, follow the platform tips below.');

    return { totals: { posts: targets.length, engagement: targets.reduce((s, t) => s + eng(t), 0) }, platforms, lengths: buckets, formats, bestTimes: best, hashtags, recommendations: recs };
  }

  formats() {
    return Object.entries(RULES).map(([provider, r]) => ({
      provider,
      label: r.label,
      ratios: r.ratios.map((x) => x.label),
      video: r.video ?? null,
      hashtags: r.hashtags,
      idealLength: r.idealLength,
      foldAt: r.foldAt,
      cadence: r.cadence,
      tips: r.tips,
    }));
  }
}

const STOP = new Set(['about', 'after', 'again', 'their', 'there', 'these', 'those', 'which', 'would', 'could', 'should', 'where', 'while', 'with', 'your', 'yours', 'from', 'have', 'this', 'that', 'what', 'when', 'will', 'just', 'like', 'more', 'most', 'make', 'into', 'than', 'then', 'them', 'they', 'were', 'been', 'being', 'every', 'other', 'because', 'really', 'today', 'https']);

function grade(score: number) {
  return score >= 85 ? 'Excellent' : score >= 70 ? 'Good' : score >= 50 ? 'Fair' : 'Needs work';
}
function fmtDur(sec: number) {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}` : s ? `${m}m ${s}s` : `${m} min`;
}
function sortChecks(c: Check[]) {
  const order: Record<CheckLevel, number> = { bad: 0, warn: 1, info: 2, good: 3 };
  return c.sort((a, b) => order[a.level] - order[b.level]);
}
