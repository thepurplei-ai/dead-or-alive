// Portable export of the caller's own data (no other users' data).
import { handler, json, requireUser } from '../_shared/http.ts';

Deno.serve(handler(async (req) => {
  const { userId, sb } = await requireUser(req);
  const pick = async (table: string, col: string) => (await sb.from(table).select('*').eq(col, userId)).data ?? [];
  return json(200, {
    profile: (await sb.from('profiles').select('*').eq('id', userId).single()).data,
    consents: await pick('consent_records', 'user_id'),
    projects: await pick('projects', 'owner_id'),
    media: (await pick('media_assets', 'owner_id')).map((m: Record<string, unknown>) => ({ ...m, path: undefined })),
    jobs: await pick('generation_jobs', 'owner_id'),
    credits: await pick('credit_ledger', 'user_id'),
    posts: await pick('posts', 'creator_id'),
    comments: await pick('comments', 'author_id'),
    likes: await pick('likes', 'user_id'),
    saves: await pick('saves', 'user_id'),
    follows: await pick('follows', 'follower_id'),
    blocks: await pick('blocks', 'blocker_id'),
    reports: await pick('reports', 'reporter_id'),
  });
}));
