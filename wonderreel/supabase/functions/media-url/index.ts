// Short-lived signed download URL for the caller's own media only.
import { body, handler, HttpError, json, requireUser } from '../_shared/http.ts';

Deno.serve(handler(async (req) => {
  const { userId, sb } = await requireUser(req);
  const b = await body(req);
  const { data: m } = await sb.from('media_assets').select('owner_id, bucket, path, status').eq('id', String(b.mediaId ?? '')).maybeSingle();
  if (!m || m.owner_id !== userId || m.status !== 'ready') throw new HttpError(404, 'Not found');
  const { data } = await sb.storage.from(m.bucket).createSignedUrl(m.path, 600);
  return json(200, { url: data?.signedUrl ?? null });
}));
