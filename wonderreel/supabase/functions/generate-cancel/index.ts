import { body, handler, HttpError, json, requireUser, runwayFromEnv } from '../_shared/http.ts';

Deno.serve(handler(async (req) => {
  const { userId, sb } = await requireUser(req);
  const b = await body(req);
  const { data: job } = await sb.from('generation_jobs').select('id, owner_id, provider, provider_task_id, status').eq('id', String(b.jobId ?? '')).maybeSingle();
  if (!job || job.owner_id !== userId) throw new HttpError(404, 'Job not found');
  if (job.provider === 'runway' && job.provider_task_id && ['queued', 'processing'].includes(job.status)) {
    await runwayFromEnv()?.cancel(job.provider_task_id);
  }
  const { error } = await sb.rpc('service_update_job', { p_id: job.id, p_status: 'cancelled', p_error: 'Cancelled by you', p_next_poll_seconds: 1 });
  if (error) throw new HttpError(400, error.message);
  return json(200, { ok: true });
}));
