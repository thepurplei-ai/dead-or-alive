import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Chip, Empty, Ionicons, Kicker, Screen } from '../../components/ui';
import { posterSource } from '../../data/posters';
import { SAMPLE_POSTS, TEMPLATES } from '../../data/samples';
import { openFamilyCreate, openRemix } from '../../lib/flow';
import { formatCount } from '../../lib/rules';
import { CATEGORIES } from '../../lib/types';
import { useApp } from '../../state/AppState';
import { colors, type } from '../../theme';

export default function Discover() {
  const { state, dispatch } = useApp();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string | null>(null);

  const templates = useMemo(() => {
    const s = q.trim().toLowerCase();
    return TEMPLATES.filter((t) =>
      (!cat || t.category === cat) && (!s || `${t.title} ${t.category} ${t.prompt}`.toLowerCase().includes(s)));
  }, [q, cat]);

  const creators = useMemo(() => {
    const blocked = new Set(state.blocked);
    const map = new Map<string, { handle: string; letter: string; likes: number; videos: number }>();
    for (const p of SAMPLE_POSTS) {
      if (blocked.has(p.handle)) continue;
      if (q && !p.handle.includes(q.toLowerCase())) continue;
      const c = map.get(p.handle) ?? { handle: p.handle, letter: p.avatarLetter, likes: 0, videos: 0 };
      c.likes += p.likeCount;
      c.videos += 1;
      map.set(p.handle, c);
    }
    return [...map.values()].sort((a, b) => b.likes - a.likes);
  }, [q, state.blocked]);

  return (
    <Screen>
      <Kicker>DISCOVER</Kicker>
      <Text style={type.h1}>Find your next <Text style={{ color: colors.pink }}>adventure</Text></Text>
      <View style={styles.search}>
        <Ionicons name="search" size={20} color="#ab94c8" />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search creators, templates, story ideas"
          placeholderTextColor={colors.muted2}
          style={styles.searchInput}
          accessibilityLabel="Search"
          returnKeyType="search"
        />
        {q ? <Pressable onPress={() => setQ('')} accessibilityLabel="Clear search"><Ionicons name="close-circle" size={18} color={colors.muted} /></Pressable> : null}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
        <Chip label="All" selected={!cat} onPress={() => setCat(null)} />
        {CATEGORIES.map((c) => <Chip key={c} label={c} selected={cat === c} onPress={() => setCat(cat === c ? null : c)} />)}
      </ScrollView>

      <Text style={[type.h2, styles.section]}>Trending templates</Text>
      {templates.length ? (
        <View style={styles.grid}>
          {templates.map((t) => (
            <Pressable key={t.templateId} style={styles.card} onPress={() => openRemix(dispatch, t)} accessibilityRole="button"
              accessibilityLabel={`${t.title}. Create my version`}>
              <Image source={posterSource(t.posterKey)} style={StyleSheet.absoluteFill} contentFit="cover" />
              <LinearGradient colors={['transparent', '#080b16ee']} locations={[0.35, 1]} style={StyleSheet.absoluteFill} />
              <View style={styles.cardBody}>
                <View style={styles.tag}><Text style={styles.tagText}>✧ {t.category.toUpperCase()}</Text></View>
                <Text style={styles.cardTitle}>{t.title}</Text>
                <Text style={styles.cardCta}>✦ Create my version ↗</Text>
              </View>
            </Pressable>
          ))}
        </View>
      ) : (
        <Empty icon="search" title="No matches" body='Try "space", "magic" or a category above.' />
      )}

      <Text style={[type.h2, styles.section]}>Creator spotlight</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
        {creators.map((c) => (
          <Pressable key={c.handle} style={styles.creator} onPress={() => router.push(`/creator/${c.handle}`)} accessibilityRole="button">
            <LinearGradient colors={['#e57d9d', '#a383fd']} style={styles.avatar}><Text style={styles.avatarText}>{c.letter}</Text></LinearGradient>
            <Text style={styles.creatorName}>@{c.handle}</Text>
            <Text style={type.small}>{formatCount(c.likes)} likes · {c.videos} videos</Text>
          </Pressable>
        ))}
      </ScrollView>

      <Pressable onPress={() => router.push('/family')} style={styles.family} accessibilityRole="button">
        <Ionicons name="home-outline" size={24} color={colors.pink} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.white, fontWeight: '800', fontSize: 15 }}>Family Mode</Text>
          <Text style={type.small}>Private stories you make for your family. Never public.</Text>
        </View>
        <Pressable onPress={() => openFamilyCreate(dispatch)} hitSlop={8}><Ionicons name="add-circle" size={28} color={colors.pink} /></Pressable>
      </Pressable>
      <Text style={[type.small, { marginTop: 14 }]}>Trending items are WonderReel sample concepts until real approved posts exist.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  search: {
    flexDirection: 'row', alignItems: 'center', gap: 10, height: 50, borderRadius: 14, borderWidth: 1, borderColor: '#333447',
    backgroundColor: colors.panel2, paddingHorizontal: 14, marginVertical: 16,
  },
  searchInput: { flex: 1, color: colors.white, fontSize: 15 },
  section: { marginTop: 24, marginBottom: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: { width: '47.8%', aspectRatio: 0.62, borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: '#17192b' },
  cardBody: { position: 'absolute', left: 12, right: 12, bottom: 12 },
  tag: { backgroundColor: '#ffffff35', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 4, alignSelf: 'flex-start', marginBottom: 6 },
  tagText: { color: '#fff', fontSize: 8, fontWeight: '800', letterSpacing: 1 },
  cardTitle: { color: '#fff', fontWeight: '800', fontSize: 15, lineHeight: 19 },
  cardCta: { color: '#d6cfe4', fontSize: 11, marginTop: 5 },
  creator: { width: 150, padding: 14, borderRadius: 16, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line, alignItems: 'center' },
  avatar: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  avatarText: { color: '#fff', fontWeight: '900', fontSize: 20 },
  creatorName: { color: colors.white, fontWeight: '700', marginBottom: 2 },
  family: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 24, padding: 16, borderRadius: 18,
    backgroundColor: '#1a1530', borderWidth: 1, borderColor: '#d58ada2b',
  },
});
