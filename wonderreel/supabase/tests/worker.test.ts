/// <reference types="node" />
// Provider adapter + worker tests with mocked HTTP. No real provider is called or charged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ProviderError, runway, sniffMime, downloadOutput } from '../functions/_shared/providers.ts';
import { claude } from '../functions/_shared/claude.ts';
import { processJob, type Deps, type Job } from '../functions/_shared/worker.ts';
import { checkPrompt, checkUpload, HttpError } from '../functions/_shared/rules.ts';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const MP4 = new Uint8Array([0, 0, 0, 0x18, ...Buffer.from('ftypisom'), 0, 0, 0, 0]);

type Call = { url: string; init: RequestInit };
function mockFetch(routes: Record<string, (c: Call) => { status?: number; json?: unknown; bytes?: Uint8Array }>) {
  const calls: Call[] = [];
  const f = (async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init });
    const key = Object.keys(routes).find((k) => url.includes(k));
    if (!key) return new Response('{}', { status: 404 });
    const r = routes[key]({ url, init });
    if (r.bytes) return new Response(r.bytes, { status: r.status ?? 200, headers: { 'content-length': String(r.bytes.length) } });
    return new Response(JSON.stringify(r.json ?? {}), { status: r.status ?? 200, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
  return { f, calls };
}

function claudeReply(obj: unknown, stop_reason = 'end_turn') {
  return { json: { id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason, stop_sequence: null,
    content: stop_reason === 'refusal' ? [] : [{ type: 'text', text: JSON.stringify(obj) }],
    usage: { input_tokens: 10, output_tokens: 10 } } };
}

test('Claude safety check: allowed, blocked, refusal, and the key stays in headers', async () => {
  let next: unknown = { allowed: true, categories: [], reason: 'fine' };
  let stop = 'end_turn';
  const { f, calls } = mockFetch({ '/v1/messages': () => claudeReply(next, stop) });
  const c = claude({ apiKey: 'sk-ant-test', fetchImpl: f });
  assert.deepEqual(await c.moderate('A hero saves a puppy'), []);
  const sent = JSON.parse(String(calls[0].init.body));
  assert.equal(sent.model, 'claude-opus-5-5');
  assert.equal(sent.output_config.format.type, 'json_schema');
  assert.doesNotMatch(String(calls[0].init.body), /sk-ant-test/);

  next = { allowed: false, categories: ['sexual'], reason: 'nudity' };
  assert.deepEqual(await c.moderate('x', 'https://signed/img.png'), ['sexual']);
  const withImage = JSON.parse(String(calls[1].init.body));
  assert.equal(withImage.messages[0].content[0].type, 'image');
  assert.equal(withImage.messages[0].content[0].source.url, 'https://signed/img.png');

  stop = 'refusal';
  assert.deepEqual(await c.moderate('something bad'), ['refused'], 'a refusal counts as blocked');
});

test('Claude AI Director: 4 scenes, URLs stripped, fallback enabled, refusal → 422', async () => {
  let next: unknown = { reply: 'Done', title: 'Hero https://evil.x', scenes: [1, 2, 3, 4].map((n) => ({ title: `S${n}`, description: 'd https://x.y/z', camera: 'wide' })) };
  let stop = 'end_turn';
  const { f, calls } = mockFetch({ '/v1/messages': () => claudeReply(next, stop) });
  const c = claude({ apiKey: 'k', fetchImpl: f });
  const r = await c.director({ prompt: 'A hero saves a puppy', style: 'Cinematic', message: 'add a robot' });
  assert.equal(r.storyboard.scenes.length, 4);
  assert.equal(r.storyboard.source, 'ai');
  assert.doesNotMatch(JSON.stringify(r.storyboard), /https?:\/\//);
  const sent = JSON.parse(String(calls[0].init.body));
  assert.equal(sent.fallbacks, 'default');
  assert.match(String((calls[0].init.headers as Headers).get?.('anthropic-beta') ?? JSON.stringify(calls[0].init.headers)), /server-side-fallback/);
  assert.match(sent.messages[0].content, /Requested change: add a robot/);

  next = { reply: 'x', title: 't', scenes: [{ title: 'a', description: 'b', camera: 'c' }] };
  await assert.rejects(c.director({ prompt: 'p', style: 'Cinematic' }), /four scenes/);
  stop = 'refusal';
  await assert.rejects(c.director({ prompt: 'p', style: 'Cinematic' }), (e: ProviderError) => e.status === 422);
});

test('Claude errors are classified (rate limit = retry, bad key = stop)', async () => {
  const rate = claude({ apiKey: 'k', fetchImpl: mockFetch({ '/v1/messages': () => ({ status: 429, json: { type: 'error', error: { type: 'rate_limit_error', message: 'slow' } } }) }).f });
  await assert.rejects(rate.moderate('hello there friend'), (e: ProviderError) => e.transient);
  const auth = claude({ apiKey: 'k', fetchImpl: mockFetch({ '/v1/messages': () => ({ status: 401, json: { type: 'error', error: { type: 'authentication_error', message: 'bad' } } }) }).f });
  await assert.rejects(auth.moderate('hello there friend'), (e: ProviderError) => !e.transient);
});

test('Runway images: text-to-image and photo edit with the user\'s own reference', async () => {
  const { f, calls } = mockFetch({ '/text_to_image': () => ({ json: { id: 'task-img-123456' } }) });
  const rw = runway({ apiKey: 'k', imageModel: 'img-model', fetchImpl: f });
  await rw.start({ kind: 'text_to_image', prompt: 'p', ratio: '1080:1920', durationSec: 5 });
  await rw.start({ kind: 'image_edit', prompt: 'p', mediaUrl: 'https://signed/me.jpg', ratio: '1080:1920', durationSec: 5 });
  assert.equal(JSON.parse(String(calls[0].init.body)).referenceImages, undefined);
  assert.equal(JSON.parse(String(calls[1].init.body)).referenceImages[0].uri, 'https://signed/me.jpg');
  await assert.rejects(rw.start({ kind: 'image_edit', prompt: 'p', ratio: 'r', durationSec: 5 }), /needs your photo/);
  await assert.rejects(runway({ apiKey: 'k', fetchImpl: f }).start({ kind: 'text_to_image', prompt: 'p', ratio: 'r', durationSec: 5 }), /not configured/);
});

test('Runway: start validates task id; poll maps output', async () => {
  const { f, calls } = mockFetch({
    '/image_to_video': () => ({ json: { id: 'task-1234567890' } }),
    '/tasks/': () => ({ json: { status: 'SUCCEEDED', output: ['https://dnznrvs05pmza.cloudfront.net/out.mp4'] } }),
  });
  const rw = runway({ apiKey: 'k', imageToVideoModel: 'i2v', fetchImpl: f });
  const id = await rw.start({ kind: 'image_to_video', prompt: 'p', mediaUrl: 'https://signed/x.jpg', ratio: '720:1280', durationSec: 5 });
  assert.equal(id, 'task-1234567890');
  assert.equal((calls[0].init.headers as Record<string, string>)['X-Runway-Version'], '2024-11-06');
  const t = await rw.poll(id);
  assert.equal(t.status, 'SUCCEEDED');
  assert.match(t.outputUrl!, /cloudfront/);
  await assert.rejects(runway({ apiKey: 'k', fetchImpl: f }).start({ kind: 'video_to_video', prompt: 'p', mediaUrl: 'u', ratio: 'r', durationSec: 5 }), /not configured/);
});

test('downloads only from allowed hosts and real media', async () => {
  const { f } = mockFetch({ 'cloudfront.net': () => ({ bytes: MP4 }), 'evil.com': () => ({ bytes: MP4 }) });
  assert.equal((await downloadOutput('https://x.cloudfront.net/a.mp4', 1e6, f)).mime, 'video/mp4');
  await assert.rejects(downloadOutput('https://evil.com/a.mp4', 1e6, f), /Unexpected download host/);
  await assert.rejects(downloadOutput('http://x.cloudfront.net/a.mp4', 1e6, f), /Unexpected download host/);
  await assert.rejects(downloadOutput('https://x.cloudfront.net/a.mp4', 5, f), /too large|invalid size/);
  assert.equal(sniffMime(PNG), 'image/png');
  assert.equal(sniffMime(new Uint8Array([1, 2, 3])), null);
});

function deps(over: Partial<Deps> = {}) {
  const updates: { id: string; status: string; opts?: Record<string, unknown> }[] = [];
  const d: Deps = {
    updateJob: async (id, status, opts) => { updates.push({ id, status, opts }); },
    sourceUrl: async (id) => `https://signed/${id}`,
    saveOutput: async () => ({ mediaId: 'media-out', signedUrl: 'https://signed/out' }),
    renderer: {
      start: async () => 'task-img-123456',
      poll: async () => ({ status: 'SUCCEEDED' as const, outputUrl: 'https://x.cloudfront.net/o.png' }),
    },
    fetchImpl: mockFetch({ 'cloudfront.net': () => ({ bytes: PNG }) }).f,
    moderateImage: async () => [],
    ...over,
  };
  return { d, updates };
}
const baseJob: Job = { id: 'j1', owner_id: 'u', project_id: 'p', kind: 'text_to_image', status: 'queued', provider_task_id: null, prompt: 'A hero saves a puppy', style: 'Cinematic', aspect: '9:16', source_media_id: null, attempts: 1 };

test('worker: image job queued → processing → completed; unsafe output rejected', async () => {
  let { d, updates } = deps();
  assert.equal(await processJob(baseJob, d), 'processing');
  assert.equal(updates[0].opts?.providerTask, 'task-img-123456');
  const running = { ...baseJob, status: 'processing' as const, provider_task_id: 'task-img-123456' };
  assert.equal(await processJob(running, d), 'completed');
  assert.equal(updates.at(-1)!.opts?.outputMediaId, 'media-out');

  ({ d, updates } = deps({ moderateImage: async () => ['violence'] }));
  assert.equal(await processJob(running, d), 'rejected');
});

test('worker: photo edit needs the owner\'s source media', async () => {
  const { d, updates } = deps();
  assert.equal(await processJob({ ...baseJob, kind: 'image_edit' }, d), 'failed');
  assert.match(String(updates.at(-1)!.opts?.error), /needs your photo/);
});

test('worker: transient errors retry with backoff, permanent ones fail', async () => {
  const busy = { start: async () => { throw new ProviderError('busy', 503, true); }, poll: async () => ({ status: 'RUNNING' as const }) };
  let { d, updates } = deps({ renderer: busy });
  assert.equal(await processJob(baseJob, d), 'queued');
  assert.ok(Number(updates.at(-1)!.opts?.nextPollSeconds) >= 30);
  ({ d } = deps({ renderer: busy }));
  assert.equal(await processJob({ ...baseJob, attempts: 6 }, d), 'failed', 'gives up after max attempts');
  ({ d } = deps({ renderer: { ...busy, start: async () => { throw new ProviderError('policy', 400, false); } } }));
  assert.equal(await processJob(baseJob, d), 'failed');
  ({ d } = deps({ renderer: null }));
  assert.equal(await processJob(baseJob, d), 'failed', 'no renderer → fail and refund');
});

test('worker: video job goes queued → processing → completed across runs', async () => {
  const { f } = mockFetch({ 'cloudfront.net': () => ({ bytes: MP4 }) });
  let polls = 0;
  const renderer = {
    start: async () => 'task-abcdefghij',
    poll: async () => (++polls < 2 ? { status: 'RUNNING' as const } : { status: 'SUCCEEDED' as const, outputUrl: 'https://x.cloudfront.net/o.mp4' }),
  };
  const { d, updates } = deps({ renderer, fetchImpl: f });
  const job: Job = { ...baseJob, kind: 'image_to_video', source_media_id: 'src-1' };
  assert.equal(await processJob(job, d), 'processing');
  assert.equal(updates[0].opts?.providerTask, 'task-abcdefghij');
  const running = { ...job, status: 'processing' as const, provider_task_id: 'task-abcdefghij' };
  assert.equal(await processJob(running, d), 'processing');
  assert.equal(await processJob(running, d), 'completed');
  const failing = deps({ renderer: { start: renderer.start, poll: async () => ({ status: 'FAILED' as const, error: 'nope' }) } });
  assert.equal(await processJob(running, failing.d), 'failed');
});

test('server rules', () => {
  assert.throws(() => checkPrompt('short'), HttpError);
  assert.throws(() => checkPrompt('make a deepfake of my boss please'), /cannot be made/);
  assert.equal(checkPrompt('  Make me a superhero saving a puppy  '), 'Make me a superhero saving a puppy');
  assert.throws(() => checkUpload('image', 'image/gif', 10, null), /Unsupported/);
  assert.throws(() => checkUpload('video', 'video/mp4', 10, 31_000), /too long/);
  assert.throws(() => checkUpload('image', 'image/png', 50 * 1024 * 1024, null), /too large/);
  assert.deepEqual(checkUpload('video', 'VIDEO/MP4', 1000, 5000), { kind: 'video', mime: 'video/mp4' });
});
