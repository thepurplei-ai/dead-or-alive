import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { posterSource } from '../data/posters';
import { formatCount } from '../lib/rules';
import type { FeedPost } from '../lib/types';
import { colors } from '../theme';
import { GradientButton, Ionicons, type IconName } from './ui';

type Props = {
  post: FeedPost;
  height: number;
  active: boolean;
  muted: boolean;
  liked: boolean;
  saved: boolean;
  following: boolean;
  remixable: boolean;
  topInset: number;
  bottomInset: number;
  onToggleMute: () => void;
  onLike: () => void;
  onSave: () => void;
  onFollow: () => void;
  onShare: () => void;
  onMore: () => void;
  onRemix: () => void;
};

function Video({ uri, active, muted }: { uri: string; active: boolean; muted: boolean }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = muted;
  });
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    player.muted = muted;
  }, [muted, player]);
  useEffect(() => {
    if (active && !paused) player.play();
    else player.pause();
  }, [active, paused, player]);
  return (
    <Pressable style={StyleSheet.absoluteFill} onPress={() => setPaused((p) => !p)} accessibilityLabel={paused ? 'Play video' : 'Pause video'}>
      <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
      {paused ? (
        <View style={styles.pauseIcon}><Ionicons name="play" size={54} color="#ffffffcc" /></View>
      ) : null}
    </Pressable>
  );
}

export function ReelCard(p: Props) {
  const { post } = p;
  return (
    <View style={{ height: p.height, backgroundColor: colors.card }}>
      {post.videoUrl ? (
        <Video uri={post.videoUrl} active={p.active} muted={p.muted} />
      ) : (
        <Image source={posterSource(post.posterKey, post.posterUrl)} style={StyleSheet.absoluteFill} contentFit="cover" transition={200}
          accessibilityLabel={`${post.title} illustration`} />
      )}
      <LinearGradient
        pointerEvents="none"
        colors={['#07091666', 'transparent', 'transparent', '#080b1dcc', '#070918f5']}
        locations={[0, 0.2, 0.45, 0.75, 1]}
        style={StyleSheet.absoluteFill}
      />

      <View style={[styles.labels, { top: p.topInset + 56 }]} pointerEvents="box-none">
        <View style={styles.aiLabel}><Text style={styles.aiText}>✦ AI-GENERATED</Text></View>
        {post.sample ? <View style={styles.aiLabel}><Text style={styles.aiText}>SAMPLE CONCEPT · NOT A REAL VIDEO</Text></View> : null}
        {post.videoUrl ? (
          <Pressable onPress={p.onToggleMute} style={styles.mute} accessibilityLabel={p.muted ? 'Unmute' : 'Mute'}>
            <Ionicons name={p.muted ? 'volume-mute' : 'volume-high'} size={18} color="#fff" />
          </Pressable>
        ) : null}
      </View>

      <View style={[styles.rail, { bottom: p.bottomInset + 150 }]}>
        <RailButton icon={p.liked ? 'heart' : 'heart-outline'} on={p.liked} label={formatCount(post.likeCount + (p.liked ? 1 : 0))} onPress={p.onLike} a11y={p.liked ? 'Unlike' : 'Like'} />
        <RailButton icon="chatbubble-ellipses-outline" label={formatCount(post.commentCount)} onPress={() => router.push(`/comments/${post.id}`)} a11y="Comments" />
        <RailButton icon={p.saved ? 'bookmark' : 'bookmark-outline'} on={p.saved} label={p.saved ? 'Saved' : 'Save'} onPress={p.onSave} a11y={p.saved ? 'Unsave' : 'Save'} />
        <RailButton icon="arrow-redo-outline" label="Share" onPress={p.onShare} a11y="Share" />
        <RailButton icon="ellipsis-horizontal" label="More" onPress={p.onMore} a11y="Report or block" />
      </View>

      <View style={[styles.bottom, { bottom: p.bottomInset + 16 }]}>
        <View style={styles.author}>
          <Pressable onPress={() => router.push(`/creator/${post.handle}`)} style={styles.authorTap} accessibilityLabel={`Open @${post.handle}`}>
            <LinearGradient colors={['#e57d9d', '#a383fd']} style={styles.avatar}><Text style={styles.avatarText}>{post.avatarLetter}</Text></LinearGradient>
            <Text style={styles.handle}>@{post.handle}</Text>
          </Pressable>
          <Pressable onPress={p.onFollow} style={[styles.follow, p.following && { backgroundColor: '#ffffff12' }]} accessibilityRole="button">
            <Text style={styles.followText}>{p.following ? '✓ Following' : '+ Follow'}</Text>
          </Pressable>
        </View>
        <Text style={styles.title} numberOfLines={2}>{post.title}</Text>
        <Text style={styles.caption} numberOfLines={2}>{post.caption}</Text>
        {post.tags.length ? <Text style={styles.tags} numberOfLines={1}>{post.tags.map((t) => '#' + t).join('  ')}</Text> : null}
        {post.remixedFrom ? <Text style={styles.remixed}>↻ Remixed from @{post.remixedFrom.handle}</Text> : null}
        {p.remixable ? (
          <>
            <GradientButton label="Create My Version" icon="sparkles" onPress={p.onRemix} style={{ marginTop: 12 }}
              accessibilityHint="Opens Create with this story template. Nobody's face or voice is copied." />
            <Text style={styles.note}>Uses the story idea only — never the creator’s face or voice</Text>
          </>
        ) : (
          <Text style={[styles.note, { textAlign: 'left', marginTop: 10 }]}>The creator has not allowed remixes of this video</Text>
        )}
      </View>
    </View>
  );
}

