// Provider adapters. Pure TypeScript with injected fetch, so they run in Deno (Edge
// Functions) and in Node tests with mocked responses. Model IDs come from environment
// variables on purpose: provider catalogues change, so the owner sets verified IDs.

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

// ---------------------------------------------------------------- OpenAI
export type OpenAIConfig = {
  apiKey: string;
  directorModel?: string;   // e.g. a current text model ID verified in the OpenAI docs
  imageModel?: string;      // e.g. a current image model ID verified in the OpenAI docs
  moderationModel?: string; // defaults to "omni-moderation-latest"
  fetchImpl?: Fetch;
  baseUrl?: string;
};

export type Scene = { number: number; title: string; description: string; camera?: string; durationSec?: number };
export type Storyboard = { title: string; theme: string; style: string; prompt: string; scenes: Scene[]; source: 'ai' | 'local' };

export function openai(cfg: OpenAIConfig) {
  const f = cfg.fetchImpl ?? fetch;
  const base = cfg.baseUrl ?? 'https://api.openai.com/v1';
  const headers = { authorization: `Bearer ${cfg.apiKey}`, 'content-type': 'application/json' };

  return {
    /** Returns the flagged categories (empty when safe). Images are given as https or data URLs. */
    async moderate(text: string, imageUrl?: string): Promise<string[]> {
      const input: unknown[] = [{ type: 'text', text: text.slice(0, 8000) }];
      if (imageUrl) input.push({ type: 'image_url', image_url: { url: imageUrl } });
      const r = await call(f, `${base}/moderations`, {
        method: 'POST', headers, timeoutMs: 30_000,
        body: JSON.stringify({ model: cfg.moderationModel ?? 'omni-moderation-latest', input }),
      });
      const flagged: string[] = [];
      for (const res of r.results ?? []) {
        if (res.flagged) for (const [k, v] of Object.entries(res.categories ?? {})) if (v) flagged.push(k);
        if (res.flagged && !flagged.length) flagged.push('flagged');
      }
      return flagged;
    },

    async director(input: { prompt: string; style: string; storyboard?: Storyboard | null; message?: string }): Promise<{ storyboard: Storyboard; reply: string }> {
      if (!cfg.directorModel) throw new ProviderError('OPENAI_DIRECTOR_MODEL is not configured', 503, false);
      const instructions =
        'You are WonderReel\'s AI Director. You plan safe, four-scene short movies for adults. ' +
        'Never sexual content, never real-person impersonation, never minors in unsafe situations. ' +
        'If the user asks for an edit, change only what they asked. ' +
        'Reply with ONLY JSON: {"reply": string (<200 chars), "storyboard": {"title": string (<100 chars), ' +
        '"scenes": [exactly 4 x {"title": string (<100), "description": string (<220), "camera": string (<60)}]}}';
      const userText = [
        `Visual style: ${input.style}`,
        `Story idea: ${input.prompt}`,
        input.storyboard ? `Current storyboard JSON: ${JSON.stringify({ title: input.storyboard.title, scenes: input.storyboard.scenes })}` : '',
        input.message ? `Requested change: ${input.message}` : 'Create the first storyboard.',
      ].filter(Boolean).join('\n');
      const r = await call(f, `${base}/responses`, {
        method: 'POST', headers, timeoutMs: 80_000,
        body: JSON.stringify({ model: cfg.directorModel, store: false, instructions, input: userText }),
      });
      const text: string =
        r.output_text ??
        (r.output ?? []).flatMap((o: any) => o.content ?? []).filter((c: any) => c.type === 'output_text').map((c: any) => c.text).join('');
      return parseDirector(text, input.prompt, input.style);
    },

    /** Text-to-image or image edit. Returns PNG bytes. */
    async image(input: { prompt: string; sourceImageUrl?: string; size: string }): Promise<Uint8Array> {
      if (!cfg.imageModel) throw new ProviderError('OPENAI_IMAGE_MODEL is not configured', 503, false);
      const body: Record<string, unknown> = { model: cfg.imageModel, prompt: input.prompt, size: input.size, n: 1 };
      if (input.sourceImageUrl) body.images = [{ image_url: input.sourceImageUrl }];
      const r = await call(f, `${base}/images/${input.sourceImageUrl ? 'edits' : 'generations'}`, {
        method: 'POST', headers, timeoutMs: 180_000, body: JSON.stringify(body),
      });
      const b64 = r.data?.[0]?.b64_json;
      if (!b64) throw new ProviderError('Image provider returned no image', 502, true);
      const bytes = base64ToBytes(b64);
      if (!bytes.length || bytes.length > 25_000_000) throw new ProviderError('Image output was invalid', 502, false);
      return bytes;
    },
  };
}

export function parseDirector(text: string, prompt: string, style: string): { storyboard: Storyboard; reply: string } {
  let parsed: any;
  try {
    const json = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '');
    parsed = JSON.parse(json);
  } catch {
    throw new ProviderError('AI Director returned an invalid storyboard', 502, true);
  }
  const sb = parsed.storyboard ?? parsed;
  if (!Array.isArray(sb.scenes) || sb.scenes.length !== 4) throw new ProviderError('AI Director did not return four scenes', 502, true);
  const clean = (v: unknown, n: number) => String(v ?? '').replace(/https?:\/\/\S+/g, '').slice(0, n);
  return {
    reply: clean(parsed.reply ?? 'Here is your plan.', 200),
    storyboard: {
      title: clean(sb.title || 'Your adventure', 100),
      theme: 'ai',
      style,
      prompt,
      source: 'ai',
      scenes: sb.scenes.map((s: any, i: number) => ({
        number: i + 1, title: clean(s.title || 'Scene', 100), description: clean(s.description, 220), camera: clean(s.camera, 60) || undefined, durationSec: 5,
      })),
    },
  };
}

// ---------------------------------------------------------------- Runway
export type RunwayConfig = {
  apiKey: string;
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
    async start(input: { kind: 'image_to_video' | 'video_to_video'; prompt: string; mediaUrl: string; ratio: string; durationSec: number }): Promise<string> {
      const model = input.kind === 'image_to_video' ? cfg.imageToVideoModel : cfg.videoToVideoModel;
      if (!model) throw new ProviderError(`Runway model for ${input.kind} is not configured`, 503, false);
      const body = input.kind === 'image_to_video'
        ? { model, promptImage: input.mediaUrl, promptText: input.prompt.slice(0, 1000), ratio: input.ratio, duration: input.durationSec }
        : { model, videoUri: input.mediaUrl, promptText: input.prompt.slice(0, 1000), ratio: input.ratio };
      const r = await call(f, `${base}/${input.kind}`, { method: 'POST', headers, body: JSON.stringify(body), timeoutMs: 60_000 });
      const id = String(r.id ?? '');
      if (!/^[a-z0-9-]{10,100}$/i.test(id)) throw new ProviderError('Video provider did not return a task id', 502, true);
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
  if (u.protocol !== 'https:' || !/(^|\.)(cloudfront\.net|runwayml\.com|amazonaws\.com|openai\.com)$/.test(u.hostname)) {
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
