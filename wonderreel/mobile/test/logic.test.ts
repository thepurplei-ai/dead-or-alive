/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyDirectorEdit, inferTheme, planStoryboard, scenePrompt } from '../src/lib/storyboard.ts';
import {
  ageFrom, canRemix, checkComment, checkMedia, checkPrompt, formatCount, guessMime, isValidDate, toRemixTemplate,
} from '../src/lib/rules.ts';
import { SAMPLE_POSTS, TEMPLATES } from '../src/data/samples.ts';

test('theme inference matches the prototype examples', () => {
  assert.equal(inferTheme('Make me a superhero saving a puppy'), 'hero');
  assert.equal(inferTheme('Turn me into an astronaut discovering an alien civilization'), 'space');
  assert.equal(inferTheme('Santa searches for a missing present'), 'santa');
  assert.equal(inferTheme('A quiet walk'), 'castle');
});

test('local storyboard has 4 numbered scenes and is labelled local', () => {
  const b = planStoryboard('Make me a superhero saving a puppy', 'Cinematic');
  assert.equal(b.scenes.length, 4);
  assert.deepEqual(b.scenes.map((s) => s.number), [1, 2, 3, 4]);
  assert.equal(b.source, 'local');
  assert.match(scenePrompt(b, 2), /Scene 2/);
});

test('director edits: ending, add character, dramatic, unknown', () => {
  const b = planStoryboard('astronaut on mars', 'Cinematic');
  const e1 = applyDirectorEdit(b, 'Change the ending to a twist');
  assert.equal(e1.board.scenes[3].title, 'The final twist');
  assert.notEqual(b.scenes[3].title, 'The final twist', 'original is not mutated');
  const e2 = applyDirectorEdit(b, 'add a friendly robot');
  assert.match(e2.board.scenes[1].description, /a friendly robot/);
  assert.match(e2.reply, /friendly robot/);
  const e3 = applyDirectorEdit(b, 'make it more dramatic');
  assert.ok(e3.board.scenes.every((s) => /dramatic/.test(s.description)));
  const e4 = applyDirectorEdit(b, 'hmm');
  assert.equal(e4.board, b);
  const e5 = applyDirectorEdit(b, 'scene 2: we fly over the ocean');
  assert.equal(e5.board.scenes[1].description, 'We fly over the ocean');
});

test('prompt checks', () => {
  assert.equal(checkPrompt('short').ok, false);
  assert.equal(checkPrompt('Make me a superhero saving a puppy').ok, true);
  assert.equal(checkPrompt('make a deepfake of my neighbour').ok, false);
  assert.equal(checkPrompt('x'.repeat(1501)).ok, false);
});

test('media checks', () => {
  assert.equal(checkMedia({ kind: 'image', mimeType: 'image/jpeg', sizeBytes: 1000 }).ok, true);
  assert.equal(checkMedia({ kind: 'image', mimeType: 'application/pdf', sizeBytes: 1000 }).ok, false);
  assert.equal(checkMedia({ kind: 'video', mimeType: 'video/mp4', sizeBytes: 1000, durationMs: 31_000 }).ok, false);
  assert.equal(checkMedia({ kind: 'video', mimeType: 'video/mp4', sizeBytes: 200 * 1024 * 1024 }).ok, false);
  assert.equal(checkMedia({ kind: 'image', mimeType: 'image/png', sizeBytes: 0 }).ok, false);
  assert.equal(guessMime('file:///x/a.MOV', 'video'), 'video/quicktime');
  assert.equal(guessMime('file:///x/a', 'image'), 'image/jpeg');
});

test('Create My Version carries story data only, never media or faces', () => {
  const post = { ...SAMPLE_POSTS[0], posterUrl: 'https://cdn/x.jpg', videoUrl: 'https://cdn/x.mp4' };
  const tpl = toRemixTemplate(post)!;
  assert.ok(tpl);
  const json = JSON.stringify(tpl);
  assert.doesNotMatch(json, /https?:\/\//);
  assert.doesNotMatch(json, /poster|video|face|voice|uri/i);
  assert.deepEqual(tpl.origin, { postId: post.id, creatorHandle: post.handle });
  assert.equal(tpl.scenes.length, 4);
});

test('Create My Version respects opt-out and blocks', () => {
  const optOut = SAMPLE_POSTS.find((p) => !p.allowRemix)!;
  assert.equal(toRemixTemplate(optOut), null);
  assert.equal(canRemix(optOut, new Set()), false);
  const ok = SAMPLE_POSTS[0];
  assert.equal(canRemix(ok, new Set()), true);
  assert.equal(canRemix(ok, new Set([ok.handle])), false);
});

test('comments, ages, dates, counts', () => {
  assert.equal(checkComment('').ok, false);
  assert.equal(checkComment('Love it!').ok, true);
  assert.equal(checkComment('see www.spam.com').ok, false);
  const now = new Date(2026, 10, 14);
  assert.equal(ageFrom({ year: 2008, month: 11, day: 14 }, now), 18);
  assert.equal(ageFrom({ year: 2008, month: 11, day: 15 }, now), 17);
  assert.equal(isValidDate(2023, 2, 29), false);
  assert.equal(isValidDate(2024, 2, 29), true);
  assert.equal(formatCount(2400), '2.4k');
  assert.equal(formatCount(999), '999');
  assert.equal(formatCount(12_500), '13k');
});

test('every template has 4 scenes and a matching sample post', () => {
  for (const t of TEMPLATES) {
    assert.equal(t.scenes.length, 4, t.templateId);
    assert.ok(SAMPLE_POSTS.some((p) => p.template?.templateId === t.templateId));
  }
});
