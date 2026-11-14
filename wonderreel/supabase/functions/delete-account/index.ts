// Full account deletion: storage files first, then the auth user (database rows cascade).
import { body, handler, HttpError, json, requireUser } from '../_shared/http.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

async function removeFolder(sb: SupabaseClient, bucket: string, prefix: string) {
  const { data } = await sb.storage.from(bucket).list(prefix, { limit: 1000 });
  for (const item of data ?? []) {
    const path = `${prefix}/${item.name}`;
    if (item.id === null) await removeFolder(sb, bucket, path); // folder
    else await sb.storage.from(bucket).remove([path]);
  }
}

Deno.serve(handler(async (req) => {
  const { userId, sb } = await requireUser(req);
  const b = await body(req);
  if (b.confirm !== 'DELETE') throw new HttpError(400, 'Confirmation missing');
  const { data: req0 } = await sb.from('deletion_requests').insert({ user_id: userId }).select('id').single();
  await removeFolder(sb, 'private-media', userId);
  const { data: posts } = await sb.from('posts').select('id').eq('creator_id', userId);
  for (const p of posts ?? []) {
    const { data: files } = await sb.storage.from('public-media').list('posts', { search: p.id });
    if (files?.length) await sb.storage.from('public-media').remove(files.map((f) => `posts/${f.name}`));
  }
  const { error } = await sb.auth.admin.deleteUser(userId);
  if (error) throw new HttpError(500, 'Deletion failed, please try again: ' + error.message);
  if (req0) await sb.from('deletion_requests').update({ completed_at: new Date().toISOString() }).eq('id', req0.id);
  return json(200, { ok: true });
}));
