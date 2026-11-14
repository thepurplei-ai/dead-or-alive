// Starts an AI render: validates, moderates the prompt, reserves credits (in SQL), queues a durable job.
import { body, flag, handler, HttpError, json, kickWorker, openaiFromEnv, requireEligible, requireUser, runwayFromEnv } from '../_shared/http.ts';
import { ASPECTS, checkPrompt, COST, KINDS, oneOf, STYLES } from '../_shared/rules.ts';

Deno.serve(handler(async (req) => {
  const { userId, sb } = await requireUser(req);
  await requireEligible(sb, userId);
  if (!(await flag(sb, 'generation_enabled'))) throw new HttpError(503, 'AI rendering is paused right now.');
  const b = await body(req);
  const kind = oneOf(b.kind, KINDS, 'text_to_image');
  const prompt = checkPrompt(b.prompt);
  const style = oneOf(b.style, STYLES, 'Cinematic');
  const aspect = oneOf(b.aspect, ASPECTS, '9:16');
  const idem = String(b.idempotencyKey ?? '');
  if (idem.length < 8 || idem.length > 200) throw new HttpError(400, 'Missing request id');
  const scene = b.sceneNumber == null ? null : Math.max(1, Math.min(12, Number(b.sceneNumber) | 0));

  const ai = openaiFromEnv();
  if (!ai) throw new HttpError(503, 'AI rendering is not connected yet.');
  const isVideo = kind === 'image_to_video' || kind === 'video_to_video';
  if (isVideo && !runwayFromEnv()) throw new HttpError(503, 'Video rendering is not connected yet.');
  const flagged = await ai.moderate(prompt);
  if (flagged.length) throw new HttpError(422, 'This idea cannot be made on WonderReel.');

  const { data: job, error } = await sb.rpc('service_create_job', {
    p_owner: userId, p_project: String(b.projectId ?? ''), p_kind: kind, p_prompt: prompt, p_style: style, p_aspect: aspect,
    p_scene: scene, p_source: b.sourceMediaId ? String(b.sourceMediaId) : null,
    p_provider: isVideo ? 'runway' : 'openai',
    p_model: isVideo ? (kind === 'image_to_video' ? Deno.env.get('RUNWAY_IMAGE_TO_VIDEO_MODEL') : Deno.env.get('RUNWAY_VIDEO_TO_VIDEO_MODEL')) ?? null : Deno.env.get('OPENAI_IMAGE_MODEL') ?? null,
    p_cost: COST[kind], p_idem: `${userId}:${idem}`,
  });
  if (error) throw new HttpError(400, error.message);
  kickWorker();
  return json(202, {
    id: job.id, kind: job.kind, status: job.status, createdAt: job.created_at, updatedAt: job.updated_at, creditsReserved: job.credits_reserved,
  });
}));
