// Session storage for Supabase Auth backed by the phone's secure keystore.
// SecureStore values are limited in size, so long values are split into chunks.
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const CHUNK = 1800;
const safeKey = (k: string) => k.replace(/[^A-Za-z0-9._-]/g, '_');

async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') return globalThis.localStorage?.getItem(key) ?? null;
  const k = safeKey(key);
  const count = await SecureStore.getItemAsync(`${k}__n`);
  if (!count) return null;
  const parts: string[] = [];
  for (let i = 0; i < Number(count); i++) {
    const part = await SecureStore.getItemAsync(`${k}__${i}`);
    if (part == null) return null;
    parts.push(part);
  }
  return parts.join('');
}

async function removeItem(key: string): Promise<void> {
  if (Platform.OS === 'web') return void globalThis.localStorage?.removeItem(key);
  const k = safeKey(key);
  const count = Number((await SecureStore.getItemAsync(`${k}__n`)) ?? 0);
  for (let i = 0; i < count; i++) await SecureStore.deleteItemAsync(`${k}__${i}`);
  await SecureStore.deleteItemAsync(`${k}__n`);
}

async function setItem(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') return void globalThis.localStorage?.setItem(key, value);
  await removeItem(key);
  const k = safeKey(key);
  const n = Math.ceil(value.length / CHUNK) || 1;
  for (let i = 0; i < n; i++) await SecureStore.setItemAsync(`${k}__${i}`, value.slice(i * CHUNK, (i + 1) * CHUNK));
  await SecureStore.setItemAsync(`${k}__n`, String(n));
}

export const secureStorage = { getItem, setItem, removeItem };
