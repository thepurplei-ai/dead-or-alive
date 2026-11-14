// Background worker: leases due jobs, talks to providers, stores outputs privately.
// Triggered by pg_cron every minute (see supabase/cron.sql) and after each new job.
import { HttpError, json, claudeFromEnv, runwayFromEnv, service, workerSecret } from '../_shared/http.ts';
import { processJob, type Job } from '../_shared/worker.ts';
import { extFor } from '../_shared/rules.ts';

Deno.serve(async (req) => {
  const secret = workerSecret();
  if (!secret || req.headers.get('x-worker-secret') !== secret) return json(401, { error: 'unauthorized' });
  const sb = service();
  const ai = claudeFromEnv();
  const renderer = runwayFromEnv();
  const { data: jobs, error } = await sb.rpc('service_claim_jobs', { p_limit: 5, p_lease_seconds: 120 });
  if (error) return json(500, { error: error.message });

  const results: Record<string, string> = {};
  for (const job of (jobs ?? []) as Job[]) {
    results[job.id] = await processJob(job, {
      updateJob: async (id, status, o = {}) => {
        const { error } = await sb.rpc('service_update_job', {
          p_id: id, p_status: status, p_provider_task: o.providerTask ?? null, p_output: o.outputMediaId ?? null,
          p_error: o.error ?? null, p_next_poll_seconds: o.nextPollSeconds ?? 10,
        });
        if (error) throw new HttpError(500, error.message);
      },
      sourceUrl: async (mediaId) => {
        const { data: m } = await sb.from('media_assets').select('owner_id, path, status, contains_minor').eq('id', mediaId).single();
        if (!m || m.owner_id !== job.owner_id || m.status !== 'ready' || m.contains_minor) throw new HttpError(400, 'Source media is not available');
        const { data } = await sb.storage.from('private-media').createSignedUrl(m.path, 900);
        if (!data) throw new HttpError(500, 'Could not sign source media');
        return data.signedUrl;
      },
      saveOutput: async (j, bytes, mime) => {
        const path = `${j.owner_id}/${j.project_id}/out-${j.id}.${extFor(mime)}`;
        const up = await sb.storage.from('private-media').upload(path, bytes, { contentType: mime, upsert: true });
        if (up.error) throw new HttpError(500, up.error.message);
        const { data: m, error } = await sb.from('media_assets').upsert({
          owner_id: j.owner_id, project_id: j.project_id, bucket: 'private-media', path, role: 'output',
          kind: mime.startsWith('video/') ? 'video' : 'image', mime_type: mime, size_bytes: bytes.length, status: 'ready',
        }, { onConflict: 'path' }).select('id').single();
        if (error) throw new HttpError(500, error.message);
        const { data: s } = await sb.storage.from('private-media').createSignedUrl(path, 600);
        return { mediaId: m.id, signedUrl: s!.signedUrl };
      },
      renderer,
      moderateImage: async (url) => (ai ? ai.moderate('AI generated output image', url) : ['moderation_unavailable']),
    }).catch(() => 'error');
  }
  const { data: reaped } = await sb.rpc('service_reap_stalled', { p_older_than: '2 hours' });
  return json(200, { processed: results, reaped });
});
