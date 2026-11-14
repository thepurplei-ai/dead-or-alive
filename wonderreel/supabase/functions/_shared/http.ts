// Deno-only helpers for Edge Functions.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { openai, runway } from './providers.ts';
import { HttpError } from './rules.ts';

export { HttpError };

const env = (k: string) => Deno.env.get(k) ?? '';

export const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

export function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json', 'cache-control': 'no-store' } });
}

/** Service-role client. Lives only inside Edge Functions; never shipped to the app. */
export function service(): SupabaseClient {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
}

/** Verifies the caller's JWT and returns their user id. */
export async function requireUser(req: Request): Promise<{ userId: string; sb: SupabaseClient }> {
  const auth = req.headers.get('authorization') ?? '';
  if (!auth.startsWith('Bearer ')) throw new HttpError(401, 'Sign in first');
  const sb = service();
  const { data, error } = await sb.auth.getUser(auth.slice(7));
  if (error || !data.user) throw new HttpError(401, 'Your session has expired. Please sign in again.');
  return { userId: data.user.id, sb };
}

export async function requireEligible(sb: SupabaseClient, userId: string) {
  const { data } = await sb.from('profiles').select('adult_status, status, role').eq('id', userId).single();
  if (!data || data.status !== 'active' || !['declared_adult', 'verified_adult'].includes(data.adult_status)) {
    throw new HttpError(403, 'This feature is only for adult accounts.');
  }
  return data as { adult_status: string; status: string; role: 'user' | 'moderator' | 'admin' };
}

export async function flag(sb: SupabaseClient, key: string): Promise<boolean> {
  const { data } = await sb.from('feature_flags').select('enabled').eq('key', key).maybeSingle();
  return !!data?.enabled;
}

export function openaiFromEnv() {
  const apiKey = env('OPENAI_API_KEY');
  if (!apiKey) return null;
  return openai({
    apiKey,
    directorModel: env('OPENAI_DIRECTOR_MODEL') || undefined,
    imageModel: env('OPENAI_IMAGE_MODEL') || undefined,
    moderationModel: env('OPENAI_MODERATION_MODEL') || undefined,
  });
}

export function runwayFromEnv() {
  const apiKey = env('RUNWAYML_API_SECRET');
  if (!apiKey) return null;
  return runway({
    apiKey,
    imageToVideoModel: env('RUNWAY_IMAGE_TO_VIDEO_MODEL') || undefined,
    videoToVideoModel: env('RUNWAY_VIDEO_TO_VIDEO_MODEL') || undefined,
    apiVersion: env('RUNWAY_API_VERSION') || undefined,
  });
}

export function handler(fn: (req: Request) => Promise<Response>) {
  return async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    if (req.method !== 'POST') return json(405, { error: 'Use POST' });
    try {
      return await fn(req);
    } catch (e) {
      if (e instanceof HttpError) return json(e.status, { error: e.message });
      const msg = (e as Error)?.message ?? 'Unexpected error';
      // Database business-rule errors are safe to show; never log request bodies or media.
      console.error('function error', msg.slice(0, 200));
      return json(/rate_limited/.test(msg) ? 429 : 400, { error: msg.replace(/^rate_limited: /, '') });
    }
  };
}

export async function body(req: Request): Promise<Record<string, unknown>> {
  const text = await req.text();
  if (text.length > 64_000) throw new HttpError(413, 'Request too large');
  try { return text ? JSON.parse(text) : {}; } catch { throw new HttpError(400, 'Invalid JSON'); }
}

/** A client that acts as the calling user, so RLS and rate limits apply to them. */
export function asUser(req: Request): SupabaseClient {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    auth: { persistSession: false },
    global: { headers: { authorization: req.headers.get('authorization') ?? '' } },
  });
}

export function workerSecret() {
  return env('WORKER_SECRET');
}

/** Ask the worker to run now (fire and forget). pg_cron also runs it every minute. */
export function kickWorker() {
  const secret = workerSecret();
  if (!secret) return;
  fetch(`${env('SUPABASE_URL')}/functions/v1/jobs-worker`, {
    method: 'POST',
    headers: { 'x-worker-secret': secret, 'content-type': 'application/json' },
    body: '{}',
  }).catch(() => {});
}
