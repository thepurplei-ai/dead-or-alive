// Durable job processing. The jobs-worker Edge Function runs this every minute
// (pg_cron) and right after a job is created. Jobs live in Postgres, so they survive
// app restarts, function restarts and provider delays.
// Media is made by Runway; Claude checks generated images before the owner sees them.
import { downloadOutput, ProviderError, type ProviderTask, type RenderKind } from './providers.ts';

export type JobKind = RenderKind;
export type JobStatus = 'queued' | 'processing' | 'output_review' | 'completed' | 'failed' | 'cancelled' | 'rejected';

export type Job = {
  id: string;
  owner_id: string;
  project_id: string;
  kind: JobKind;
  status: JobStatus;
  provider_task_id: string | null;
  prompt: string;
  style: string;
  aspect: string;
  source_media_id: string | null;
  attempts: number;
};

export type Deps = {
  updateJob(id: string, status: JobStatus, opts?: { providerTask?: string; outputMediaId?: string; error?: string; nextPollSeconds?: number }): Promise<void>;
  sourceUrl(mediaId: string): Promise<string>;            // short-lived signed URL of the user's own source file
  saveOutput(job: Job, bytes: Uint8Array, mime: string): Promise<{ mediaId: string; signedUrl: string }>;
  renderer: {
    start(input: { kind: RenderKind; prompt: string; mediaUrl?: string; ratio: string; durationSec: number }): Promise<string>;
    poll(taskId: string): Promise<ProviderTask>;
  } | null;
  moderateImage(url: string): Promise<string[]>;
  fetchImpl?: typeof fetch;
  maxAttempts?: number;
};

const IMAGE_RATIOS: Record<string, string> = { '9:16': '1080:1920', '1:1': '1024:1024', '16:9': '1920:1080' };
const VIDEO_RATIOS: Record<string, string> = { '9:16': '720:1280', '1:1': '960:960', '16:9': '1280:720' };
const MAX_OUTPUT_BYTES = 150_000_000;

export function styledPrompt(prompt: string, style: string) {
  return `${prompt}\n\nVisual direction: ${style.toLowerCase()} style, coherent continuity, carefully framed composition. ` +
    'Keep it safe for a general audience. No celebrities or real public figures, no logos or trademarks, no text overlays.';
}

export async function processJob(job: Job, d: Deps): Promise<JobStatus> {
  const max = d.maxAttempts ?? 6;
  try {
    if (!d.renderer) throw new ProviderError('Rendering is not connected yet', 503, false);
    const isImage = job.kind === 'text_to_image' || job.kind === 'image_edit';

    if (job.status === 'queued') {
      const mediaUrl = job.kind === 'text_to_image' ? undefined : await d.sourceUrl(requireSource(job));
      const ratios = isImage ? IMAGE_RATIOS : VIDEO_RATIOS;
      const taskId = await d.renderer.start({
        kind: job.kind, prompt: styledPrompt(job.prompt, job.style), mediaUrl, ratio: ratios[job.aspect] ?? ratios['9:16'], durationSec: 5,
      });
      await d.updateJob(job.id, 'processing', { providerTask: taskId, nextPollSeconds: isImage ? 5 : 10 });
      return 'processing';
    }

    if (job.status === 'processing') {
      if (!job.provider_task_id) throw new ProviderError('Missing provider task', 500, false);
      const t = await d.renderer.poll(job.provider_task_id);
      if (t.status === 'SUCCEEDED') {
        if (!t.outputUrl) throw new ProviderError('The render finished without a file', 502, false);
        const { bytes, mime } = await downloadOutput(t.outputUrl, MAX_OUTPUT_BYTES, d.fetchImpl);
        return await finishWithOutput(job, bytes, mime, d);
      }
      if (t.status === 'FAILED' || t.status === 'CANCELLED') {
        const status = t.status === 'FAILED' ? 'failed' : 'cancelled';
        await d.updateJob(job.id, status, { error: t.error ?? 'The provider could not render this' });
        return status;
      }
      await d.updateJob(job.id, 'processing', { nextPollSeconds: t.status === 'THROTTLED' ? 30 : isImage ? 5 : 10 });
      return 'processing';
    }
    return job.status;
  } catch (e) {
    const err = e instanceof ProviderError ? e : new ProviderError((e as Error).message, 500, true);
    if (err.transient && job.attempts < max) {
      // Back off and try again later; credits stay reserved, the job stays in its state.
      await d.updateJob(job.id, job.status, { error: `Retrying: ${err.message}`, nextPollSeconds: Math.min(30 * 2 ** job.attempts, 900) });
      return job.status;
    }
    await d.updateJob(job.id, 'failed', { error: err.message }); // refund happens in the database
    return 'failed';
  }
}

async function finishWithOutput(job: Job, bytes: Uint8Array, mime: string, d: Deps): Promise<JobStatus> {
  const saved = await d.saveOutput(job, bytes, mime);
  if (mime.startsWith('image/')) {
    const flagged = await d.moderateImage(saved.signedUrl);
    if (flagged.length) {
      await d.updateJob(job.id, 'rejected', { error: 'The result did not pass the safety check' });
      return 'rejected';
    }
  }
  // Videos stay private to their owner. Publishing them always needs human review,
  // where the moderator watches the clip (automatic frame/audio scanning is a launch blocker).
  await d.updateJob(job.id, 'completed', { outputMediaId: saved.mediaId });
  return 'completed';
}

function requireSource(job: Job): string {
  if (!job.source_media_id) throw new ProviderError('This render needs your photo or video', 400, false);
  return job.source_media_id;
}
