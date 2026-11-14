// Every cloud call goes through Supabase: RLS-protected tables, SECURITY DEFINER
// RPCs and authenticated Edge Functions. Paid AI providers are only called server-side.
import type {
  AspectRatio, FeedPost, GenerationJob, GenerationKind, LocalMedia, RemixTemplate, Storyboard, Style,
} from './types';
import { supabase } from './supabase';

export class NotConfiguredError extends Error {
  constructor() {
    super('Cloud features are not connected yet. Your work is saved on this phone.');
    this.name = 'NotConfiguredError';
  }
}
export class AuthRequiredError extends Error {
  constructor() {
    super('Please sign in first.');
    this.name = 'AuthRequiredError';
  }
}

function client() {
  if (!supabase) throw new NotConfiguredError();
  return supabase;
}

async function userId(): Promise<string> {
  const { data } = await client().auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new AuthRequiredError();
  return id;
}

async function fn<T>(name: string, body: unknown): Promise<T> {
  await userId();
  const { data, error } = await client().functions.invoke(name, { body: body as Record<string, unknown> });
  if (error) {
    // Edge Functions return { error: "..." } with a non-2xx status.
    let message = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === 'function') message = (await ctx.json()).error ?? message;
    } catch {}
    throw new Error(message);
  }
  return data as T;
}

