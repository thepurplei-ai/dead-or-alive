// Pure helpers with no phone or internet dependencies. Tested by `npm test`.

// Letters and numbers that are hard to mix up when read aloud or typed (no 0/O, 1/I/L).
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 6;
export const CODE_TTL_MS = 15 * 60 * 1000; // a pairing code works for 15 minutes

/** A new pairing code like "K7P2QX". `random` returns 0..1 (Math.random by default). */
export function makePairCode(random = Math.random) {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  }
  return code;
}

/** Cleans what the person typed: "k7p 2qx" → "K7P2QX". Returns null if it cannot be a code. */
export function normalizeCode(input) {
  const code = String(input || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
    .replace(/O/g, '0').replace(/[IL]/g, '1');
  if (code.length !== CODE_LENGTH) return null;
  for (const ch of code) if (!CODE_ALPHABET.includes(ch)) return null;
  return code;
}

/** The same id for the pair whoever creates it. */
export function pairIdFor(uidA, uidB) {
  return [uidA, uidB].sort().join('_');
}

/** The other person in a pair. */
export function partnerOf(members, myUid) {
  return (members || []).find((m) => m !== myUid) || null;
}

/** Straight-line distance in metres between two { lat, lng } points (haversine). */
export function distanceMeters(a, b) {
  if (!a || !b) return null;
  const R = 6371000;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** "35 m", "1.4 km", "12 km". */
export function formatDistance(m) {
  if (m == null || !isFinite(m)) return '';
  if (m < 1000) return `${Math.round(m / 5) * 5} m`;
  if (m < 10000) return `${(m / 1000).toFixed(1)} km`;
  return `${Math.round(m / 1000)} km`;
}

/** How old a location is, in whole minutes. */
export function ageMinutes(ts, now = Date.now()) {
  if (ts == null) return null;
  return Math.max(0, Math.floor((now - ts) / 60000));
}

/**
 * Should we send a new location? Yes if we never sent one, if we moved far enough,
 * or if enough time passed (so the other person sees we are still online).
 */
export function shouldSend(last, next, now = Date.now(), minMeters = 15, maxAgeMs = 60000) {
  if (!last) return true;
  if (now - last.ts >= maxAgeMs) return true;
  return distanceMeters(last, next) >= minMeters;
}

/** Link that opens walking directions in Google Maps (works on Android and iPhone). */
export function directionsUrl(dest) {
  return `https://www.google.com/maps/dir/?api=1&destination=${dest.lat},${dest.lng}&travelmode=walking`;
}

/** Message text: trimmed, not empty, not too long. Returns null if nothing to send. */
export function cleanMessage(text, max = 500) {
  const t = String(text || '').trim();
  if (!t) return null;
  return t.slice(0, max);
}
