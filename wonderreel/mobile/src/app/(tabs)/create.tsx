import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Badge, Card, Chip, GhostButton, GradientButton, Ionicons, Kicker, Notice, Row, Screen } from '../../components/ui';
import { FAMILY_PROMPTS, PROMPT_CHIPS } from '../../data/samples';
import * as api from '../../lib/api';
import { cloudEnabled } from '../../lib/config';
import { keepPrivateCopy } from '../../lib/mediaStore';
import { checkMedia, checkPrompt, guessMime } from '../../lib/rules';
import { applyDirectorEdit, planStoryboard } from '../../lib/storyboard';
import {
  ASPECTS, STYLES, type AspectRatio, type ChatMessage, type LocalMedia, type Project, type RemixTemplate, type Storyboard, type Style,
} from '../../lib/types';
import { newId, useApp } from '../../state/AppState';
import { colors, type } from '../../theme';

export default function Create() {
  const { state, dispatch } = useApp();
  const [remix, setRemix] = useState<RemixTemplate | null>(null);
  const [family, setFamily] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [style, setStyle] = useState<Style>('Cinematic');
  const [aspect, setAspect] = useState<AspectRatio>('9:16');
  const [media, setMedia] = useState<LocalMedia | null>(null);
  const [board, setBoard] = useState<Storyboard | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [permissionHelp, setPermissionHelp] = useState('');

  // Pick up "Create My Version" templates or a Family Mode request.
  useEffect(() => {
    if (state.pendingRemix) {
      const t = state.pendingRemix;
      reset();
      setRemix(t);
      setPrompt(t.prompt);
      setStyle(t.style);
      setBoard({ title: t.title, theme: t.category, style: t.style, prompt: t.prompt, scenes: t.scenes, source: 'local' });
      setChat([{ id: newId('m'), role: 'director', text: `Template loaded: “${t.title}”. Add your own photo or video, or change any scene. Tell me what to change.` }]);
      dispatch({ type: 'pendingRemix', template: null });
    } else if (state.pendingFamily) {
      reset();
      setFamily(true);
      setStyle('Animated');
      dispatch({ type: 'pendingFamily', on: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.pendingRemix, state.pendingFamily]);

  function reset() {
    setRemix(null); setFamily(false); setPrompt(''); setMedia(null); setBoard(null); setChat([]); setError(''); setPermissionHelp('');
  }

  async function pick(source: 'camera' | 'library', kind: 'image' | 'video') {
    setError('');
    setPermissionHelp('');
    try {
      if (source === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          setPermissionHelp('Camera access is off. You can turn it on in your phone settings, or choose from your gallery instead.');
          return;
        }
      } else {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted && perm.accessPrivileges !== 'limited') {
          setPermissionHelp('Photo access is off. You can turn it on in your phone settings.');
          return;
        }
      }
      const opts: ImagePicker.ImagePickerOptions = {
        mediaTypes: [kind === 'image' ? 'images' : 'videos'],
        quality: 0.9,
        videoMaxDuration: 30,
        allowsEditing: kind === 'image',
        exif: false,
      };
      const res = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
      if (res.canceled || !res.assets?.length) return;
      const a = res.assets[0];
      const k = a.type === 'video' ? 'video' : 'image';
      const m: LocalMedia = {
        uri: a.uri, kind: k, mimeType: guessMime(a.uri, k, a.mimeType), sizeBytes: a.fileSize ?? undefined,
        durationMs: a.duration ?? undefined, width: a.width, height: a.height, fileName: a.fileName ?? undefined,
      };
      const c = checkMedia(m);
      if (!c.ok) return setError(c.reason);
      setMedia(m);
    } catch (e) {
      setError('Could not open that file. ' + (e as Error).message);
    }
  }

  async function plan() {
    setError('');
    const c = checkPrompt(prompt);
    if (!c.ok) return setError(c.reason);
    setBusy(true);
    try {
      // Cloud AI Director only for signed-in adults, never for Family Mode.
      if (cloudEnabled && state.session && !family) {
        const r = await api.askDirector({ prompt, style, storyboard: remix ? board : null });
        setBoard(r.storyboard);
        setChat((m) => [...m, { id: newId('m'), role: 'director', text: r.reply }]);
      } else {
        const b = planStoryboard(prompt, style);
        setBoard(b);
        setChat((m) => [...m, { id: newId('m'), role: 'director', text: `Here is a 4-scene plan: “${b.title}”. Ask me to change anything.` }]);
      }
    } catch (e) {
      const b = planStoryboard(prompt, style);
      setBoard(b);
      setChat((m) => [...m, { id: newId('m'), role: 'director', text: `The cloud Director is unavailable (${(e as Error).message}). I made this plan on your phone instead.` }]);
    } finally {
      setBusy(false);
    }
  }

  async function sendMessage() {
    const text = message.trim();
    if (!text || !board) return;
    setMessage('');
    setChat((m) => [...m, { id: newId('m'), role: 'user', text }]);
    if (cloudEnabled && state.session && !family) {
      setBusy(true);
      try {
        const r = await api.askDirector({ prompt, style, storyboard: board, message: text });
        setBoard(r.storyboard);
        setChat((m) => [...m, { id: newId('m'), role: 'director', text: r.reply }]);
        return;
      } catch {
        /* fall back to the on-device Director below */
      } finally {
        setBusy(false);
      }
    }
    const r = applyDirectorEdit(board, text);
    setBoard(r.board);
    setChat((m) => [...m, { id: newId('m'), role: 'director', text: r.reply }]);
  }

  async function save(openAfter: boolean) {
    setError('');
    const c = checkPrompt(prompt);
    if (!c.ok) return setError(c.reason);
    const id = newId('proj');
    const now = new Date().toISOString();
    const kept = media ? await keepPrivateCopy(media, id).catch(() => media) : null;
    const project: Project = {
      id,
      title: (board?.title ?? prompt).slice(0, 60),
      prompt,
      style,
      aspect,
      storyboard: board ?? planStoryboard(prompt, style),
      media: kept,
      jobs: [],
      status: 'draft',
      family,
      allowRemix: false,
      remixOf: remix?.origin ? { ...remix.origin, templateId: remix.templateId, title: remix.title } : remix ? { templateId: remix.templateId, title: remix.title, postId: '', creatorHandle: 'wonderreel' } : undefined,
      createdAt: now,
      updatedAt: now,
    };
    dispatch({ type: 'upsertProject', project });
    reset();
    if (openAfter) router.push(`/project/${id}`);
    else Alert.alert('Saved to Studio', 'Your project is saved privately on this phone.', [
      { text: 'Open Studio', onPress: () => router.navigate('/studio') }, { text: 'OK' },
    ]);
  }

  const chips = family ? FAMILY_PROMPTS : PROMPT_CHIPS;

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <Kicker style={{ marginBottom: 0 }}>{family ? 'FAMILY MODE · PRIVATE' : 'AI CREATE'}</Kicker>
        {(remix || family || prompt || media) ? (
          <Pressable onPress={reset} accessibilityRole="button"><Text style={{ color: colors.muted, fontWeight: '700' }}>Start over</Text></Pressable>
        ) : null}
      </Row>
      <Text style={[type.h1, { marginTop: 6 }]}>What do you <Text style={{ color: colors.pink }}>imagine</Text>?</Text>

      {remix ? (
        <Notice tone="info" icon="sparkles">
          Creating your version of “{remix.title}”{remix.origin ? ` by @${remix.origin.creatorHandle}` : ''}. Only the story idea and scene
          structure are used — never anyone’s face, voice or video. Add your own photo or video.
        </Notice>
      ) : null}
      {family ? (
        <Notice tone="warn" icon="shield-checkmark">
          Family Mode is private and stays on this phone. Cloud AI is turned off for children’s photos and videos until parental consent,
          safety checks and legal review are complete. You can plan and save stories.
        </Notice>
      ) : null}

      <Text style={[type.h2, styles.h]}>1 · Your photo or video</Text>
      {media ? (
        <Card style={{ padding: 10 }}>
          <View style={styles.preview}>
            {media.kind === 'image'
              ? <Image source={{ uri: media.uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
              : <View style={[StyleSheet.absoluteFill, styles.videoStub]}><Ionicons name="videocam" size={40} color={colors.pink} /><Text style={type.small}>Video ready{media.durationMs ? ` · ${Math.round(media.durationMs / 1000)}s` : ''}</Text></View>}
          </View>
          <Row style={{ marginTop: 10, justifyContent: 'space-between' }}>
            <Text style={[type.small, { flex: 1 }]} numberOfLines={1}>{media.fileName ?? (media.kind === 'image' ? 'Photo' : 'Video')} · stays on your phone</Text>
            <Pressable onPress={() => setMedia(null)} accessibilityRole="button"><Text style={{ color: colors.danger, fontWeight: '700' }}>Remove</Text></Pressable>
          </Row>
        </Card>
      ) : (
        <View style={styles.mediaGrid}>
          <MediaTile icon="camera" label="Take photo" onPress={() => pick('camera', 'image')} />
          <MediaTile icon="videocam" label="Record video" onPress={() => pick('camera', 'video')} />
          <MediaTile icon="images" label="Photo from gallery" onPress={() => pick('library', 'image')} />
          <MediaTile icon="film" label="Video from gallery" onPress={() => pick('library', 'video')} />
        </View>
      )}
      {permissionHelp ? (
        <Notice tone="warn">
          {permissionHelp} <Text onPress={() => Linking.openSettings()} style={{ color: colors.pink, fontWeight: '800' }}>Open settings</Text>
        </Notice>
      ) : null}
      <Text style={[type.small, { marginTop: 6 }]}>Optional. Without one, the AI can make a picture from your words alone.</Text>

      <Text style={[type.h2, styles.h]}>2 · Describe your movie</Text>
      <TextInput
        value={prompt}
        onChangeText={setPrompt}
        multiline
        placeholder={family ? 'A cozy mission to help Santa…' : 'Make me a superhero saving a puppy…'}
        placeholderTextColor={colors.muted2}
        style={styles.prompt}
        maxLength={1500}
        accessibilityLabel="Describe your movie"
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 8 }}>
        {chips.map((c) => <Chip key={c.label} label={c.label} icon="flash" onPress={() => setPrompt(c.prompt)} />)}
      </ScrollView>

      <Text style={[type.h2, styles.h]}>3 · Style</Text>
      <View style={styles.wrap}>{STYLES.map((s) => <Chip key={s} label={s} selected={style === s} onPress={() => setStyle(s)} />)}</View>
      <View style={[styles.wrap, { marginTop: 10 }]}>
        {ASPECTS.map((a) => <Chip key={a} label={a === '9:16' ? '9:16 vertical' : a} selected={aspect === a} onPress={() => setAspect(a)} icon="crop" />)}
      </View>

      <Text style={[type.h2, styles.h]}>4 · AI Director</Text>
      {!board ? (
        <GradientButton label="Plan my 4-scene movie" icon="sparkles" onPress={plan} loading={busy} />
      ) : (
        <Card>
          <Row style={{ justifyContent: 'space-between', marginBottom: 8 }}>
            <Text style={[type.h2, { flex: 1 }]} numberOfLines={2}>{board.title}</Text>
            <Badge label="Plan · not a video" tone="muted" />
          </Row>
          {board.scenes.map((s) => (
            <View key={s.number} style={styles.scene}>
              <Text style={styles.sceneNum}>{String(s.number).padStart(2, '0')}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.white, fontWeight: '800' }}>{s.title}</Text>
                <Text style={[type.body, { fontSize: 13 }]}>{s.description}</Text>
                {s.camera ? <Text style={[type.small, { marginTop: 2 }]}>🎥 {s.camera}</Text> : null}
              </View>
            </View>
          ))}
          <View style={{ marginTop: 10, gap: 8 }}>
            {chat.slice(-4).map((m) => (
              <View key={m.id} style={[styles.bubble, m.role === 'user' ? styles.bubbleUser : styles.bubbleAi]}>
                <Text style={{ color: colors.white, fontSize: 13, lineHeight: 18 }}>{m.text}</Text>
              </View>
            ))}
          </View>
          <Row style={{ marginTop: 10 }}>
            <TextInput
              value={message}
              onChangeText={setMessage}
              placeholder='e.g. "add a friendly robot"'
              placeholderTextColor={colors.muted2}
              style={[styles.prompt, { minHeight: 44, flex: 1, marginTop: 0 }]}
              onSubmitEditing={sendMessage}
              returnKeyType="send"
              accessibilityLabel="Message the AI Director"
            />
            <Pressable onPress={sendMessage} style={styles.send} accessibilityLabel="Send to Director">
              {busy ? <ActivityIndicator color="#fff" /> : <Ionicons name="send" size={18} color="#fff" />}
            </Pressable>
          </Row>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 10 }}>
            {['Change the ending', 'Make it more dramatic', 'Add a friendly robot', 'Make it funnier'].map((s) => (
              <Chip key={s} label={s} onPress={() => setMessage(s)} />
            ))}
          </ScrollView>
        </Card>
      )}

      {error ? <Notice tone="error">{error}</Notice> : null}

      <View style={{ gap: 10, marginTop: 18 }}>
        <GradientButton label={family ? 'Save private family story' : 'Save & continue to render'} icon="arrow-forward" onPress={() => save(true)} />
        <GhostButton label="Save to Studio" icon="bookmark-outline" onPress={() => save(false)} />
      </View>
      {!family ? (
        <Text style={[type.small, { marginTop: 10, lineHeight: 18 }]}>
          Next you will see the credit cost and confirm before anything is sent to an AI service. Results stay private until you ask
          to publish — and every public video is checked by a moderator first.
        </Text>
      ) : null}
    </Screen>
  );
}

