// AI Director: plans or edits a 4-scene storyboard. Never used for Family Mode.
import { body, flag, handler, HttpError, json, openaiFromEnv, requireEligible, requireUser } from '../_shared/http.ts';
import { checkPrompt, oneOf, STYLES } from '../_shared/rules.ts';

Deno.serve(handler(async (req) => {
  const { userId, sb } = await requireUser(req);
  await requireEligible(sb, userId);
  const b = await body(req);
  if (b.family) throw new HttpError(403, 'Cloud AI is turned off for Family Mode.');
  if (!(await flag(sb, 'generation_enabled'))) throw new HttpError(503, 'AI is paused right now.');
  const ai = openaiFromEnv();
  if (!ai) throw new HttpError(503, 'The AI Director is not connected yet.');
  const prompt = checkPrompt(b.prompt);
  const style = oneOf(b.style, STYLES, 'Cinematic');
  const message = b.message ? String(b.message).slice(0, 500) : undefined;
  const flagged = await ai.moderate([prompt, message ?? ''].join('\n'));
  if (flagged.length) throw new HttpError(422, 'This idea cannot be made on WonderReel.');
  const r = await ai.director({ prompt, style, storyboard: (b.storyboard as never) ?? null, message });
  return json(200, r);
}));
