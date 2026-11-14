import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Badge, Card, GradientButton, Kicker, ListItem, Notice, Row, Screen } from '../../components/ui';
import { SAMPLE_POSTS } from '../../data/samples';
import * as api from '../../lib/api';
import { cloudEnabled } from '../../lib/config';
import { useApp } from '../../state/AppState';
import { colors, type } from '../../theme';

type Profile = Awaited<ReturnType<typeof api.getMyProfile>>;

export default function ProfileTab() {
  const { state } = useApp();
  const [profile, setProfile] = useState<Profile>(null);
  const [credits, setCredits] = useState<number | null>(null);

  useFocusEffect(useCallback(() => {
    if (!cloudEnabled || !state.session) return;
    api.getMyProfile().then(setProfile).catch(() => {});
    api.creditBalance().then(setCredits).catch(() => {});
  }, [state.session]));

  const handle = profile?.handle ?? (state.session ? 'you' : 'guest');
  const published = state.projects.filter((p) => p.status === 'published').length;
  const remixes = state.projects.filter((p) => p.remixOf).length;
  const saved = SAMPLE_POSTS.filter((p) => state.saves.includes(p.id)).length;
  const isModerator = profile?.role === 'moderator' || profile?.role === 'admin';

  return (
    <Screen>
      <Kicker>PROFILE</Kicker>
      <Row style={{ gap: 14 }}>
        <LinearGradient colors={['#ed9d9a', '#a16bd1']} style={styles.avatar}>
          <Text style={styles.avatarText}>{handle.charAt(0).toUpperCase()}</Text>
        </LinearGradient>
        <View style={{ flex: 1 }}>
          <Text style={type.h1}>@{handle}</Text>
          <Text style={type.small}>{profile?.display_name ?? (state.session ? state.session.user.email : 'Not signed in')}</Text>
          {profile?.bio ? <Text style={[type.body, { marginTop: 4 }]}>{profile.bio}</Text> : null}
        </View>
      </Row>

      <View style={styles.stats}>
        <Stat n={state.following.length} label="Following" />
        <Stat n={published} label="Published" />
        <Stat n={remixes} label="Remixes" />
        <Stat n={saved} label="Saved" />
      </View>

      {!cloudEnabled ? (
        <Notice tone="info">
          Offline mode: everything is saved on this phone. Accounts, AI rendering and the public feed turn on when the WonderReel cloud is connected.
        </Notice>
      ) : !state.session ? (
        <Card style={{ marginVertical: 10 }}>
          <Text style={type.h2}>Join WonderReel</Text>
          <Text style={[type.body, { marginVertical: 8 }]}>Sign in to render with AI, keep your Studio in the cloud and share with the community.</Text>
          <GradientButton label="Sign in or create account" icon="log-in" onPress={() => router.push('/auth')} />
        </Card>
      ) : (
        <Card style={{ marginVertical: 10 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={type.h2}>Credits</Text>
            <Text style={{ color: colors.pink, fontWeight: '900', fontSize: 22 }}>{credits ?? '—'}</Text>
          </Row>
          <Text style={[type.small, { marginTop: 4 }]}>Used for AI images and videos. Refunded when a render fails.</Text>
        </Card>
      )}

      <View style={{ marginTop: 8 }}>
        {state.session ? <ListItem icon="person-outline" label="Edit profile" sub="Name, handle, bio" onPress={() => router.push('/settings?section=profile')} /> : null}
        <ListItem icon="wallet-outline" label="Credits & subscription" sub="Balance, history, plans" onPress={() => router.push('/credits')} />
        <ListItem icon="home-outline" label="Family Mode" sub="Private stories for your family" onPress={() => router.push('/family')} right={<Badge label="Private" />} />
        <ListItem icon="shield-checkmark-outline" label="Settings & privacy" sub="Remix preferences, blocked users, data, delete account" onPress={() => router.push('/settings')} />
        <ListItem icon="document-text-outline" label="Terms, privacy & AI notice" onPress={() => router.push('/legal/terms')} />
        {isModerator ? <ListItem icon="hammer-outline" label="Moderation dashboard" sub="Review queue, reports, kill switches" onPress={() => router.push('/admin')} /> : null}
      </View>
    </Screen>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <Text style={{ color: colors.white, fontWeight: '900', fontSize: 20 }}>{n}</Text>
      <Text style={type.small}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '900', fontSize: 28 },
  stats: {
    flexDirection: 'row', marginVertical: 18, paddingVertical: 14, borderRadius: 16, backgroundColor: colors.panel,
    borderWidth: 1, borderColor: colors.line,
  },
});
