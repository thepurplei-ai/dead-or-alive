// Adds a comment as the user (RLS + rate limits apply), then auto-moderates it.
import { asUser, body, handler, HttpError, json, openaiFromEnv, requireUser } from '../_shared/http.ts';

Deno.serve(handler(async (req) => {
  const { userId, sb } = await requireUser(req);
  const b = await body(req);
  const text = String(b.body ?? '').trim();
  if (!text || text.length > 600) throw new HttpError(400, 'Comments can be 1–600 characters.');
  if (/(https?:\/\/|www\.)/i.test(text)) throw new HttpError(400, 'Links are not allowed in comments.');
  const { data: c, error } = await asUser(req).from('comments')
    .insert({ post_id: String(b.postId ?? ''), author_id: userId, body: text }).select('id').single();
  if (error) throw new HttpError(400, error.message);

  const ai = openaiFromEnv();
  let status: 'approved' | 'pending' | 'rejected' = 'pending'; // no automatic check → human review
  if (ai) {
    const flagged = await ai.moderate(text).catch(() => null);
    if (flagged) status = flagged.length ? 'rejected' : 'approved';
  }
  if (status !== 'pending') await sb.from('comments').update({ moderation_status: status }).eq('id', c.id);
  return json(200, { id: c.id, status });
}));
