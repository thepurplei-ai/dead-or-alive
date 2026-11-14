// Client-side checks. They give quick, friendly feedback only.
// The server repeats every check: the client is never trusted.
import type { FeedPost, LocalMedia, RemixTemplate, Scene } from './types.ts';

export const LIMITS = {
  promptMin: 15,
  promptMax: 1500,
  imageMaxBytes: 20 * 1024 * 1024,
  videoMaxBytes: 100 * 1024 * 1024,
  videoMaxMs: 30_000,
  commentMax: 600,
  handle: /^[a-z0-9_]{3,30}$/,
};

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const VIDEO_TYPES = ['video/mp4', 'video/quicktime'];

// Short, obvious list. Real moderation happens server-side with a moderation model.
const BLOCKED = [
  /\b(nude|naked|nsfw|porn|sexual|sexy|lingerie|undress)/,
  /\b(deepfake|face ?swap|impersonat)/,
  /\b(kill|murder|behead|gore|suicide|self[- ]harm)\b/,
  /\b(bomb|weapon making|terroris)/,
];

export type Check = { ok: true } | { ok: false; reason: string };

export function checkPrompt(prompt: string): Check {
  const p = prompt.trim();
  if (p.length < LIMITS.promptMin) return { ok: false, reason: `Describe your idea in at least ${LIMITS.promptMin} characters.` };
  if (p.length > LIMITS.promptMax) return { ok: false, reason: `Keep your idea under ${LIMITS.promptMax} characters.` };
  const lower = p.toLowerCase();
  if (BLOCKED.some((re) => re.test(lower))) {
    return { ok: false, reason: 'This idea cannot be made on WonderReel. Please try a different, safe scene.' };
  }
  return { ok: true };
}

export function checkMedia(media: Pick<LocalMedia, 'kind' | 'mimeType' | 'sizeBytes' | 'durationMs'>): Check {
  const types = media.kind === 'image' ? IMAGE_TYPES : VIDEO_TYPES;
  if (!types.includes(media.mimeType.toLowerCase())) {
    return { ok: false, reason: media.kind === 'image' ? 'Use a JPG, PNG, WEBP or HEIC photo.' : 'Use an MP4 or MOV video.' };
  }
  const max = media.kind === 'image' ? LIMITS.imageMaxBytes : LIMITS.videoMaxBytes;
  if (media.sizeBytes != null && media.sizeBytes > max) {
    return { ok: false, reason: `That file is too big. The limit is ${Math.round(max / 1024 / 1024)} MB.` };
  }
  if (media.sizeBytes === 0) return { ok: false, reason: 'That file is empty.' };
  if (media.kind === 'video' && media.durationMs != null && media.durationMs > LIMITS.videoMaxMs) {
    return { ok: false, reason: `Videos can be up to ${LIMITS.videoMaxMs / 1000} seconds. Trim it and try again.` };
  }
  return { ok: true };
}

export function guessMime(uri: string, kind: 'image' | 'video', given?: string | null): string {
  if (given) return given;
  const ext = uri.split('?')[0].split('.').pop()?.toLowerCase();
  const map: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif',
    mp4: 'video/mp4', mov: 'video/quicktime', m4v: 'video/mp4',
  };
  return (ext && map[ext]) || (kind === 'image' ? 'image/jpeg' : 'video/mp4');
}

/** Can a viewer tap "Create My Version" on this post? */
export function canRemix(post: FeedPost, blockedHandles: Set<string>): boolean {
  return post.allowRemix && !!post.template && !blockedHandles.has(post.handle);
}

/**
 * Turn a post into a remix template that carries ONLY story structure.
 * Any media, face, voice or URL field is dropped on purpose.
 */
export function toRemixTemplate(post: FeedPost): RemixTemplate | null {
  if (!post.allowRemix || !post.template) return null;
  const src = post.template;
  const scenes: Scene[] = src.scenes.slice(0, 8).map((s, i) => ({
    number: i + 1,
    title: String(s.title).slice(0, 100),
    description: String(s.description).slice(0, 300),
    camera: s.camera ? String(s.camera).slice(0, 80) : undefined,
    durationSec: typeof s.durationSec === 'number' ? Math.min(Math.max(s.durationSec, 2), 10) : 5,
  }));
  return {
    templateId: src.templateId,
    title: src.title,
    category: src.category,
    style: src.style,
    prompt: src.prompt,
    scenes,
    origin: { postId: post.id, creatorHandle: post.handle },
  };
}

export function checkComment(text: string): Check {
  const t = text.trim();
  if (!t) return { ok: false, reason: 'Write something first.' };
  if (t.length > LIMITS.commentMax) return { ok: false, reason: `Comments can be up to ${LIMITS.commentMax} characters.` };
  if (BLOCKED.some((re) => re.test(t.toLowerCase()))) return { ok: false, reason: 'This comment breaks the community rules.' };
  if (/(https?:\/\/|www\.)/i.test(t)) return { ok: false, reason: 'Links are not allowed in comments.' };
  return { ok: true };
}

/** Adult check from a date of birth. Only a declaration; real age assurance is server-side. */
export function ageFrom(dob: { year: number; month: number; day: number }, now = new Date()): number {
  let age = now.getFullYear() - dob.year;
  const m = now.getMonth() + 1 - dob.month;
  if (m < 0 || (m === 0 && now.getDate() < dob.day)) age--;
  return age;
}

export function isValidDate(y: number, m: number, d: number): boolean {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false;
  if (y < 1900 || m < 1 || m > 12 || d < 1) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function formatCount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, '') + 'M';
  if (n >= 1000) return (n / 1000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, '') + 'k';
  return String(n);
}

/** Credits estimate shown before rendering. Real prices are set on the server. */
export const CREDIT_COST = { text_to_image: 1, image_edit: 1, image_to_video: 5, video_to_video: 8 } as const;