function RailButton({ icon, label, onPress, on, a11y }: { icon: IconName; label: string; onPress: () => void; on?: boolean; a11y: string }) {
  return (
    <Pressable onPress={onPress} style={styles.railBtn} accessibilityRole="button" accessibilityLabel={a11y} hitSlop={6}>
      <View style={styles.railIcon}><Ionicons name={icon} size={26} color={on ? '#ff8fbd' : '#f3eefa'} /></View>
      <Text style={styles.railLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  labels: { position: 'absolute', left: 14, right: 14, flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  aiLabel: { borderWidth: 1, borderColor: '#ffffff55', backgroundColor: '#15172699', borderRadius: 6, paddingHorizontal: 9, paddingVertical: 6 },
  aiText: { color: '#fff', fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  mute: { marginLeft: 'auto', width: 34, height: 34, borderRadius: 17, backgroundColor: '#ffffff26', alignItems: 'center', justifyContent: 'center' },
  pauseIcon: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  rail: { position: 'absolute', right: 10, alignItems: 'center', gap: 14 },
  railBtn: { alignItems: 'center', minWidth: 48 },
  railIcon: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#28283caa', alignItems: 'center', justifyContent: 'center' },
  railLabel: { color: '#d8d1e6', fontSize: 11, marginTop: 3, fontWeight: '600' },
  bottom: { position: 'absolute', left: 16, right: 76 },
  author: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  authorTap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  avatar: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#ffffff66' },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  handle: { color: '#fff', fontWeight: '700', fontSize: 13 },
  follow: { borderWidth: 1, borderColor: '#ffffff50', backgroundColor: '#ffffff29', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 5 },
  followText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  title: { color: '#fff', fontSize: 23, fontWeight: '800', letterSpacing: -0.5, lineHeight: 27 },
  caption: { color: '#e6dfef', fontSize: 13, lineHeight: 19, marginTop: 6 },
  tags: { color: colors.tagPink, fontSize: 12, marginTop: 8 },
  remixed: { color: '#d9cee4', fontSize: 12, marginTop: 6, fontWeight: '700' },
  note: { color: '#d9cee4a3', fontSize: 10, textAlign: 'center', marginTop: 7 },
});
