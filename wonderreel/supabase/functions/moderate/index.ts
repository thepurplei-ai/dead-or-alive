// Moderator actions that touch storage: queue previews (signed URLs) and post approval,
// which copies the approved file into the public bucket. Role is checked server-side.
import { body, handler, HttpError, json, requireUser } from '../_shared/http.ts';
import { extFor } from '../_shared/rules.ts';

Deno.serve(handler(async (req) => {
  const { userId, sb } = await requireUser(req);
  const { data: me } = await sb.from('profiles').select('role, status').eq('id', userId).single();
  if (!me || me.status !== 'active' || !['moderator', 'admin'].includes(me.role)) throw new HttpError(403, 'Moderators only');
  const b = await body(req);

  if (b.action === 'queue') {
    const { data, error } = await sb.rpc('service_admin_queue');
    if (error) throw new HttpError(400, error.message);
    const items = await Promise.all((data ?? []).map(async (it: { output_media_id: string | null }) => {
      if (!it.output_media_id) return { ...it, preview_url: null };
      const { data: m } = await sb.from('media_assets').select('path').eq('id', it.output_media_id).single();
      const { data: s } = m ? await sb.storage.from('private-media').createSignedUrl(m.path, 900) : { data: null };
      return { ...it, preview_url: s?.signedUrl ?? null };
    }));
    return json(200, { items });
  }

  const kind = String(b.kind), id = String(b.id), decision = String(b.decision), note = String(b.note ?? '').slice(0, 500);
  if (kind === 'post') {
    const { data: post } = await sb.from('posts').select('id, output_media_id, status').eq('id', id).single();
    if (!post) throw new HttpError(404, 'Post not found');
    if (decision === 'approve') {
      const { data: m } = await sb.from('media_assets').select('path, kind, mime_type').eq('id', post.output_media_id).single();
      if (!m) throw new HttpError(400, 'Post media is missing');
      const file = await sb.storage.from('private-media').download(m.path);
      if (file.error) throw new HttpError(500, file.error.message);
      const publicPath = `posts/${post.id}.${extFor(m.mime_type)}`;
      const up = await sb.storage.from('public-media').upload(publicPath, file.data, { contentType: m.mime_type, upsert: true });
      if (up.error) throw new HttpError(500, up.error.message);
      await sb.from('posts').update(m.kind === 'video' ? { video_path: publicPath } : { poster_path: publicPath }).eq('id', post.id);
    } else {
      const { data: files } = await sb.storage.from('public-media').list('posts', { search: post.id });
      if (files?.length) await sb.storage.from('public-media').remove(files.map((f) => `posts/${f.name}`));
    }
  }
  if (kind === 'report' && decision === 'takedown') {
    const { data: rep } = await sb.from('reports').select('post_id').eq('id', id).single();
    if (rep?.post_id) {
      const { data: files } = await sb.storage.from('public-media').list('posts', { search: rep.post_id });
      if (files?.length) await sb.storage.from('public-media').remove(files.map((f) => `posts/${f.name}`));
    }
  }
  const { error } = await sb.rpc('service_decide', { p_actor: userId, p_kind: kind, p_id: id, p_decision: decision, p_note: note });
  if (error) throw new HttpError(400, error.message);
  return json(200, { ok: true });
}));
