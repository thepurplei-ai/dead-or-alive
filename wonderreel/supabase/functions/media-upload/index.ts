// Issues a short-lived signed upload URL into the caller's own private folder.
import { body, handler, HttpError, json, requireEligible, requireUser } from '../_shared/http.ts';
import { checkUpload, extFor } from '../_shared/rules.ts';

Deno.serve(handler(async (req) => {
  const { userId, sb } = await requireUser(req);
  await requireEligible(sb, userId);
  const b = await body(req);
  const { kind, mime } = checkUpload(b.kind, b.mimeType, b.sizeBytes, b.durationMs);
  const projectId = String(b.projectId ?? '');
  const { data: proj } = await sb.from('projects').select('id, owner_id, is_family').eq('id', projectId).maybeSingle();
  if (!proj || proj.owner_id !== userId) throw new HttpError(404, 'Project not found');
  if (proj.is_family) throw new HttpError(403, 'Family Mode media never leaves your phone.');

  const path = `${userId}/${projectId}/src-${crypto.randomUUID()}.${extFor(mime)}`;
  const { data: media, error } = await sb.from('media_assets').insert({
    owner_id: userId, project_id: projectId, bucket: 'private-media', path, role: 'source', kind, mime_type: mime,
    size_bytes: b.sizeBytes ?? null, duration_ms: b.durationMs ?? null, status: 'pending_upload',
  }).select('id').single();
  if (error) throw new HttpError(400, error.message);
  const { data: signed, error: e2 } = await sb.storage.from('private-media').createSignedUploadUrl(path);
  if (e2 || !signed) throw new HttpError(500, 'Could not prepare the upload');
  return json(200, { mediaId: media.id, path, token: signed.token });
}));
