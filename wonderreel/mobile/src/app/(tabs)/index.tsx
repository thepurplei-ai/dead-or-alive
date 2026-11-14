import { useIsFocused } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ReelCard } from '../../components/ReelCard';
import { Ionicons } from '../../components/ui';
import { SAMPLE_POSTS } from '../../data/samples';
import * as api from '../../lib/api';
import { cloudEnabled } from '../../lib/config';
import type { FeedPost } from '../../lib/types';
import { useApp } from '../../state/AppState';
import { useSocial } from '../../state/useSocial';
import { colors } from '../../theme';

type Tab = 'for_you' | 'following';

export default function Home() {
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const { state } = useApp();
  const social = useSocial();
  const [tab, setTab] = useState<Tab>('for_you');
  const [height, setHeight] = useState(0);
  const [active, setActive] = useState(0);
  const [muted, setMuted] = useState(true);
  const [remote, setRemote] = useState<FeedPost[]>([]);
  const [cursor, setCursor] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const list = useRef<FlatList<FeedPost>>(null);

  const load = useCallback(async (reset: boolean) => {
    if (!cloudEnabled) return;
    setLoading(true);
    setError('');
    try {
      const r = await api.fetchFeed(tab, reset ? undefined : cursor);
      setRemote((prev) => {
        const merged = reset ? r.posts : [...prev, ...r.posts];
        const seen = new Set<string>();
        return merged.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
      });
      setCursor(r.next);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [tab, cursor]);

  useEffect(() => {
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const posts = useMemo(() => {
    const hidden = new Set(state.hidden);
    const blocked = new Set(state.blocked);
    // Real approved posts first. Sample concepts are shown (and labelled) only when there are none.
    const base = remote.length ? remote : SAMPLE_POSTS;
    let out = base.filter((p) => !hidden.has(p.id) && !blocked.has(p.handle));
    if (tab === 'following' && !remote.length) out = out.filter((p) => state.following.includes(p.handle));
    return out;
  }, [remote, state.hidden, state.blocked, state.following, tab]);

  const onViewable = useRef(({ viewableItems }: { viewableItems: { index?: number | null; isViewable: boolean }[] }) => {
    const first = viewableItems.find((v) => v.isViewable);
    if (first?.index != null) setActive(first.index);
  }).current;

  return (
    <View style={styles.root} onLayout={(e) => setHeight(e.nativeEvent.layout.height)}>
      {height > 0 && posts.length > 0 ? (
        <FlatList
          ref={list}
          data={posts}
          keyExtractor={(p) => p.id}
          pagingEnabled
          snapToInterval={height}
          decelerationRate="fast"
          showsVerticalScrollIndicator={false}
          onViewableItemsChanged={onViewable}
          viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
          getItemLayout={(_, i) => ({ length: height, offset: height * i, index: i })}
          windowSize={3}
          initialNumToRender={2}
          maxToRenderPerBatch={2}
          onEndReachedThreshold={0.5}
          onEndReached={() => cursor && !loading && load(false)}
          refreshControl={cloudEnabled ? <RefreshControl refreshing={loading} onRefresh={() => load(true)} tintColor={colors.pink} /> : undefined}
          renderItem={({ item, index }) => (
            <ReelCard
              post={item}
              height={height}
              active={focused && index === active}
              muted={muted}
              liked={social.isLiked(item)}
              saved={social.isSaved(item)}
              following={social.isFollowing(item)}
              remixable={social.remixable(item)}
              topInset={insets.top}
              bottomInset={84 + insets.bottom}
              onToggleMute={() => setMuted((m) => !m)}
              onLike={() => social.like(item)}
              onSave={() => social.save(item)}
              onFollow={() => social.follow(item)}
              onShare={() => social.share(item)}
              onMore={() => social.more(item)}
              onRemix={() => social.remix(item)}
            />
          )}
        />
      ) : height > 0 ? (
        <View style={styles.empty}>
          {loading ? <ActivityIndicator color={colors.pink} /> : (
            <>
              <Ionicons name={tab === 'following' ? 'people-outline' : 'film-outline'} size={40} color={colors.pink} />
              <Text style={styles.emptyTitle}>{tab === 'following' ? 'Nobody followed yet' : 'Nothing here yet'}</Text>
              <Text style={styles.emptyBody}>
                {tab === 'following' ? 'Follow creators on For You and their videos will show up here.' : 'Pull down to refresh.'}
              </Text>
            </>
          )}
        </View>
      ) : null}

      <View style={[styles.top, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <View style={styles.tabs}>
          {(['following', 'for_you'] as Tab[]).map((t) => (
            <Pressable key={t} onPress={() => { setTab(t); setActive(0); list.current?.scrollToOffset({ offset: 0, animated: false }); }}
              accessibilityRole="tab" accessibilityState={{ selected: tab === t }} style={styles.tabBtn}>
              <Text style={[styles.tabText, tab === t && styles.tabOn]}>{t === 'for_you' ? 'For You' : 'Following'}</Text>
              {tab === t ? <View style={styles.tabLine} /> : null}
            </Pressable>
          ))}
        </View>
        {error ? <Text style={styles.offline}>Offline — showing what we have. {error}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  top: { position: 'absolute', left: 0, right: 0, top: 0, alignItems: 'center' },
  tabs: { flexDirection: 'row', gap: 22 },
  tabBtn: { alignItems: 'center', paddingVertical: 6 },
  tabText: { color: '#ffffffaa', fontSize: 16, fontWeight: '800', textShadowColor: '#0008', textShadowRadius: 6 },
  tabOn: { color: '#fff' },
  tabLine: { width: 22, height: 3, borderRadius: 2, backgroundColor: colors.pink, marginTop: 4 },
  offline: { color: colors.warning, fontSize: 11, marginTop: 4, backgroundColor: '#0009', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 },
  emptyTitle: { color: colors.white, fontSize: 20, fontWeight: '800', marginTop: 12 },
  emptyBody: { color: colors.muted, textAlign: 'center', marginTop: 6, lineHeight: 20 },
});
