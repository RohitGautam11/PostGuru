import { Provider } from '@prisma/client';

/**
 * Platform best practices used by the Growth Assistant. These are guidelines distilled from each
 * platform's own creator documentation and widely published benchmarks; they are recommendations,
 * not guarantees. Keep this file as the single place to tune them.
 */
export interface PlatformRules {
  label: string;
  /** Ideal caption/body length window (characters). */
  idealLength: [number, number];
  /** Characters shown before "…more" (the hook must fit here). */
  foldAt: number;
  hashtags: [number, number];
  linksClickable: boolean;
  /** Platform deprioritises posts with external links (move the link to a comment / bio). */
  linkPenalty: boolean;
  prefersVideo: boolean;
  /** Recommended aspect ratios, best first (width:height). */
  ratios: { label: string; value: number }[];
  /** Recommended video duration window in seconds; max is the platform hard limit for most accounts. */
  video?: { ideal: [number, number]; max: number };
  cadence: string;
  tips: string[];
}

const R = (label: string, value: number) => ({ label, value });

export const RULES: Record<Provider, PlatformRules> = {
  INSTAGRAM: {
    label: 'Instagram',
    idealLength: [138, 400],
    foldAt: 125,
    hashtags: [3, 5],
    linksClickable: false,
    linkPenalty: false,
    prefersVideo: true,
    ratios: [R('4:5 portrait (feed)', 4 / 5), R('9:16 vertical (Reels/Stories)', 9 / 16), R('1:1 square', 1)],
    video: { ideal: [7, 90], max: 180 },
    cadence: '3–5 feed posts/Reels per week + daily Stories',
    tips: [
      'Reels get the most non-follower reach: vertical 9:16, hook in the first 1–2 seconds, on-screen text.',
      'Put the hook in the first 125 characters, the rest is hidden behind "more".',
      'Links in captions are not clickable: say "link in bio" instead.',
      'Use 3–5 specific hashtags; Instagram recommends relevant over many.',
      'Ask people to Save or Share. Saves and shares weigh more than likes.',
    ],
  },
  FACEBOOK: {
    label: 'Facebook',
    idealLength: [40, 250],
    foldAt: 480,
    hashtags: [0, 2],
    linksClickable: true,
    linkPenalty: true,
    prefersVideo: true,
    ratios: [R('4:5 portrait', 4 / 5), R('1:1 square', 1), R('9:16 vertical (Reels)', 9 / 16)],
    video: { ideal: [15, 180], max: 14400 },
    cadence: '1 post per day',
    tips: [
      'Short posts (under ~80 characters) with a strong image or Reel get the most engagement.',
      'Native video and Reels outperform links to YouTube.',
      'Ask a question to start a conversation in the comments.',
    ],
  },
  X: {
    label: 'X',
    idealLength: [70, 240],
    foldAt: 280,
    hashtags: [0, 2],
    linksClickable: true,
    linkPenalty: true,
    prefersVideo: false,
    ratios: [R('16:9 landscape', 16 / 9), R('1:1 square', 1)],
    video: { ideal: [15, 60], max: 140 },
    cadence: '1–3 posts per day, plus replies',
    tips: [
      'Lead with the takeaway; one idea per post.',
      'Keep 1–2 hashtags maximum. More looks spammy and reduces reach.',
      'External links reduce reach: post the link in a reply to your own post.',
      'Images or short video roughly double engagement versus text only.',
    ],
  },
  LINKEDIN: {
    label: 'LinkedIn',
    idealLength: [600, 1800],
    foldAt: 210,
    hashtags: [3, 5],
    linksClickable: true,
    linkPenalty: true,
    prefersVideo: false,
    ratios: [R('4:5 portrait', 4 / 5), R('1:1 square', 1), R('16:9 landscape', 16 / 9)],
    video: { ideal: [30, 90], max: 600 },
    cadence: '2–5 posts per week',
    tips: [
      'The first 210 characters show before "…see more". Open with a bold line or a number.',
      'Short paragraphs with line breaks are far easier to read in the feed.',
      'Share a lesson, story or data point; end with a question.',
      'Put external links in the first comment, not the post.',
      'Document (PDF carousel) and image posts get high dwell time.',
    ],
  },
  YOUTUBE: {
    label: 'YouTube',
    idealLength: [200, 5000],
    foldAt: 150,
    hashtags: [2, 3],
    linksClickable: true,
    linkPenalty: false,
    prefersVideo: true,
    ratios: [R('16:9 landscape (long-form)', 16 / 9), R('9:16 vertical (Shorts)', 9 / 16)],
    video: { ideal: [30, 900], max: 43200 },
    cadence: '1–2 long videos per week, or 3–5 Shorts',
    tips: [
      'Title: 40–70 characters, main keyword at the start.',
      'Description: put keywords in the first 150 characters (shown in search).',
      'Add 5–15 tags (main keyword, variations, topic). YouTube uses them for misspellings and context.',
      'Vertical 9:16 videos up to 3 minutes are treated as Shorts.',
      'Add timestamps/chapters (0:00 Intro …) for longer videos.',
    ],
  },
  THREADS: {
    label: 'Threads',
    idealLength: [80, 400],
    foldAt: 500,
    hashtags: [0, 1],
    linksClickable: true,
    linkPenalty: false,
    prefersVideo: false,
    ratios: [R('4:5 portrait', 4 / 5), R('1:1 square', 1), R('9:16 vertical', 9 / 16)],
    video: { ideal: [5, 60], max: 300 },
    cadence: '1–2 posts per day',
    tips: [
      'Conversational, opinion-led posts work best. Ask for replies.',
      'Threads supports one topic tag per post; pick the most relevant.',
      'Reply to every comment in the first hour.',
    ],
  },
  TIKTOK: {
    label: 'TikTok',
    idealLength: [50, 300],
    foldAt: 100,
    hashtags: [3, 5],
    linksClickable: false,
    linkPenalty: false,
    prefersVideo: true,
    ratios: [R('9:16 vertical', 9 / 16)],
    video: { ideal: [15, 60], max: 600 },
    cadence: '1 video per day (minimum 3–5 per week)',
    tips: [
      'Hook in the first second: text on screen + spoken hook.',
      'Use keywords in the caption. TikTok search works like a search engine.',
      'Mix 1–2 broad hashtags with 2–3 niche ones.',
      'Use trending sounds from the TikTok app (the API cannot add sounds).',
    ],
  },
  PINTEREST: {
    label: 'Pinterest',
    idealLength: [100, 500],
    foldAt: 50,
    hashtags: [0, 3],
    linksClickable: true,
    linkPenalty: false,
    prefersVideo: false,
    ratios: [R('2:3 vertical (1000×1500)', 2 / 3), R('9:16 vertical (video)', 9 / 16)],
    video: { ideal: [6, 30], max: 900 },
    cadence: '5–15 fresh Pins per week',
    tips: [
      'Pinterest is a search engine: use keywords in the title (first line) and description.',
      'Use 2:3 vertical images with a text overlay.',
      'Always add a destination link; Pinterest drives website traffic.',
    ],
  },
};