function MediaTile({ icon, label, onPress }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.tile, pressed && { borderColor: colors.pink }]} accessibilityRole="button" accessibilityLabel={label}>
      <Ionicons name={icon} size={26} color={colors.pink} />
      <Text style={styles.tileText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  h: { marginTop: 22, marginBottom: 10, fontSize: 17 },
  mediaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: {
    width: '48.4%', height: 92, borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', borderColor: '#4a4166',
    backgroundColor: colors.panel, alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  tileText: { color: '#e4dcf3', fontWeight: '700', fontSize: 13 },
  preview: { height: 260, borderRadius: 12, overflow: 'hidden', backgroundColor: '#0e1020' },
  videoStub: { alignItems: 'center', justifyContent: 'center', gap: 6 },
  prompt: {
    minHeight: 110, marginTop: 0, backgroundColor: colors.panel2, borderWidth: 1, borderColor: '#333447', borderRadius: 14,
    color: colors.white, padding: 14, fontSize: 15, lineHeight: 21, textAlignVertical: 'top',
  },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  scene: { flexDirection: 'row', gap: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.line },
  sceneNum: { color: colors.pink, fontWeight: '900', fontSize: 16, width: 26 },
  bubble: { padding: 10, borderRadius: 12, maxWidth: '90%' },
  bubbleAi: { backgroundColor: '#22193a', alignSelf: 'flex-start' },
  bubbleUser: { backgroundColor: '#393348', alignSelf: 'flex-end' },
  send: { width: 46, height: 46, borderRadius: 12, backgroundColor: colors.purple, alignItems: 'center', justifyContent: 'center' },
});
