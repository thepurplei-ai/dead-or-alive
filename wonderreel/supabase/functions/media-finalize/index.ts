// Checks an uploaded file really is what it claims, scans images, then marks it ready.
import { body, handler, HttpError, json, openaiFromEnv, requireUser } from '../_shared/http.ts';
import { sniffMime } from '../_shared/providers.ts';
import { UPLOAD } from '../_shared/rules.ts';

Deno.serve(handler(async (req) => {
  const { userId, sb } = await requireUser(req);
  const b = await body(req);
  const { data: m } = await sb.from('media_assets').select('*').eq('id', String(b.mediaId ?? '')).maybeSingle();
  if (!m || m.owner_id !== userId || m.role !== 'source') throw new HttpError(404, 'Upload not found');
  if (m.status !== 'pending_upload') return json(200, { status: m.status });

  const reject = async (msg: string) => {
    await sb.storage.from('private-media').remove([m.path]);
    await sb.from('media_assets').update({ status: 'rejected' }).eq('id', m.id);
    throw new HttpError(422, msg);
  };

  const { data: signed } = await sb.storage.from('private-media').createSignedUrl(m.path, 300);
  if (!signed) throw new HttpError(400, 'The upload did not arrive. Please try again.');
  const head = await fetch(signed.signedUrl, { headers: { range: 'bytes=0-63' } });
  if (!head.ok) throw new HttpError(400, 'The upload did not arrive. Please try again.');
  const bytes = new Uint8Array(await head.arrayBuffer());
  const total = Number(head.headers.get('content-range')?.split('/')[1] ?? head.headers.get('content-length') ?? 0);
  const real = sniffMime(bytes);
  const family = m.kind === 'image' ? 'image/' : 'video/';
  if (!real || !real.startsWith(family)) await reject('That file is not a valid photo or video.');
  if (total > UPLOAD[m.kind as 'image' | 'video'].maxBytes) await reject('That file is too large.');

  if (m.kind === 'image') {
    const ai = openaiFromEnv();
    if (!ai) throw new HttpError(503, 'Safety checks are not connected yet, so uploads are paused.');
    const flagged = await ai.moderate('User source image for an AI movie', signed.signedUrl);
    if (flagged.length) await reject('This photo cannot be used on WonderReel.');
  }
  await sb.from('media_assets').update({ status: 'ready', size_bytes: total || m.size_bytes, mime_type: real }).eq('id', m.id);
  return json(200, { status: 'ready' });
}));
