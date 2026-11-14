/// <reference types="node" />
// Provider adapter + worker tests with mocked HTTP. No real provider is called or charged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openai, parseDirector, ProviderError, runway, sniffMime, downloadOutput } from '../functions/_shared/providers.ts';
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
    return new Response(JSON.stringify(r.json ?? {}), { status: r.status ?? 200 });
  }) as unknown as typeof fetch;
  return { f, calls };
}

test('OpenAI moderation reports flagged categories and never leaks the key in the body', async () => {
  const { f, calls } = mockFetch({ '/moderations': () => ({ json: { results: [{ flagged: true, categories: { sexual: true, violence: false } }] } }) });
  const ai = openai({ apiKey: 'sk-test', fetchImpl: f });
  assert.deepEqual(await ai.moderate('x', 'https://img'), ['sexual']);
  assert.equal((calls[0].init.headers as Record<string, string>).authorization, 'Bearer sk-test');
  assert.doesNotMatch(String(calls[0].init.body), /sk-test/);
});

test('AI Director: requires a configured model and validates 4 scenes', async () => {
  const ai0 = openai({ apiKey: 'k', fetchImpl: mockFetch({}).f });
  await assert.rejects(ai0.director({ prompt: 'p', style: 'Cinematic' }), /OPENAI_DIRECTOR_MODEL/);
  const good = { reply: 'Done', storyboard: { title: 'Hero https://evil.x', scenes: [1, 2, 3, 4].map((n) => ({ title: `S${n}`, description: 'd', camera: 'c' })) } };
  const { f } = mockFetch({ '/responses': () => ({ json: { output_text: JSON.stringify(good) } }) });
  const r = await openai({ apiKey: 'k', directorModel: 'model-x', fetchImpl: f }).director({ prompt: 'A hero saves a puppy', style: 'Cinematic' });
  assert.equal(r.storyboard.scenes.length, 4);
  assert.equal(r.storyboard.source, 'ai');
  assert.doesNotMatch(r.storyboard.title, /https/);
  assert.throws(() => parseDirector('{"scenes":[1]}', 'p', 's'), /four scenes/);
  assert.throws(() => parseDirector('not json', 'p', 's'), /invalid/);
});

test('OpenAI image: generation vs edit route, errors are classified', async () => {
  const b64 = Buffer.from(PNG).toString('base64');
  const { f, calls } = mockFetch({ '/images/': () => ({ json: { data: [{ b64_json: b64 }] } }) });
  const ai = openai({ apiKey: 'k', imageModel: 'img-model', fetchImpl: f });
  await ai.image({ prompt: 'p', size: '1024x1536' });
  await ai.image({ prompt: 'p', size: '1024x1536', sourceImageUrl: 'https://signed/src.jpg' });
  assert.match(calls[0].url, /images\/generations$/);
  assert.match(calls[1].url, /images\/edits$/);
  assert.match(String(calls[1].init.body), /signed\/src\.jpg/);

  const rate = openai({ apiKey: 'k', imageModel: 'm', fetchImpl: mockFetch({ '/images/': () => ({ status: 429, json: { error: { message: 'slow down' } } }) }).f });
  await assert.rejects(rate.image({ prompt: 'p', size: 's' }), (e: ProviderError) => e.transient && e.status === 429);
  const bad = openai({ apiKey: 'k', imageModel: 'm', fetchImpl: mockFetch({ '/images/': () => ({ status: 400, json: { error: { message: 'bad' } } }) }).f });
  await assert.rejects(bad.image({ prompt: 'p', size: 's' }), (e: ProviderError) => !e.transient);
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
    image: async () => PNG,
    video: null,
    moderateImage: async () => [],
    ...over,
  };
  return { d, updates };
}
const baseJob: Job = { id: 'j1', owner_id: 'u', project_id: 'p', kind: 'text_to_image', status: 'queued', provider_task_id: null, prompt: 'A hero saves a puppy', style: 'Cinematic', aspect: '9:16', source_media_id: null, attempts: 1 };

test('worker: image job completes; unsafe output is rejected (refund handled in DB)', async () => {
  let { d, updates } = deps();
  assert.equal(await processJob(baseJob, d), 'completed');
  assert.deepEqual(updates.map((u) => u.status), ['processing', 'completed']);
  assert.equal(updates[1].opts?.outputMediaId, 'media-out');

  ({ d, updates } = deps({ moderateImage: async () => ['violence'] }));
  assert.equal(await processJob(baseJob, d), 'rejected');
  assert.equal(updates.at(-1)!.status, 'rejected');
});

test('worker: image edit needs the owner\'s source media', async () => {
  const { d, updates } = deps();
  assert.equal(await processJob({ ...baseJob, kind: 'image_edit' }, d), 'failed');
  assert.match(String(updates.at(-1)!.opts?.error), /needs your photo/);
});

test('worker: transient errors retry with backoff, permanent ones fail', async () => {
  let { d, updates } = deps({ image: async () => { throw new ProviderError('busy', 503, true); } });
  assert.equal(await processJob(baseJob, d), 'queued');
  assert.equal(updates.at(-1)!.status, 'queued');
  assert.ok(Number(updates.at(-1)!.opts?.nextPollSeconds) >= 30);

  ({ d, updates } = deps({ image: async () => { throw new ProviderError('busy', 503, true); } }));
  assert.equal(await processJob({ ...baseJob, attempts: 6 }, d), 'failed', 'gives up after max attempts');

  ({ d, updates } = deps({ image: async () => { throw new ProviderError('policy', 400, false); } }));
  assert.equal(await processJob(baseJob, d), 'failed');
});

test('worker: video job goes queued → processing → completed across runs', async () => {
  const { f } = mockFetch({ 'cloudfront.net': () => ({ bytes: MP4 }) });
  let polls = 0;
  const video = {
    start: async () => 'task-abcdefghij',
    poll: async () => (++polls < 2 ? { status: 'RUNNING' as const } : { status: 'SUCCEEDED' as const, outputUrl: 'https://x.cloudfront.net/o.mp4' }),
  };
  const { d, updates } = deps({ video, fetchImpl: f });
  const job: Job = { ...baseJob, kind: 'image_to_video', source_media_id: 'src-1' };
  assert.equal(await processJob(job, d), 'processing');
  assert.equal(updates[0].opts?.providerTask, 'task-abcdefghij');
  const running = { ...job, status: 'processing' as const, provider_task_id: 'task-abcdefghij' };
  assert.equal(await processJob(running, d), 'processing');
  assert.equal(await processJob(running, d), 'completed');

  const failing = deps({ video: { start: video.start, poll: async () => ({ status: 'FAILED' as const, error: 'nope' }) } });
  assert.equal(await processJob(running, failing.d), 'failed');
  const noVideo = deps();
  assert.equal(await processJob(job, noVideo.d), 'failed', 'video provider missing → fail and refund');
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
