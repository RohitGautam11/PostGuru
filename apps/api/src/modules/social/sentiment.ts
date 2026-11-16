import { Sentiment } from '@prisma/client';

// Lightweight lexicon-based classifier: good enough to triage comments without an external ML service.
const POSITIVE = [
  'love', 'great', 'awesome', 'amazing', 'excellent', 'thanks', 'thank you', 'good', 'nice', 'perfect', 'best',
  'beautiful', 'fantastic', 'wonderful', 'happy', 'cool', 'helpful', 'recommend', 'brilliant', 'congrats', '❤', '😍', '🔥', '👍', '🙌',
];
const NEGATIVE = [
  'hate', 'bad', 'terrible', 'awful', 'worst', 'scam', 'refund', 'broken', 'disappointed', 'angry', 'useless', 'poor',
  'problem', 'issue', 'not working', 'doesn\'t work', 'never', 'complaint', 'slow', 'rude', 'fake', '👎', '😡', '😠',
];

export function classifySentiment(text: string): Sentiment {
  const t = text.toLowerCase();
  const pos = POSITIVE.filter((w) => t.includes(w)).length;
  const neg = NEGATIVE.filter((w) => t.includes(w)).length;
  if (neg > pos) return 'NEGATIVE';
  if (pos > neg) return 'POSITIVE';
  return 'NEUTRAL';
}
