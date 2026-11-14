// Tests for src/core.js. Run with: npm test
import assert from 'assert';
import * as C from '../src/core.js';

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log('ok -', name);
}

test('pair code has 6 easy characters', () => {
  for (let i = 0; i < 200; i++) {
    const code = C.makePairCode();
    assert.strictEqual(code.length, 6);
    assert.ok(/^[A-HJKMNP-Z2-9]{6}$/.test(code), code);
  }
});

test('typed code is cleaned', () => {
  assert.strictEqual(C.normalizeCode(' k7p 2qx '), 'K7P2QX');
  assert.strictEqual(C.normalizeCode('K7P-2QX'), 'K7P2QX');
  assert.strictEqual(C.normalizeCode('ABC'), null);
  assert.strictEqual(C.normalizeCode('ABCDE0'), null); // 0 is never in a code
  assert.strictEqual(C.normalizeCode(''), null);
});

test('pair id is the same from both sides', () => {
  assert.strictEqual(C.pairIdFor('b', 'a'), C.pairIdFor('a', 'b'));
  assert.strictEqual(C.partnerOf(['a', 'b'], 'a'), 'b');
  assert.strictEqual(C.partnerOf(['a', 'b'], 'b'), 'a');
});

test('distance Madrid → Barcelona is about 505 km', () => {
  const d = C.distanceMeters({ lat: 40.4168, lng: -3.7038 }, { lat: 41.3874, lng: 2.1686 });
  assert.ok(d > 495000 && d < 510000, String(d));
  assert.strictEqual(C.distanceMeters({ lat: 1, lng: 1 }, { lat: 1, lng: 1 }), 0);
});

test('distance text', () => {
  assert.strictEqual(C.formatDistance(33), '35 m');
  assert.strictEqual(C.formatDistance(1420), '1.4 km');
  assert.strictEqual(C.formatDistance(23400), '23 km');
  assert.strictEqual(C.formatDistance(null), '');
});

test('location is sent only when useful', () => {
  const last = { lat: 40, lng: -3, ts: 0 };
  assert.ok(C.shouldSend(null, last, 0));
  assert.ok(!C.shouldSend(last, { lat: 40.00001, lng: -3 }, 5000)); // ~1 m, 5 s
  assert.ok(C.shouldSend(last, { lat: 40.001, lng: -3 }, 5000));    // ~110 m
  assert.ok(C.shouldSend(last, { lat: 40, lng: -3 }, 61000));       // 1 minute later
});

test('age and links', () => {
  assert.strictEqual(C.ageMinutes(0, 5 * 60000 + 10), 5);
  assert.strictEqual(C.ageMinutes(null), null);
  assert.ok(C.directionsUrl({ lat: 1.5, lng: 2.5 }).includes('destination=1.5,2.5'));
  assert.strictEqual(C.cleanMessage('  hi  '), 'hi');
  assert.strictEqual(C.cleanMessage('   '), null);
});

console.log(`\nAll tests passed (${passed})`);
