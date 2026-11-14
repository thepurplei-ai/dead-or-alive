import * as FS from 'expo-file-system/legacy';
import { Image } from 'expo-image';
import * as MediaLibrary from 'expo-media-library';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Modal, Platform, Pressable, Share, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Badge, Card, GhostButton, GradientButton, Ionicons, Notice, Row, Screen } from '../../components/ui';
import * as api from '../../lib/api';
import { blocker, kindsFor, refreshJob, startJob, statusLabel, TERMINAL } from '../../lib/generation';
import { deletePrivateCopy } from '../../lib/mediaStore';
import { CREDIT_COST } from '../../lib/rules';
import type { GenerationJob, GenerationKind, Project } from '../../lib/types';
import { newId, useApp } from '../../state/AppState';
import { colors, type } from '../../theme';

export default function ProjectScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, dispatch } = useApp();
  const project = state.projects.find((p) => p.id === id);
  const projectRef = useRef(project);
  projectRef.current = project;

  const [confirm, setConfirm] = useState<{ kind: GenerationKind; scene?: number } | null>(null);
  const [rights, setRights] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [editingTitle, setEditingTitle] = useState(false);
  const [caption, setCaption] = useState('');
  const [allowRemix, setAllowRemix] = useState(true);

  const update = useCallback((fn: (p: Project) => Project) => {
    const cur = projectRef.current;
    if (!cur) return;
    const next = fn(cur);
    projectRef.current = next;
    dispatch({ type: 'upsertProject', project: next });
  }, [dispatch]);

  // Resume polling any unfinished cloud job (also after an app restart).
  const running = project?.jobs.filter((j) => !TERMINAL.has(j.status)) ?? [];
  const runningKey = running.map((j) => j.id).join(',');
  useEffect(() => {
    if (!runningKey || !state.session) return;
    let stop = false;
    const tick = async () => {
      for (const j of projectRef.current?.jobs.filter((x) => !TERMINAL.has(x.status)) ?? []) {
        try { await refreshJob(j, update); } catch { /* keep trying; network may be down */ }
      }
      if (!stop) timer = setTimeout(tick, 5000);
    };
    let timer = setTimeout(tick, 1500);
    return () => { stop = true; clearTimeout(timer); };
  }, [runningKey, state.session, update]);

  if (!project) {
    return (
      <Screen>
        <Notice tone="error">This project no longer exists.</Notice>
        <GhostButton label="Back to Studio" onPress={() => router.navigate('/studio')} />
      </Screen>
    );
  }

  const block = blocker(project, !!state.session);
  const outputs = project.jobs.filter((j) => j.status === 'completed' && j.outputUrl);

  async function runGeneration() {
    if (!confirm || !project) return;
    setBusy(true);
    setError('');
    try {
      await startJob(project, confirm.kind, confirm.scene, update);
      setConfirm(null);
      setRights(false);
    } catch (e) {
      setError((e as Error).message);
      update((p) => ({ ...p, status: p.jobs.some((j) => j.status === 'completed') ? 'ready' : 'draft' }));
    } finally {
      setBusy(false);
    }
  }

  async function cancel(job: GenerationJob) {
    try {
      await api.cancelJob(job.id);
      await refreshJob(job, update);
    } catch (e) {
      Alert.alert('Could not cancel', (e as Error).message);
    }
  }

  async function saveToDevice(job: GenerationJob) {
    try {
      if (!job.outputUrl) return;
      if (Platform.OS === 'web') return void Share.share({ message: job.outputUrl });
      const perm = await MediaLibrary.requestPermissionsAsync(true);
      if (!perm.granted) return Alert.alert('Permission needed', 'Allow WonderReel to save to your photos in Settings.');
      const ext = job.outputKind === 'video' ? 'mp4' : 'png';
      const dest = `${FS.cacheDirectory}wonderreel-${job.id}.${ext}`;
      await FS.downloadAsync(job.outputUrl, dest);
      await MediaLibrary.saveToLibraryAsync(dest);
      await FS.deleteAsync(dest, { idempotent: true });
      Alert.alert('Saved', 'Saved to your photos. It is labelled as AI-generated inside WonderReel.');
    } catch (e) {
      Alert.alert('Could not save', (e as Error).message);
    }
  }

  async function publish() {
    if (!project?.remoteId) return;
    setBusy(true);
    setError('');
    try {
      const tags = (caption.match(/#[a-z0-9_]+/gi) ?? []).map((t) => t.slice(1).toLowerCase()).slice(0, 10);
      await api.requestPublish({ projectId: project.remoteId, caption, allowRemix, tags });
      update((p) => ({ ...p, status: 'pending_review', allowRemix }));
      Alert.alert('Sent for review', 'A moderator will check your video before it appears in the feed.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function duplicate() {
    if (!project) return;
    const now = new Date().toISOString();
    const copy: Project = { ...project, id: newId('proj'), title: project.title + ' (copy)', jobs: [], status: 'draft', remoteId: undefined, createdAt: now, updatedAt: now };
    dispatch({ type: 'upsertProject', project: copy });
    router.replace(`/project/${copy.id}`);
  }

  function remove() {
    Alert.alert('Delete project?', 'This removes it from this phone' + (project?.remoteId ? ' and from your cloud Studio.' : '.'), [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            if (project?.remoteId) await api.deleteCloudProject(project.remoteId);
          } catch (e) {
            return Alert.alert('Could not delete from the cloud', (e as Error).message);
          }
          await deletePrivateCopy(project!.media);
          dispatch({ type: 'deleteProject', id: project!.id });
          router.back();
        },
      },
    ]);
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: project.family ? 'Family story' : 'Project' }} />
      {editingTitle ? (
        <TextInput
          autoFocus
          defaultValue={project.title}
          onEndEditing={(e) => { const t = e.nativeEvent.text.trim(); if (t) update((p) => ({ ...p, title: t.slice(0, 80) })); setEditingTitle(false); }}
          style={[type.h1, styles.titleInput]}
        />
      ) : (
        <Pressable onPress={() => setEditingTitle(true)} accessibilityHint="Rename project">
          <Text style={type.h1}>{project.title} <Ionicons name="pencil" size={16} color={colors.muted} /></Text>
        </Pressable>
      )}
      <Row style={{ marginTop: 8, flexWrap: 'wrap' }}>
        <Badge label={project.status.replace('_', ' ')} tone={project.status === 'ready' ? 'ok' : 'muted'} />
        <Badge label={project.style} tone="muted" />
        <Badge label={project.aspect} tone="muted" />
        {project.family ? <Badge label="Family · private" /> : null}
      </Row>
      {project.remixOf ? (
        <Text style={[type.small, { marginTop: 8 }]}>↻ Your version of “{project.remixOf.title}” by @{project.remixOf.creatorHandle}. Credit is kept if you publish.</Text>
      ) : null}
      <Text style={[type.body, { marginTop: 10 }]}>{project.prompt}</Text>

      {project.media ? (
        <Card style={{ marginTop: 14, padding: 10 }}>
          <Text style={[type.small, { marginBottom: 8 }]}>YOUR SOURCE {project.media.kind.toUpperCase()} · stored privately on this phone</Text>
          {project.media.kind === 'image'
            ? <Image source={{ uri: project.media.uri }} style={styles.media} contentFit="cover" />
            : <VideoPreview uri={project.media.uri} />}
        </Card>
      ) : null}

      {project.storyboard ? (
        <Card style={{ marginTop: 14 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={type.h2}>Storyboard</Text>
            <Badge label="Plan · not a video" tone="muted" />
          </Row>
          {project.storyboard.scenes.map((s) => (
            <View key={s.number} style={styles.scene}>
              <Text style={styles.num}>{String(s.number).padStart(2, '0')}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.white, fontWeight: '800' }}>{s.title}</Text>
                <Text style={[type.body, { fontSize: 13 }]}>{s.description}</Text>
                {!block ? (
                  <Pressable onPress={() => setConfirm({ kind: project.media?.kind === 'image' ? 'image_to_video' : project.media?.kind === 'video' ? 'video_to_video' : 'text_to_image', scene: s.number })}>
                    <Text style={{ color: colors.pink, fontWeight: '700', fontSize: 12, marginTop: 4 }}>↻ Render this shot</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ))}
        </Card>
      ) : null}

      <Text style={[type.h2, { marginTop: 22, marginBottom: 8 }]}>Render with AI</Text>
      {block ? <Notice tone={project.family ? 'warn' : 'info'}>{block}</Notice> : (
        <View style={{ gap: 8 }}>
          {kindsFor(project).map((k) => (
            <Pressable key={k.kind} disabled={!!k.needs} onPress={() => setConfirm({ kind: k.kind })}
              style={[styles.kind, k.needs && { opacity: 0.45 }]} accessibilityRole="button" accessibilityLabel={k.label}>
              <Ionicons name={k.kind.endsWith('video') ? 'film' : 'image'} size={20} color={colors.pink} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.white, fontWeight: '700' }}>{k.label}</Text>
                <Text style={type.small}>{k.needs ?? `About ${CREDIT_COST[k.kind]} credit${CREDIT_COST[k.kind] > 1 ? 's' : ''}`}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </Pressable>
          ))}
          {!state.session && !project.family ? <GradientButton label="Sign in" icon="log-in" onPress={() => router.push('/auth')} /> : null}
        </View>
      )}
      {error ? <Notice tone="error">{error}</Notice> : null}

      {project.jobs.length ? (
        <>
          <Text style={[type.h2, { marginTop: 22, marginBottom: 8 }]}>Jobs</Text>
          {project.jobs.map((j) => (
            <Card key={j.id} style={{ marginBottom: 8, padding: 12 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text style={{ color: colors.white, fontWeight: '700' }}>{j.kind.replace(/_/g, ' ')}</Text>
                <Badge label={statusLabel(j.status)} tone={j.status === 'completed' ? 'ok' : TERMINAL.has(j.status) ? 'error' : 'warn'} />
              </Row>
              <Text style={[type.small, { marginTop: 4 }]}>Started {new Date(j.createdAt).toLocaleString()}{j.creditsReserved ? ` · ${j.creditsReserved} credits` : ''}</Text>
              {j.error ? <Text style={[type.small, { color: colors.danger, marginTop: 4 }]}>{j.error}</Text> : null}
              {!TERMINAL.has(j.status) ? (
                <Pressable onPress={() => cancel(j)}><Text style={{ color: colors.muted, marginTop: 6, fontWeight: '700' }}>Cancel</Text></Pressable>
              ) : null}
            </Card>
          ))}
        </>
      ) : null}

      {outputs.length ? (
        <>
          <Text style={[type.h2, { marginTop: 22, marginBottom: 8 }]}>Your results</Text>
          {outputs.map((j) => (
            <Card key={j.id} style={{ marginBottom: 12, padding: 10 }}>
              <Text style={[type.small, { marginBottom: 8 }]}>✦ AI-GENERATED · PRIVATE</Text>
              {j.outputKind === 'video' ? <VideoPreview uri={j.outputUrl!} /> : <Image source={{ uri: j.outputUrl }} style={styles.media} contentFit="contain" />}
              <Row style={{ marginTop: 10 }}>
                <GhostButton label="Save to phone" icon="download-outline" onPress={() => saveToDevice(j)} style={{ flex: 1 }} />
              </Row>
            </Card>
          ))}
        </>
      ) : null}

      {outputs.length && !project.family && project.remoteId && project.status !== 'pending_review' && project.status !== 'published' ? (
        <Card style={{ marginTop: 10 }}>
          <Text style={type.h2}>Share with the community</Text>
          <Text style={[type.small, { marginTop: 4, marginBottom: 10 }]}>
            Your video stays private until a moderator approves it. Adults (18+) only. Do not post children or anyone who has not agreed.
          </Text>
          <TextInput value={caption} onChangeText={setCaption} placeholder="Caption, #tags" placeholderTextColor={colors.muted2} maxLength={500} multiline style={styles.caption} />
          <Row style={{ justifyContent: 'space-between', marginVertical: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.white, fontWeight: '700' }}>Allow “Create My Version”</Text>
              <Text style={type.small}>Others can reuse your story idea and scenes — never your face, voice or video.</Text>
            </View>
            <Switch value={allowRemix} onValueChange={setAllowRemix} trackColor={{ true: colors.purple }} />
          </Row>
          <GradientButton label="Request publishing" icon="cloud-upload" onPress={publish} loading={busy} />
        </Card>
      ) : null}
      {project.status === 'pending_review' ? <Notice tone="info">Waiting for moderator review. You will see it in the feed once it is approved.</Notice> : null}

      <View style={{ gap: 8, marginTop: 22 }}>
        <GhostButton label="Edit in Create" icon="create-outline" onPress={() => {
          dispatch({ type: 'pendingRemix', template: { templateId: project.remixOf?.templateId ?? project.id, title: project.title, category: 'Adventure', style: project.style, prompt: project.prompt, scenes: project.storyboard?.scenes ?? [], origin: project.remixOf?.postId ? { postId: project.remixOf.postId, creatorHandle: project.remixOf.creatorHandle } : undefined } });
          router.navigate('/create');
        }} />
        <GhostButton label="Export storyboard" icon="share-outline" onPress={() => Share.share({ message: JSON.stringify(project.storyboard, null, 2) })} />
        <GhostButton label="Duplicate" icon="copy-outline" onPress={duplicate} />
        <GhostButton label="Delete project" icon="trash-outline" danger onPress={remove} />
      </View>

      <Modal visible={!!confirm} transparent animationType="fade" onRequestClose={() => setConfirm(null)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text style={type.h2}>Confirm AI render</Text>
            <Text style={[type.body, { marginTop: 8 }]}>
              {confirm ? `${kindsFor(project).find((k) => k.kind === confirm.kind)?.label}${confirm.scene ? ` · scene ${confirm.scene}` : ''}` : ''}
            </Text>
            <Text style={[type.body, { marginTop: 4 }]}>
              Estimated cost: <Text style={{ color: colors.pink, fontWeight: '800' }}>{confirm ? CREDIT_COST[confirm.kind] : 0} credits</Text>. Credits are refunded if the render fails.
            </Text>
            {confirm && confirm.kind !== 'text_to_image' ? (
              <Pressable onPress={() => setRights(!rights)} style={styles.check} accessibilityRole="checkbox" accessibilityState={{ checked: rights }}>
                <Ionicons name={rights ? 'checkbox' : 'square-outline'} size={22} color={rights ? colors.pink : colors.muted} />
                <Text style={[type.body, { flex: 1 }]}>
                  I own this {project.media?.kind}, everyone in it is an adult (18+) who agreed, and I agree to send it to WonderReel’s AI
                  provider for this render.
                </Text>
              </Pressable>
            ) : null}
            <View style={{ gap: 8, marginTop: 14 }}>
              <GradientButton label="Start render" icon="sparkles" loading={busy} disabled={!!confirm && confirm.kind !== 'text_to_image' && !rights} onPress={runGeneration} />
              <GhostButton label="Cancel" onPress={() => { setConfirm(null); setRights(false); }} />
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

function VideoPreview({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => { p.loop = true; });
  return <VideoView player={player} style={styles.media} contentFit="contain" nativeControls />;
}

const styles = StyleSheet.create({
  titleInput: { borderBottomWidth: 1, borderBottomColor: colors.pink, paddingVertical: 4 },
  media: { width: '100%', height: 320, borderRadius: 12, backgroundColor: '#0e1020' },
  scene: { flexDirection: 'row', gap: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.line, marginTop: 6 },
  num: { color: colors.pink, fontWeight: '900', fontSize: 16, width: 26 },
  kind: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line },
  caption: { minHeight: 70, backgroundColor: colors.panel2, borderRadius: 12, borderWidth: 1, borderColor: '#333447', color: colors.white, padding: 12, textAlignVertical: 'top' },
  backdrop: { flex: 1, backgroundColor: '#000a', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.panel, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, paddingBottom: 36, borderWidth: 1, borderColor: colors.line },
  check: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginTop: 14 },
});
