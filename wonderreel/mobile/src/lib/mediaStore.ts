// Keeps picked photos/videos inside the app's private document folder so Studio
// drafts survive restarts. Files never leave the phone unless the user starts a
// cloud generation (and never in Family Mode).
import * as FS from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import type { LocalMedia } from './types';

const DIR = (FS.documentDirectory ?? '') + 'private-media/';

export async function keepPrivateCopy(media: LocalMedia, projectId: string): Promise<LocalMedia> {
  if (Platform.OS === 'web' || !FS.documentDirectory) return media;
  if (media.uri.startsWith(DIR)) return media;
  await FS.makeDirectoryAsync(DIR, { intermediates: true }).catch(() => {});
  const ext = media.kind === 'image' ? (media.mimeType.split('/')[1] ?? 'jpg').replace('jpeg', 'jpg') : media.mimeType.includes('quicktime') ? 'mov' : 'mp4';
  const dest = `${DIR}${projectId}-${Date.now()}.${ext}`;
  await FS.copyAsync({ from: media.uri, to: dest });
  return { ...media, uri: dest };
}

export async function deletePrivateCopy(media: LocalMedia | null) {
  if (!media || Platform.OS === 'web' || !media.uri.startsWith(DIR)) return;
  await FS.deleteAsync(media.uri, { idempotent: true }).catch(() => {});
}

export async function wipeAllPrivateMedia() {
  if (Platform.OS === 'web' || !FS.documentDirectory) return;
  await FS.deleteAsync(DIR, { idempotent: true }).catch(() => {});
}