/** Curated hashtag library by niche: broad → specific. Used when the workspace has no history yet. */
export const NICHES: { niche: string; keywords: string[]; tags: { tag: string; reach: 'broad' | 'medium' | 'niche' }[] }[] = [
  { niche: 'Marketing', keywords: ['marketing', 'brand', 'social media', 'content', 'seo', 'ads', 'campaign', 'growth', 'audience'], tags: [
    { tag: 'marketing', reach: 'broad' }, { tag: 'digitalmarketing', reach: 'broad' }, { tag: 'socialmediamarketing', reach: 'medium' }, { tag: 'contentmarketing', reach: 'medium' }, { tag: 'marketingtips', reach: 'medium' }, { tag: 'growthhacking', reach: 'niche' }, { tag: 'brandstrategy', reach: 'niche' } ] },
  { niche: 'Business', keywords: ['business', 'startup', 'founder', 'entrepreneur', 'sales', 'revenue', 'company', 'ceo', 'saas'], tags: [
    { tag: 'business', reach: 'broad' }, { tag: 'entrepreneur', reach: 'broad' }, { tag: 'startup', reach: 'medium' }, { tag: 'smallbusiness', reach: 'medium' }, { tag: 'founders', reach: 'niche' }, { tag: 'saas', reach: 'niche' }, { tag: 'businesstips', reach: 'medium' } ] },
  { niche: 'Technology', keywords: ['tech', 'ai', 'software', 'app', 'code', 'developer', 'programming', 'data', 'cloud', 'automation'], tags: [
    { tag: 'technology', reach: 'broad' }, { tag: 'ai', reach: 'broad' }, { tag: 'artificialintelligence', reach: 'medium' }, { tag: 'tech', reach: 'broad' }, { tag: 'programming', reach: 'medium' }, { tag: 'developer', reach: 'medium' }, { tag: 'automation', reach: 'niche' } ] },
  { niche: 'Fitness', keywords: ['fitness', 'gym', 'workout', 'health', 'training', 'yoga', 'run', 'muscle', 'diet'], tags: [
    { tag: 'fitness', reach: 'broad' }, { tag: 'workout', reach: 'broad' }, { tag: 'fitnessmotivation', reach: 'medium' }, { tag: 'healthylifestyle', reach: 'medium' }, { tag: 'gymlife', reach: 'medium' }, { tag: 'homeworkout', reach: 'niche' }, { tag: 'fitnesstips', reach: 'niche' } ] },
  { niche: 'Food', keywords: ['food', 'recipe', 'cook', 'restaurant', 'chef', 'dinner', 'cafe', 'bake', 'kitchen'], tags: [
    { tag: 'food', reach: 'broad' }, { tag: 'foodie', reach: 'broad' }, { tag: 'recipe', reach: 'medium' }, { tag: 'homecooking', reach: 'medium' }, { tag: 'foodblogger', reach: 'medium' }, { tag: 'easyrecipes', reach: 'niche' }, { tag: 'foodstagram', reach: 'medium' } ] },
  { niche: 'Travel', keywords: ['travel', 'trip', 'tour', 'hotel', 'beach', 'mountain', 'vacation', 'holiday', 'flight'], tags: [
    { tag: 'travel', reach: 'broad' }, { tag: 'travelgram', reach: 'broad' }, { tag: 'wanderlust', reach: 'medium' }, { tag: 'traveltips', reach: 'medium' }, { tag: 'travelblogger', reach: 'medium' }, { tag: 'hiddengems', reach: 'niche' }, { tag: 'budgettravel', reach: 'niche' } ] },
  { niche: 'Fashion & Beauty', keywords: ['fashion', 'style', 'outfit', 'beauty', 'makeup', 'skincare', 'hair', 'wear', 'look'], tags: [
    { tag: 'fashion', reach: 'broad' }, { tag: 'style', reach: 'broad' }, { tag: 'ootd', reach: 'medium' }, { tag: 'beauty', reach: 'broad' }, { tag: 'skincare', reach: 'medium' }, { tag: 'makeuptutorial', reach: 'niche' }, { tag: 'styleinspo', reach: 'niche' } ] },
  { niche: 'Real Estate', keywords: ['real estate', 'property', 'home', 'house', 'apartment', 'rent', 'realtor', 'interior'], tags: [
    { tag: 'realestate', reach: 'broad' }, { tag: 'property', reach: 'medium' }, { tag: 'dreamhome', reach: 'medium' }, { tag: 'realtor', reach: 'medium' }, { tag: 'homedecor', reach: 'broad' }, { tag: 'firsttimehomebuyer', reach: 'niche' }, { tag: 'interiordesign', reach: 'medium' } ] },
  { niche: 'Education', keywords: ['learn', 'education', 'course', 'student', 'study', 'teach', 'tips', 'tutorial', 'guide', 'how to'], tags: [
    { tag: 'education', reach: 'broad' }, { tag: 'learning', reach: 'broad' }, { tag: 'studytips', reach: 'medium' }, { tag: 'onlinelearning', reach: 'medium' }, { tag: 'tutorial', reach: 'medium' }, { tag: 'learnontiktok', reach: 'medium' }, { tag: 'careeradvice', reach: 'niche' } ] },
  { niche: 'Finance', keywords: ['money', 'finance', 'invest', 'stock', 'crypto', 'saving', 'budget', 'wealth', 'trading'], tags: [
    { tag: 'finance', reach: 'broad' }, { tag: 'investing', reach: 'broad' }, { tag: 'personalfinance', reach: 'medium' }, { tag: 'moneytips', reach: 'medium' }, { tag: 'financialfreedom', reach: 'medium' }, { tag: 'stockmarket', reach: 'medium' }, { tag: 'budgeting', reach: 'niche' } ] },
  { niche: 'Motivation & Lifestyle', keywords: ['life', 'motivation', 'mindset', 'success', 'inspire', 'goal', 'habit', 'daily', 'productivity'], tags: [
    { tag: 'motivation', reach: 'broad' }, { tag: 'mindset', reach: 'broad' }, { tag: 'success', reach: 'broad' }, { tag: 'productivity', reach: 'medium' }, { tag: 'selfimprovement', reach: 'medium' }, { tag: 'dailyhabits', reach: 'niche' }, { tag: 'personaldevelopment', reach: 'medium' } ] },
];

export const CTA_RE = /\b(comment|share|save|follow|subscribe|like|tag|dm|message us|link in bio|click|sign up|register|join|download|learn more|shop|book|order|try|reply|repost|let me know|tell me|what do you think)\b/i;
export const HOOK_RE = /^(\d+|how|why|what|stop|never|the secret|here'?s|this is|you|i |we |most people|did you know|unpopular opinion|hot take|new:|breaking)/i;
export const HASHTAG_RE = /#([\p{L}\p{N}_]+)/gu;
export const EMOJI_RE = /\p{Extended_Pictographic}/gu;
