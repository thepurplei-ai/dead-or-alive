// Server-side validation. The app does the same checks for friendly messages,
// but only these are trusted.

export const COST = { text_to_image: 1, image_edit: 1, image_to_video: 5, video_to_video: 8 } as const;
export const STYLES = ['Cinematic', 'Animated', 'Fantasy', '3D', 'Comic'];
export const ASPECTS = ['9:16', '1:1', '16:9'];
export const KINDS = ['text_to_image', 'image_edit', 'image_to_video', 'video_to_video'] as const;

export const UPLOAD = {
  image: { types: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'], maxBytes: 20 * 1024 * 1024 },
  video: { types: ['video/mp4', 'video/quicktime'], maxBytes: 100 * 1024 * 1024, maxMs: 30_000 },
};

const BLOCKED = [
  /\b(nude|naked|nsfw|porn|sexual|sexy|lingerie|undress)/i,
  /\b(deepfake|face ?swap|impersonat)/i,
  /\b(child|kid|minor|toddler|teen|schoolgirl|schoolboy)s?\b.*\b(bath|bed|kiss|body)/i,
];

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function checkPrompt(p: unknown): string {
  const prompt = String(p ?? '').trim();
  if (prompt.length < 15 || prompt.length > 1500) throw new HttpError(400, 'Describe your idea in 15–1500 characters.');
  if (BLOCKED.some((r) => r.test(prompt))) throw new HttpError(422, 'This idea cannot be made on WonderReel.');
  return prompt;
}

export function oneOf<T extends string>(v: unknown, list: readonly T[], fallback: T): T {
  return list.includes(v as T) ? (v as T) : fallback;
}

export function checkUpload(kind: unknown, mime: unknown, size: unknown, durationMs: unknown) {
  if (kind !== 'image' && kind !== 'video') throw new HttpError(400, 'Unsupported media kind');
  const rule = UPLOAD[kind];
  const m = String(mime ?? '').toLowerCase();
  if (!rule.types.includes(m)) throw new HttpError(415, 'Unsupported file type');
  const s = Number(size);
  if (size != null && (!Number.isFinite(s) || s <= 0 || s > rule.maxBytes)) throw new HttpError(413, 'File is too large');
  if (kind === 'video' && durationMs != null && Number(durationMs) > UPLOAD.video.maxMs) throw new HttpError(413, 'Video is too long');
  return { kind: kind as 'image' | 'video', mime: m };
}

export function extFor(mime: string) {
  return ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif', 'video/mp4': 'mp4', 'video/quicktime': 'mov' } as Record<string, string>)[mime] ?? 'bin';
}
