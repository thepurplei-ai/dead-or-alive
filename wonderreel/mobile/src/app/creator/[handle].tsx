import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { GhostButton, GradientButton, Notice, Row, Screen } from '../../components/ui';
import { posterSource } from '../../data/posters';
import { SAMPLE_POSTS } from '../../data/samples';
import { formatCount } from '../../lib/rules';
import { useApp } from '../../state/AppState';
import { useSocial } from '../../state/useSocial';
import { colors, type } from '../../theme';

export default function Creator() {
  const { handle } = useLocalSearchParams<{ handle: string }>();
  const { state } = useApp();
  const social = useSocial();
  const posts = SAMPLE_POSTS.filter((p) => p.handle === handle);
  const blocked = state.blocked.includes(handle);
  const first = posts[0];

  return (
    <Screen>
      <Stack.Screen options={{ title: `@${handle}` }} />
      <Row style={{ gap: 14 }}>
        <LinearGradient colors={['#e57d9d', '#a383fd']} style={styles.avatar}><Text style={styles.avatarText}>{handle.charAt(0).toUpperCase()}</Text></LinearGradient>
        <View style={{ flex: 1 }}>
          <Text style={type.h1}>@{handle}</Text>
          <Text style={type.small}>{posts.length} videos · {formatCount(posts.reduce((a, p) => a + p.likeCount, 0))} likes</Text>
        </View>
      </Row>
      {first?.sample ? <Notice tone="info">WonderReel sample creator. These are concept illustrations, not real uploads.</Notice> : null}
      {blocked ? (
        <Notice tone="warn">You blocked this creator.</Notice>
      ) : first ? (
        <Row style={{ marginVertical: 14 }}>
          <GradientButton label={social.isFollowing(first) ? 'Following' : 'Follow'} icon={social.isFollowing(first) ? 'checkmark' : 'person-add'} onPress={() => social.follow(first)} style={{ flex: 1 }} small />
          <GhostButton label="Report / block" onPress={() => social.more(first)} style={{ flex: 1 }} />
        </Row>
      ) : null}
      {!blocked ? (
        <View style={styles.grid}>
          {posts.map((p) => (
            <Pressable key={p.id} style={styles.tile} onPress={() => social.remixable(p) ? social.remix(p) : router.navigate('/')} accessibilityLabel={p.title}>
              <Image source={posterSource(p.posterKey, p.posterUrl)} style={StyleSheet.absoluteFill} contentFit="cover" />
              <View style={styles.tileFoot}><Text style={styles.tileText} numberOfLines={2}>{p.title}</Text></View>
            </Pressable>
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  avatar: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '900', fontSize: 28 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { width: '31.9%', aspectRatio: 0.6, borderRadius: 10, overflow: 'hidden', backgroundColor: colors.card },
  tileFoot: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 6, backgroundColor: '#0009' },
  tileText: { color: '#fff', fontSize: 11, fontWeight: '700' },
});
