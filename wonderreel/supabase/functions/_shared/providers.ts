// Runway adapter (images AND videos) + shared helpers. Pure TypeScript with injected
// fetch, so it runs in Deno (Edge Functions) and in Node tests with mocked responses.
// Runway model IDs come from environment variables: check Runway's docs for current IDs.
// Claude (claude.ts) is the AI Director and safety checker; it does not make media.

export class ProviderError extends Error {
  status: number;
  transient: boolean;
  constructor(message: string, status: number, transient: boolean) {
    super(message);
    this.name = 'ProviderError';
    this.status = status;
    this.transient = transient;
  }
}

type Fetch = typeof fetch;

async function call(fetchImpl: Fetch, url: string, init: RequestInit & { timeoutMs?: number }): Promise<any> {
  let res: Response;
  try {
    res = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(init.timeoutMs ?? 60_000) });
  } catch (e) {
    throw new ProviderError(`Network error talking to provider: ${(e as Error).message}`, 503, true);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = String(data?.error?.message ?? data?.error ?? data?.message ?? `Provider returned ${res.status}`).slice(0, 300);
    throw new ProviderError(msg, res.status, res.status === 429 || res.status >= 500);
  }
  return data;
}

export type Scene = { number: number; title: string; description: string; camera?: string; durationSec?: number };
export type Storyboard = { title: string; theme: string; style: string; prompt: string; scenes: Scene[]; source: 'ai' | 'local' };

// ---------------------------------------------------------------- Runway
export type RenderKind = 'text_to_image' | 'image_edit' | 'image_to_video' | 'video_to_video';

export type RunwayConfig = {
  apiKey: string;
  imageModel?: string;
  imageToVideoModel?: string;
  videoToVideoModel?: string;
  apiVersion?: string;
  fetchImpl?: Fetch;
  baseUrl?: string;
};

export type ProviderTask = { status: 'PENDING' | 'RUNNING' | 'THROTTLED' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED'; outputUrl?: string; error?: string };

export function runway(cfg: RunwayConfig) {
  const f = cfg.fetchImpl ?? fetch;
  const base = cfg.baseUrl ?? 'https://api.dev.runwayml.com/v1';
  const headers = { authorization: `Bearer ${cfg.apiKey}`, 'content-type': 'application/json', 'X-Runway-Version': cfg.apiVersion ?? '2024-11-06' };

  return {
    /** Starts any render. Every Runway render is an async task: poll it with poll(). */
    async start(input: { kind: RenderKind; prompt: string; mediaUrl?: string; ratio: string; durationSec: number }): Promise<string> {
      const isImage = input.kind === 'text_to_image' || input.kind === 'image_edit';
      const model = isImage ? cfg.imageModel : input.kind === 'image_to_video' ? cfg.imageToVideoModel : cfg.videoToVideoModel;
      if (!model) throw new ProviderError(`Runway model for ${input.kind} is not configured`, 503, false);
      if (input.kind !== 'text_to_image' && !input.mediaUrl) throw new ProviderError('This render needs your photo or video', 400, false);
      const promptText = input.prompt.slice(0, 1000);
      let path: string;
      let body: Record<string, unknown>;
      if (isImage) {
        path = 'text_to_image';
        body = { model, promptText, ratio: input.ratio };
        // Image edit: the user's own photo is a reference image, never anyone else's.
        if (input.kind === 'image_edit') body.referenceImages = [{ uri: input.mediaUrl, tag: 'me' }];
      } else if (input.kind === 'image_to_video') {
        path = 'image_to_video';
        body = { model, promptImage: input.mediaUrl, promptText, ratio: input.ratio, duration: input.durationSec };
      } else {
        path = 'video_to_video';
        body = { model, videoUri: input.mediaUrl, promptText, ratio: input.ratio };
      }
      const r = await call(f, `${base}/${path}`, { method: 'POST', headers, body: JSON.stringify(body), timeoutMs: 60_000 });
      const id = String(r.id ?? '');
      if (!/^[a-z0-9-]{10,100}$/i.test(id)) throw new ProviderError('Runway did not return a task id', 502, true);
      return id;
    },
    async poll(taskId: string): Promise<ProviderTask> {
      const r = await call(f, `${base}/tasks/${encodeURIComponent(taskId)}`, { method: 'GET', headers, timeoutMs: 25_000 });
      const status = String(r.status ?? 'RUNNING').toUpperCase() as ProviderTask['status'];
      const outputUrl = Array.isArray(r.output) ? r.output.find((x: unknown) => typeof x === 'string' && x.startsWith('https://')) : undefined;
      return { status, outputUrl, error: r.failure ? String(r.failure).slice(0, 200) : r.failureCode ? String(r.failureCode) : undefined };
    },
    async cancel(taskId: string): Promise<void> {
      await call(f, `${base}/tasks/${encodeURIComponent(taskId)}`, { method: 'DELETE', headers, timeoutMs: 20_000 }).catch(() => {});
    },
  };
}

/** Download a provider output with a host allow-list and size cap. */
export async function downloadOutput(url: string, maxBytes: number, fetchImpl: Fetch = fetch): Promise<{ bytes: Uint8Array; mime: string }> {
  const u = new URL(url);
  if (u.protocol !== 'https:' || !/(^|\.)(cloudfront\.net|runwayml\.com|amazonaws\.com)$/.test(u.hostname)) {
    throw new ProviderError('Unexpected download host from provider', 502, false);
  }
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new ProviderError('Download from provider failed', 502, true);
  const len = Number(res.headers.get('content-length') ?? 0);
  if (len > maxBytes) throw new ProviderError('Provider output is too large', 502, false);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (!bytes.length || bytes.length > maxBytes) throw new ProviderError('Provider output has an invalid size', 502, false);
  const mime = sniffMime(bytes);
  if (!mime) throw new ProviderError('Provider output is not a supported image or video', 502, false);
  return { bytes, mime };
}

// ---------------------------------------------------------------- helpers
export function sniffMime(b: Uint8Array): string | null {
  const ascii = (s: number, e: number) => String.fromCharCode(...b.subarray(s, e));
  if (b.length >= 8 && b[0] === 0x89 && ascii(1, 4) === 'PNG') return 'image/png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  if (b.length >= 12 && ascii(4, 8) === 'ftyp') {
    const brand = ascii(8, 12);
    if (/^(heic|heix|mif1|msf1|heim|heis)$/.test(brand)) return 'image/heic';
    if (brand === 'qt  ') return 'video/quicktime';
    return 'video/mp4';
  }
  return null;
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
