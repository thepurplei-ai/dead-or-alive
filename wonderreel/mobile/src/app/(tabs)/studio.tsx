import { Image } from 'expo-image';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Badge, Chip, Empty, GradientButton, Ionicons, Kicker, Screen } from '../../components/ui';
import { posterSource } from '../../data/posters';
import { openFamilyCreate } from '../../lib/flow';
import type { Project } from '../../lib/types';
import { useApp } from '../../state/AppState';
import { colors, type } from '../../theme';

type Filter = 'all' | 'drafts' | 'ready' | 'family' | 'published';

const STATUS: Record<Project['status'], [string, 'muted' | 'pink' | 'ok' | 'warn' | 'error']> = {
  draft: ['Draft', 'muted'],
  generating: ['Rendering', 'warn'],
  ready: ['Ready', 'ok'],
  pending_review: ['In review', 'pink'],
  published: ['Published', 'ok'],
  rejected: ['Not approved', 'error'],
};

export default function Studio() {
  const { state, dispatch } = useApp();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const items = useMemo(() => {
    const s = q.trim().toLowerCase();
    return state.projects.filter((p) => {
      if (s && !`${p.title} ${p.prompt}`.toLowerCase().includes(s)) return false;
      if (filter === 'drafts') return p.status === 'draft' && !p.family;
      if (filter === 'ready') return p.status === 'ready';
      if (filter === 'family') return p.family;
      if (filter === 'published') return p.status === 'published' || p.status === 'pending_review';
      return true;
    });
  }, [state.projects, q, filter]);

  return (
    <Screen>
      <Kicker>MY STUDIO · PRIVATE</Kicker>
      <Text style={type.h1}>Your projects</Text>
      <Text style={[type.small, { marginTop: 4 }]}>Only you can see these. Nothing is public unless you ask and a moderator approves.</Text>

      <View style={styles.search}>
        <Ionicons name="search" size={18} color="#ab94c8" />
        <TextInput value={q} onChangeText={setQ} placeholder="Search projects" placeholderTextColor={colors.muted2} style={{ flex: 1, color: colors.white }} />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        {(['all', 'drafts', 'ready', 'published', 'family'] as Filter[]).map((f) => (
          <Chip key={f} label={f[0].toUpperCase() + f.slice(1)} selected={filter === f} onPress={() => setFilter(f)} />
        ))}
      </View>

      {items.length === 0 ? (
        <Empty
          icon="film-outline"
          title={state.projects.length ? 'No projects match' : 'Your Studio is empty'}
          body={state.projects.length ? 'Try another filter.' : 'Create your first AI movie, or tap Create My Version on a video you like.'}
          action={!state.projects.length ? <GradientButton label="Create something" icon="add" onPress={() => router.navigate('/create')} /> : undefined}
        />
      ) : (
        <View style={{ gap: 12 }}>
          {items.map((p) => {
            const done = p.jobs.find((j) => j.status === 'completed' && j.outputUrl && j.outputKind === 'image');
            const [label, tone] = STATUS[p.status];
            return (
              <Pressable key={p.id} onPress={() => router.push(`/project/${p.id}`)} style={({ pressed }) => [styles.row, pressed && { borderColor: colors.pink }]}
                accessibilityRole="button" accessibilityLabel={`${p.title}, ${label}`}>
                <Image
                  source={done ? { uri: done.outputUrl } : p.media?.kind === 'image' ? { uri: p.media.uri } : posterSource(themeKey(p))}
                  style={styles.thumb}
                  contentFit="cover"
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.title} numberOfLines={1}>{p.title}</Text>
                  <Text style={type.small} numberOfLines={2}>{p.prompt}</Text>
                  <View style={{ flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                    <Badge label={label} tone={tone} />
                    {p.family ? <Badge label="Family · private" tone="pink" /> : null}
                    {p.remixOf ? <Badge label="Remix" tone="muted" /> : null}
                    <Text style={[type.small, { fontSize: 11 }]}>{new Date(p.updatedAt).toLocaleDateString()}</Text>
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}

      <Pressable onPress={() => openFamilyCreate(dispatch)} style={styles.family} accessibilityRole="button">
        <Ionicons name="home" size={20} color={colors.pink} />
        <Text style={{ color: colors.white, fontWeight: '700', flex: 1 }}>New private Family story</Text>
        <Ionicons name="chevron-forward" size={18} color={colors.muted} />
      </Pressable>
    </Screen>
  );
}

function themeKey(p: Project) {
  const t = p.storyboard?.theme;
  return t === 'castle' || !t ? 'fantasy' : ['hero', 'space', 'santa', 'pirate'].includes(t) ? t : 'fantasy';
}

const styles = StyleSheet.create({
  search: {
    flexDirection: 'row', alignItems: 'center', gap: 8, height: 46, borderRadius: 12, borderWidth: 1, borderColor: '#333447',
    backgroundColor: colors.panel2, paddingHorizontal: 12, marginVertical: 14,
  },
  row: { flexDirection: 'row', gap: 12, padding: 10, borderRadius: 16, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line },
  thumb: { width: 72, height: 104, borderRadius: 10, backgroundColor: '#1a1c2e' },
  title: { color: colors.white, fontWeight: '800', fontSize: 15, marginBottom: 3 },
  family: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 20, padding: 14, borderRadius: 14,
    backgroundColor: '#1a1530', borderWidth: 1, borderColor: '#d58ada2b',
  },
});
