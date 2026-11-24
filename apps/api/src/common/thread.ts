/**
 * Splits long text into an X (Twitter) thread. Breaks on paragraph, sentence and word
 * boundaries and numbers each part ("1/3") when there is more than one.
 */
export function splitThread(text: string, limit = 280): string[] {
  const clean = text.trim();
  if ([...clean].length <= limit) return [clean];
  const room = limit - 6; // leave space for " 10/12"
  const tokens = clean.split(/(\s+)/).filter((w) => w !== '');
  const parts: string[] = [];
  let cur = '';
  for (const w of tokens) {
    if ([...(cur + w)].length <= room) {
      cur += w;
      continue;
    }
    if (cur.trim()) parts.push(cur.trim());
    // A single word longer than the room is hard-wrapped.
    let rest = w.trim();
    while ([...rest].length > room) {
      parts.push([...rest].slice(0, room).join(''));
      rest = [...rest].slice(room).join('');
    }
    cur = rest;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts.length > 1 ? parts.map((p, i) => `${p} ${i + 1}/${parts.length}`) : parts;
}

const HASHTAG = /(^|\s)#[\p{L}\p{N}_]+/gu;

/** Pulls hashtags out of a caption, e.g. to post them as the first comment instead. */
export function extractHashtags(text: string): { body: string; hashtags: string } {
  const tags = text.match(HASHTAG)?.map((t) => t.trim()) ?? [];
  if (!tags.length) return { body: text, hashtags: '' };
  const body = text
    .replace(HASHTAG, '$1')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { body, hashtags: [...new Set(tags)].join(' ') };
}
