// Everything that talks to Firebase lives here.
//
// Data (Cloud Firestore):
//   codes/{CODE}                      { uid, name, createdAt }        short-lived pairing code
//   pairs/{pairId}                    { members:[a,b], names:{uid:name}, tokens:{uid:pushToken}, sos:{...}|null }
//   pairs/{pairId}/locations/{uid}    { lat, lng, accuracy, ts }      latest position only
//   pairs/{pairId}/messages/{id}      { from, text, ts, kind:'text'|'sos'|'ok' }
//
// Sign-in is anonymous: each phone gets its own private id, no email or password.

import { initializeApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence, onAuthStateChanged, signInAnonymously } from '@firebase/auth';
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, deleteField, collection, query, where,
  orderBy, limit, onSnapshot, addDoc, runTransaction,
} from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { firebaseConfig } from './firebaseConfig';
import { makePairCode, normalizeCode, pairIdFor, CODE_TTL_MS } from './core';

const app = initializeApp(firebaseConfig);
const auth = initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
const db = getFirestore(app);

/** Calls back with the signed-in user id (signs in anonymously the first time). */
export function watchUser(cb) {
  return onAuthStateChanged(auth, (user) => {
    if (user) cb(user.uid);
    else signInAnonymously(auth).catch((e) => cb(null, e));
  });
}

// ---------- Pairing ----------

/** Makes a code the other person types in. Returns the code. */
export async function createCode(uid, name) {
  for (let i = 0; i < 5; i++) {
    const code = makePairCode();
    const ref = doc(db, 'codes', code);
    const free = await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists() && Date.now() - snap.data().createdAt < CODE_TTL_MS) return false;
      tx.set(ref, { uid, name, createdAt: Date.now() });
      return true;
    }).catch(() => false);
    if (free) return code;
  }
  throw new Error('code');
}

export function cancelCode(code) {
  return deleteDoc(doc(db, 'codes', code)).catch(() => {});
}

/** Uses the other person's code to connect the two phones. Returns 'ok', 'notFound', 'expired' or 'self'. */
export async function joinWithCode(uid, name, typed) {
  const code = normalizeCode(typed);
  if (!code) return 'notFound';
  const snap = await getDoc(doc(db, 'codes', code));
  if (!snap.exists()) return 'notFound';
  const other = snap.data();
  if (Date.now() - other.createdAt > CODE_TTL_MS) return 'expired';
  if (other.uid === uid) return 'self';
  const pairId = pairIdFor(uid, other.uid);
  await setDoc(doc(db, 'pairs', pairId), {
    members: [uid, other.uid].sort(),
    names: { [uid]: name, [other.uid]: other.name },
    tokens: {},
    sos: null,
    code, // lets the security rules check the code really belongs to the other person
    createdAt: Date.now(),
  });
  await deleteDoc(doc(db, 'codes', code)).catch(() => {});
  return 'ok';
}

/** Calls back with my pair { id, ...data } or null. */
export function watchMyPair(uid, cb) {
  const q = query(collection(db, 'pairs'), where('members', 'array-contains', uid), limit(1));
  return onSnapshot(q, (s) => cb(s.empty ? null : { id: s.docs[0].id, ...s.docs[0].data() }), () => cb(null));
}

export function unpair(pairId) {
  return deleteDoc(doc(db, 'pairs', pairId));
}

export function saveMyName(pairId, uid, name) {
  return updateDoc(doc(db, 'pairs', pairId), { [`names.${uid}`]: name });
}

export function savePushToken(pairId, uid, token) {
  return updateDoc(doc(db, 'pairs', pairId), { [`tokens.${uid}`]: token || deleteField() });
}

// ---------- Location ----------

export function sendLocation(pairId, uid, p) {
  return setDoc(doc(db, 'pairs', pairId, 'locations', uid), {
    lat: p.lat, lng: p.lng, accuracy: p.accuracy ?? null, ts: Date.now(),
  });
}

/** Calls back with { [uid]: {lat,lng,accuracy,ts} } for both people. */
export function watchLocations(pairId, cb) {
  return onSnapshot(collection(db, 'pairs', pairId, 'locations'), (s) => {
    const out = {};
    s.forEach((d) => { out[d.id] = d.data(); });
    cb(out);
  });
}

// ---------- Messages & SOS ----------

export function watchMessages(pairId, cb) {
  const q = query(collection(db, 'pairs', pairId, 'messages'), orderBy('ts', 'desc'), limit(100));
  return onSnapshot(q, (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))));
}

export function sendMessage(pairId, uid, text, kind = 'text', extra = {}) {
  return addDoc(collection(db, 'pairs', pairId, 'messages'), { from: uid, text, kind, ts: Date.now(), ...extra });
}

/** Turns SOS on, with my position if known. */
export async function startSos(pairId, uid, pos) {
  const sos = { from: uid, ts: Date.now(), lat: pos?.lat ?? null, lng: pos?.lng ?? null };
  await updateDoc(doc(db, 'pairs', pairId), { sos });
  await sendMessage(pairId, uid, '', 'sos', { lat: sos.lat, lng: sos.lng });
}

export async function endSos(pairId, uid) {
  await updateDoc(doc(db, 'pairs', pairId), { sos: null });
  await sendMessage(pairId, uid, '', 'ok');
}
