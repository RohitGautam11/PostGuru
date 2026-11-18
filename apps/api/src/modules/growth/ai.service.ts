import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { BadGatewayException, BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { Provider } from '@prisma/client';
import { z } from 'zod/v4';
import { env } from '../../config/env';
import { RULES } from './growth.rules';

export const AI_TASKS = ['caption', 'improve', 'hashtags', 'hooks', 'youtube_seo', 'ideas'] as const;
export type AiTask = (typeof AI_TASKS)[number];

export interface AiInput {
  task: AiTask;
  content?: string;
  topic?: string;
  tone?: string;
  audience?: string;
  language?: string;
  providers: Provider[];
}

const Variants = z.object({
  variants: z.array(z.object({ provider: z.string(), text: z.string(), why: z.string() })),
});
const Hashtags = z.object({
  hashtags: z.array(z.object({ tag: z.string(), reach: z.enum(['broad', 'medium', 'niche']), reason: z.string() })),
});
const Hooks = z.object({ hooks: z.array(z.object({ text: z.string(), style: z.string() })) });
const YoutubeSeo = z.object({
  titles: z.array(z.string()),
  description: z.string(),
  tags: z.array(z.string()),
  thumbnailText: z.array(z.string()),
});
const Ideas = z.object({
  ideas: z.array(
    z.object({ title: z.string(), format: z.string(), platforms: z.array(z.string()), hook: z.string(), outline: z.string(), why: z.string() }),
  ),
});

const SYSTEM = `You are the Growth Assistant inside a social media management tool. You help creators, brands and agencies write content that earns reach and engagement on Facebook, Instagram, X, LinkedIn, YouTube, Threads, TikTok and Pinterest.

Rules:
- Follow each platform's conventions and limits given in the request (length, hashtag count, link behaviour, format).
- Lead with a strong hook in the first line. Use plain, specific language. One clear call to action.
- Never invent statistics, quotes, prices, customer names, awards or claims about the user's business. If a fact is needed and not provided, write around it or use a clearly marked placeholder like [your offer].
- Hashtags: lowercase, no spaces, relevant to the content; mix broad, medium and niche reach. Do not include the # in the "tag" field.
- Write in the same language as the user's draft or topic unless a language is specified.
- Keep "why" and "reason" fields to one short sentence that teaches the user something.`;

@Injectable()
export class AiService {
  private readonly log = new Logger(AiService.name);
  private client: Anthropic | null = null;

  enabled() {
    return Boolean(env().ANTHROPIC_API_KEY);
  }

  private anthropic() {
    if (!this.enabled()) throw new ServiceUnavailableException('The AI assistant is not configured. Add ANTHROPIC_API_KEY to the API environment.');
    this.client ??= new Anthropic({ apiKey: env().ANTHROPIC_API_KEY, maxRetries: 2, timeout: 90_000 });
    return this.client;
  }

  private platformBrief(providers: Provider[]) {
    return providers
      .filter((p) => RULES[p])
      .map((p) => {
        const r = RULES[p];
        return `- ${p} (${r.label}): ideal length ${r.idealLength[0]}–${r.idealLength[1]} chars; first ~${r.foldAt} chars visible before "more"; ${r.hashtags[0]}–${r.hashtags[1]} hashtags; links ${r.linksClickable ? (r.linkPenalty ? 'clickable but reduce reach' : 'clickable') : 'NOT clickable (use "link in bio")'}; best formats: ${r.ratios.map((x) => x.label).join(', ')}.`;
      })
      .join('\n');
  }

  async run(input: AiInput) {
    const providers = input.providers.length ? input.providers : (['INSTAGRAM'] as Provider[]);
    const draft = input.content?.trim();
    const topic = input.topic?.trim();
    if (!draft && !topic) throw new BadRequestException('Write a draft or describe a topic first');

    const context = [
      `Platforms:\n${this.platformBrief(providers)}`,
      draft ? `Draft:\n"""\n${draft.slice(0, 6000)}\n"""` : null,
      topic ? `Topic / brief: ${topic.slice(0, 1000)}` : null,
      input.tone ? `Tone: ${input.tone.slice(0, 60)}` : null,
      input.audience ? `Target audience: ${input.audience.slice(0, 200)}` : null,
      input.language ? `Write in: ${input.language.slice(0, 40)}` : null,
    ]
      .filter(Boolean)
      .join('\n\n');

    const tasks: Record<AiTask, { prompt: string; schema: z.ZodType }> = {
      caption: {
        prompt: `Write one ready-to-post caption for EACH platform listed (use the platform key, e.g. "INSTAGRAM", as "provider"), tailored to its conventions. Include hashtags inline at the end where appropriate.`,
        schema: Variants,
      },
      improve: {
        prompt: `Rewrite the draft for EACH platform listed so it is more likely to get reach and engagement: stronger hook, clearer value, better structure, a call to action and the right hashtags. Keep the user's meaning, facts and voice.`,
        schema: Variants,
      },
      hashtags: { prompt: `Suggest 15 hashtags for this content across the listed platforms, mixing broad, medium and niche reach.`, schema: Hashtags },
      hooks: { prompt: `Write 8 alternative opening lines (hooks) for this content, each in a different style (question, number/list, bold claim, story, curiosity gap, contrarian, how-to, mistake).`, schema: Hooks },
      youtube_seo: {
        prompt: `Create YouTube SEO for this video: 3 title options (40–70 characters, main keyword first), a description (keywords in the first 150 characters, a short summary, a call to subscribe, and a "Chapters" section with placeholder timestamps if the video sounds long-form), 10–15 tags (keywords and variations, no #), and 3 short thumbnail text options (max 4 words each).`,
        schema: YoutubeSeo,
      },
      ideas: {
        prompt: `Suggest 8 content ideas likely to perform well for this niche/topic across the listed platforms. For each: a title, the best format (e.g. Reel, carousel, Short, thread, LinkedIn text post, Pin), the platforms it suits, the opening hook, a 2–3 line outline, and why it can perform well.`,
        schema: Ideas,
      },
    };
    const t = tasks[input.task];
    if (!t) throw new BadRequestException('Unknown AI task');

    try {
      // Server-side fallback: if the model declines (refusal), the API retries on a fallback model in the same call.
      const response = await this.anthropic().beta.messages.parse({
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        model: env().AI_MODEL,
        max_tokens: 8000,
        system: SYSTEM,
        output_config: { effort: 'low', format: betaZodOutputFormat(t.schema) },
        messages: [{ role: 'user', content: `${context}\n\nTask: ${t.prompt}` }],
      });
      if (response.stop_reason === 'refusal') throw new BadRequestException('The AI assistant declined this request. Try rephrasing your content.');
      if (!response.parsed_output) throw new BadGatewayException('The AI assistant returned an unexpected response. Please try again.');
      return { task: input.task, result: response.parsed_output };
    } catch (e) {
      if (e instanceof Anthropic.RateLimitError) throw new ServiceUnavailableException('The AI assistant is busy. Try again in a minute.');
      if (e instanceof Anthropic.AuthenticationError) throw new ServiceUnavailableException('The AI assistant key is invalid. Check ANTHROPIC_API_KEY.');
      if (e instanceof Anthropic.APIError) {
        this.log.warn(`Claude API error ${e.status}: ${e.message}`);
        throw new BadGatewayException('The AI assistant is temporarily unavailable.');
      }
      throw e;
    }
  }
}
