// Runs a cloud generation for a Studio project and keeps the job status on the
// phone, so polling resumes after the app is closed and reopened.
import * as api from './api';
import { cloudEnabled } from './config';
import { scenePrompt } from './storyboard';
import type { GenerationJob, GenerationKind, Project } from './types';

export const TERMINAL = new Set(['completed', 'failed', 'cancelled', 'rejected']);

export type Update = (fn: (p: Project) => Project) => void;

export function kindsFor(project: Project): { kind: GenerationKind; label: string; needs: string | null }[] {
  const m = project.media?.kind;
  return [
    { kind: 'text_to_image', label: 'Picture from my words', needs: null },
    { kind: 'image_edit', label: 'Transform my photo', needs: m === 'image' ? null : 'Add a photo first' },
    { kind: 'image_to_video', label: 'Animate my photo', needs: m === 'image' ? null : 'Add a photo first' },
    { kind: 'video_to_video', label: 'Transform my video', needs: m === 'video' ? null : 'Add a video first' },
  ];
}

/** Why generation is not possible right now, or null when it is. */
export function blocker(project: Project, signedIn: boolean): string | null {
  if (project.family) return 'Cloud AI is turned off in Family Mode to protect children’s photos and videos.';
  if (!cloudEnabled) return 'AI generation is not connected yet. The app owner must connect the WonderReel cloud (see SETUP.md).';
  if (!signedIn) return 'Sign in to use AI generation.';
  return null;
}

export async function startJob(project: Project, kind: GenerationKind, sceneNumber: number | undefined, update: Update): Promise<void> {
  const idempotencyKey = `${project.id}:${kind}:${sceneNumber ?? 0}:${Date.now()}`;
  update((p) => ({ ...p, status: 'generating', updatedAt: new Date().toISOString() }));

  // 1. Make sure the project exists in the cloud (owner-only via RLS).
  const remoteId = await api.upsertCloudProject({
    remoteId: project.remoteId,
    title: project.title,
    prompt: project.prompt,
    style: project.style,
    aspect: project.aspect,
    storyboard: project.storyboard,
    remixTemplateId: project.remixOf?.templateId,
  });
  update((p) => ({ ...p, remoteId }));
  const origin = project.remixOf?.postId;
  if (origin && /^[0-9a-f-]{36}$/i.test(origin) && !project.remoteId) {
    await api.linkRemix(remoteId, origin); // keeps attribution + lineage for real posts
  }

  // 2. Upload the user's own source media only when this kind needs it.
  let sourceMediaId: string | undefined;
  if (kind !== 'text_to_image') {
    if (!project.media) throw new Error('Add a photo or video first.');
    sourceMediaId = await api.uploadSourceMedia(remoteId, project.media);
  }

  const prompt = project.storyboard && sceneNumber ? scenePrompt(project.storyboard, sceneNumber) : project.prompt;
  const job = await api.startGeneration({
    projectId: remoteId, kind, prompt, style: project.style, aspect: project.aspect, sourceMediaId, sceneNumber, idempotencyKey,
  });
  update((p) => ({ ...p, jobs: [job, ...p.jobs.filter((j) => j.id !== job.id)], updatedAt: new Date().toISOString() }));
}

export async function refreshJob(job: GenerationJob, update: Update): Promise<GenerationJob> {
  const fresh = await api.getJob(job.id);
  update((p) => {
    const jobs = p.jobs.map((j) => (j.id === job.id ? fresh : j));
    const anyRunning = jobs.some((j) => !TERMINAL.has(j.status));
    const anyDone = jobs.some((j) => j.status === 'completed');
    return {
      ...p,
      jobs,
      status: p.status === 'pending_review' || p.status === 'published' ? p.status : anyRunning ? 'generating' : anyDone ? 'ready' : 'draft',
      updatedAt: new Date().toISOString(),
    };
  });
  return fresh;
}

export function statusLabel(s: GenerationJob['status']): string {
  return {
    queued: 'Queued',
    processing: 'Rendering',
    output_review: 'Safety check',
    completed: 'Ready',
    failed: 'Failed — credits refunded',
    cancelled: 'Cancelled — credits refunded',
    rejected: 'Blocked by safety check',
  }[s];
}