function rpcError(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

// ---------- AI Director & generation ----------

export function askDirector(input: { prompt: string; style: Style; storyboard?: Storyboard | null; message?: string; family?: boolean }) {
  return fn<{ storyboard: Storyboard; reply: string }>('director', input);
}

export async function uploadSourceMedia(projectId: string, media: LocalMedia): Promise<string> {
  const ticket = await fn<{ mediaId: string; path: string; token: string }>('media-upload', {
    projectId,
    kind: media.kind,
    mimeType: media.mimeType,
    sizeBytes: media.sizeBytes ?? null,
    durationMs: media.durationMs ?? null,
  });
  const file = await fetch(media.uri);
  const blob = await file.blob();
  const { error } = await client().storage.from('private-media').uploadToSignedUrl(ticket.path, ticket.token, blob, {
    contentType: media.mimeType,
  });
  if (error) throw new Error(error.message);
  await fn('media-finalize', { mediaId: ticket.mediaId });
  return ticket.mediaId;
}

export function startGeneration(input: {
  projectId: string;
  kind: GenerationKind;
  prompt: string;
  style: Style;
  aspect: AspectRatio;
  sourceMediaId?: string;
  sceneNumber?: number;
  idempotencyKey: string;
}) {
  return fn<GenerationJob>('generate', input);
}

export async function getJob(jobId: string): Promise<GenerationJob> {
  const { data, error } = await client()
    .from('generation_jobs')
    .select('id, kind, status, created_at, updated_at, error_message, credits_reserved, output_media_id')
    .eq('id', jobId)
    .single();
  rpcError(error);
  let outputUrl: string | undefined;
  if (data!.output_media_id && data!.status === 'completed') {
    outputUrl = (await signedMediaUrl(data!.output_media_id)) ?? undefined;
  }
  return {
    id: data!.id,
    kind: data!.kind,
    status: data!.status,
    createdAt: data!.created_at,
    updatedAt: data!.updated_at,
    error: data!.error_message ?? undefined,
    creditsReserved: data!.credits_reserved,
    outputUrl,
    outputKind: data!.kind.endsWith('video') ? 'video' : 'image',
  };
}

export async function cancelJob(jobId: string) {
  return fn<{ ok: boolean }>('generate-cancel', { jobId });
}

export async function signedMediaUrl(mediaId: string): Promise<string | null> {
  const r = await fn<{ url: string | null }>('media-url', { mediaId });
  return r.url;
}

// ---------- Cloud projects ----------

export async function upsertCloudProject(p: {
  remoteId?: string;
  title: string;
  prompt: string;
  style: Style;
  aspect: AspectRatio;
  storyboard: Storyboard | null;
  remixTemplateId?: string;
}): Promise<string> {
  const owner = await userId();
  const row = {
    owner_id: owner,
    title: p.title.slice(0, 160),
    prompt: p.prompt.slice(0, 4000),
    style: p.style,
    aspect: p.aspect,
    storyboard: p.storyboard ?? null,
    remix_template_id: p.remixTemplateId ?? null,
  };
  if (p.remoteId) {
    const { error } = await client().from('projects').update(row).eq('id', p.remoteId);
    rpcError(error);
    return p.remoteId;
  }
  const { data, error } = await client().from('projects').insert(row).select('id').single();
  rpcError(error);
  return data!.id as string;
}

export async function deleteCloudProject(remoteId: string) {
  const { error } = await client().from('projects').delete().eq('id', remoteId);
  rpcError(error);
}

// ---------- Publishing (always moderated) ----------

export async function requestPublish(input: { projectId: string; outputMediaId?: string; caption: string; allowRemix: boolean; tags: string[] }) {
  const { data, error } = await client().rpc('request_publish', {
    p_project_id: input.projectId,
    p_caption: input.caption,
    p_allow_remix: input.allowRemix,
    p_tags: input.tags,
  });
  rpcError(error);
  return data as string;
}

// ---------- Feed & social ----------

type FeedRow = {
  id: string; creator_id: string; handle: string; title: string; caption: string; tags: string[];
  like_count: number; comment_count: number; poster_path: string | null; video_path: string | null;
  allow_remix: boolean; template: RemixTemplate | null; remixed_from_post: string | null; remixed_from_handle: string | null;
  published_at: string;
};

export async function fetchFeed(tab: 'for_you' | 'following', cursor?: string): Promise<{ posts: FeedPost[]; next?: string }> {
  const { data, error } = await client().rpc('feed', { p_tab: tab, p_cursor: cursor ?? null, p_limit: 10 });
  rpcError(error);
  const rows = (data ?? []) as FeedRow[];
  const posts = await Promise.all(
    rows.map(async (r): Promise<FeedPost> => ({
      id: r.id,
      creatorId: r.creator_id,
      handle: r.handle,
      avatarLetter: r.handle.charAt(0).toUpperCase(),
      title: r.title,
      caption: r.caption,
      tags: r.tags ?? [],
      likeCount: r.like_count,
      commentCount: r.comment_count,
      posterUrl: r.poster_path ? publicMediaUrl(r.poster_path) : undefined,
      videoUrl: r.video_path ? publicMediaUrl(r.video_path) : undefined,
      aiGenerated: true,
      allowRemix: r.allow_remix,
      template: r.template ?? undefined,
      remixedFrom: r.remixed_from_post ? { postId: r.remixed_from_post, handle: r.remixed_from_handle ?? 'creator' } : undefined,
      sample: false,
    })),
  );
  return { posts, next: rows.length ? rows[rows.length - 1].published_at : undefined };
}

function publicMediaUrl(path: string) {
  // Only moderator-approved media is copied into the public bucket.
  return client().storage.from('public-media').getPublicUrl(path).data.publicUrl;
}

export async function setLike(postId: string, on: boolean) {
  const uid = await userId();
  const q = on
    ? client().from('likes').insert({ post_id: postId, user_id: uid })
    : client().from('likes').delete().match({ post_id: postId, user_id: uid });
  rpcError((await q).error);
}
export async function setSave(postId: string, on: boolean) {
  const uid = await userId();
  const q = on
    ? client().from('saves').insert({ post_id: postId, user_id: uid })
    : client().from('saves').delete().match({ post_id: postId, user_id: uid });
  rpcError((await q).error);
}
export async function setFollow(creatorId: string, on: boolean) {
  const uid = await userId();
  const q = on
    ? client().from('follows').insert({ follower_id: uid, following_id: creatorId })
    : client().from('follows').delete().match({ follower_id: uid, following_id: creatorId });
  rpcError((await q).error);
}
export async function blockUser(creatorId: string) {
  const uid = await userId();
  rpcError((await client().from('blocks').insert({ blocker_id: uid, blocked_id: creatorId })).error);
}
export async function reportPost(postId: string, reason: string, details: string) {
  const uid = await userId();
  rpcError((await client().from('reports').insert({ reporter_id: uid, post_id: postId, reason, details })).error);
}
export async function fetchComments(postId: string) {
  const { data, error } = await client()
    .from('comments')
    .select('id, body, created_at, moderation_status, author:profiles(handle)')
    .eq('post_id', postId)
    .order('created_at', { ascending: false })
    .limit(100);
  rpcError(error);
  return data ?? [];
}
export function addComment(postId: string, body: string) {
  return fn<{ id: string; status: 'approved' | 'pending' | 'rejected' }>('comment', { postId, body });
}

// ---------- Account ----------

export async function getMyProfile() {
  const uid = await userId();
  const { data, error } = await client()
    .from('profiles')
    .select('id, handle, display_name, bio, adult_status, role, created_at')
    .eq('id', uid)
    .maybeSingle();
  rpcError(error);
  return data;
}
export async function updateMyProfile(p: { handle: string; display_name: string; bio: string }) {
  const uid = await userId();
  rpcError((await client().from('profiles').update(p).eq('id', uid)).error);
}
export async function recordConsent(kind: 'terms' | 'privacy' | 'ai_processing' | 'adult_declaration', version: string) {
  const { error } = await client().rpc('record_consent', { p_kind: kind, p_version: version });
  rpcError(error);
}
export async function declareBirthDate(dob: string) {
  const { data, error } = await client().rpc('declare_birth_date', { p_dob: dob });
  rpcError(error);
  return data as 'declared_adult' | 'underage';
}
export async function creditBalance(): Promise<number> {
  const { data, error } = await client().rpc('my_credit_balance');
  rpcError(error);
  return Number(data ?? 0);
}
export async function creditHistory() {
  const { data, error } = await client()
    .from('credit_ledger')
    .select('id, delta, kind, reason, created_at')
    .order('created_at', { ascending: false })
    .limit(50);
  rpcError(error);
  return data ?? [];
}
export function deleteAccount() {
  return fn<{ ok: boolean }>('delete-account', { confirm: 'DELETE' });
}
export function exportMyData() {
  return fn<Record<string, unknown>>('export-data', {});
}

// ---------- Moderation (server checks the moderator role) ----------

export async function moderationQueue() {
  const { data, error } = await client().rpc('admin_queue');
  rpcError(error);
  return (data ?? []) as {
    kind: 'post' | 'comment' | 'report'; id: string; title: string; body: string; handle: string; created_at: string; preview_url: string | null;
  }[];
}
export async function moderationDecide(kind: 'post' | 'comment' | 'report', id: string, decision: 'approve' | 'reject' | 'takedown' | 'dismiss', note: string) {
  const { error } = await client().rpc('admin_decide', { p_kind: kind, p_id: id, p_decision: decision, p_note: note });
  rpcError(error);
}
export async function getFlags() {
  const { data, error } = await client().from('feature_flags').select('key, enabled');
  rpcError(error);
  return Object.fromEntries((data ?? []).map((r) => [r.key, r.enabled])) as Record<string, boolean>;
}
export async function setFlag(key: string, enabled: boolean) {
  const { error } = await client().rpc('admin_set_flag', { p_key: key, p_enabled: enabled });
  rpcError(error);
}
