// Claude (Anthropic) adapter: the AI Director and the safety checker.
// Runs in Deno Edge Functions and in Node tests (tests pass a mocked fetch).
// Claude does not generate images or video; Runway does that (see providers.ts).
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import * as z from 'zod/v4';
import { ProviderError, type Storyboard } from './providers.ts';

export const DEFAULT_MODEL = 'claude-opus-5-5';

const DirectorOut = z.object({
  reply: z.string(),
  title: z.string(),
  scenes: z.array(z.object({ title: z.string(), description: z.string(), camera: z.string() })),
});

const SafetyOut = z.object({
  allowed: z.boolean(),
  categories: z.array(
    z.enum(['sexual', 'minors', 'violence', 'self_harm', 'hate', 'harassment', 'real_person_likeness', 'illegal', 'spam', 'other']),
  ),
  reason: z.string(),
});

const DIRECTOR_SYSTEM = `You are the AI Director inside WonderReel, an app where adults turn their own photos and videos into short AI movies.
Plan a movie of exactly four scenes. Each scene needs a short title (under 100 characters), a vivid description of what happens on screen (under 220 characters) and a camera direction (under 60 characters).
When the user asks for a change, keep everything they did not mention and change only what they asked for, then say in one short sentence what you changed.
Keep stories safe for a general audience: no sexual content, no gore, no real celebrities or public figures, no logos or trademarks, and never put children in unsafe situations.
If the idea cannot be made safely, set reply to a friendly explanation and offer a safe alternative storyboard.`;

const SAFETY_SYSTEM = `You are the content-safety reviewer for WonderReel, an 18+ AI movie app with a public feed.
Decide whether the given text and/or image may be used. Block (allowed=false) anything with: sexual content or nudity; any minor in a sexualised, unsafe or exploitative context; graphic violence or gore; self-harm; hate or harassment; requests to imitate or deepfake a real, identifiable person or celebrity; illegal activity; spam or scams.
Ordinary adventure, fantasy, comedy, cartoon peril and family scenes are allowed. Judge only what is there; do not guess hidden meanings.
List every matching category and give a one-sentence reason.`;

export type ClaudeConfig = { apiKey: string; model?: string; fetchImpl?: typeof fetch };

function clean(v: unknown, n: number) {
  return String(v ?? '').replace(/https?:\/\/\S+/g, '').trim().slice(0, n);
}

function mapError(e: unknown): never {
  if (e instanceof ProviderError) throw e;
  if (e instanceof Anthropic.RateLimitError) throw new ProviderError('Claude is busy, try again shortly', 429, true);
  if (e instanceof Anthropic.AuthenticationError) throw new ProviderError('Claude API key is invalid', 503, false);
  if (e instanceof Anthropic.BadRequestError) throw new ProviderError(`Claude rejected the request: ${e.message}`.slice(0, 300), 400, false);
  if (e instanceof Anthropic.APIError) throw new ProviderError(`Claude error ${e.status ?? ''}`.trim(), e.status ?? 502, (e.status ?? 500) >= 500);
  if (e instanceof Anthropic.APIConnectionError) throw new ProviderError('Could not reach Claude', 503, true);
  throw new ProviderError((e as Error)?.message ?? 'Claude failed', 502, true);
}

export function claude(cfg: ClaudeConfig) {
  const client = new Anthropic({ apiKey: cfg.apiKey, fetch: cfg.fetchImpl, maxRetries: 2 });
  const model = cfg.model || DEFAULT_MODEL;

  return {
    /** Plan or edit a 4-scene storyboard. */
    async director(input: { prompt: string; style: string; storyboard?: Storyboard | null; message?: string }): Promise<{ storyboard: Storyboard; reply: string }> {
      const text = [
        `Visual style: ${input.style}`,
        `Story idea: ${input.prompt}`,
        input.storyboard ? `Current storyboard: ${JSON.stringify({ title: input.storyboard.title, scenes: input.storyboard.scenes })}` : '',
        input.message ? `Requested change: ${input.message}` : 'Create the first storyboard.',
      ].filter(Boolean).join('\n');
      let res;
      try {
        res = await client.beta.messages.parse({
          model,
          max_tokens: 4000,
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          output_config: { effort: 'low', format: zodOutputFormat(DirectorOut) },
          system: DIRECTOR_SYSTEM,
          messages: [{ role: 'user', content: text }],
        });
      } catch (e) {
        mapError(e);
      }
      if (res.stop_reason === 'refusal') throw new ProviderError('This idea cannot be made on WonderReel.', 422, false);
      const out = res.parsed_output;
      if (!out || out.scenes.length !== 4) throw new ProviderError('AI Director did not return four scenes', 502, true);
      return {
        reply: clean(out.reply, 200) || 'Here is your plan.',
        storyboard: {
          title: clean(out.title, 100) || 'Your adventure',
          theme: 'ai',
          style: input.style,
          prompt: input.prompt,
          source: 'ai',
          scenes: out.scenes.map((s, i) => ({
            number: i + 1, title: clean(s.title, 100) || 'Scene', description: clean(s.description, 220), camera: clean(s.camera, 60) || undefined, durationSec: 5,
          })),
        },
      };
    },

    /** Safety check for text and an optional image (https URL). Returns blocked categories, [] when allowed. */
    async moderate(text: string, imageUrl?: string): Promise<string[]> {
      const content: Anthropic.Beta.BetaContentBlockParam[] = [];
      if (imageUrl) content.push({ type: 'image', source: { type: 'url', url: imageUrl } });
      content.push({ type: 'text', text: `Review this${imageUrl ? ' image and' : ''} text:\n<content>\n${text.slice(0, 8000)}\n</content>` });
      let res;
      try {
        // No fallback model here on purpose: if Claude declines to look at it, it is treated as blocked.
        res = await client.beta.messages.parse({
          model,
          max_tokens: 1000,
          output_config: { effort: 'low', format: zodOutputFormat(SafetyOut) },
          system: SAFETY_SYSTEM,
          messages: [{ role: 'user', content }],
        });
      } catch (e) {
        mapError(e);
      }
      if (res.stop_reason === 'refusal') return ['refused'];
      const out = res.parsed_output;
      if (!out) throw new ProviderError('Safety check returned no answer', 502, true);
      return out.allowed ? [] : out.categories.length ? out.categories : ['other'];
    },
  };
}
