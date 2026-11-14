import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, Share, Text, View } from 'react-native';
import { Card, Field, GhostButton, GradientButton, Kicker, ListItem, Notice, Row, Screen } from '../components/ui';
import * as api from '../lib/api';
import { cloudEnabled } from '../lib/config';
import { wipeAllPrivateMedia } from '../lib/mediaStore';
import { LIMITS } from '../lib/rules';
import { supabase } from '../lib/supabase';
import { useApp } from '../state/AppState';
import { colors, type } from '../theme';

export default function Settings() {
  const { section } = useLocalSearchParams<{ section?: string }>();
  const { state, dispatch, resetAll } = useApp();
  const signedIn = cloudEnabled && !!state.session;
  const [handle, setHandle] = useState('');
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!signedIn) return;
    api.getMyProfile().then((p) => { if (p) { setHandle(p.handle ?? ''); setName(p.display_name ?? ''); setBio(p.bio ?? ''); } }).catch(() => {});
  }, [signedIn]);

  async function saveProfile() {
    setMsg(null);
    const h = handle.trim().toLowerCase();
    if (!LIMITS.handle.test(h)) return setMsg({ tone: 'error', text: 'Handles use 3–30 letters, numbers or _.' });
    try {
      await api.updateMyProfile({ handle: h, display_name: name.trim().slice(0, 80) || h, bio: bio.trim().slice(0, 500) });
      setMsg({ tone: 'ok', text: 'Profile saved.' });
    } catch (e) {
      setMsg({ tone: 'error', text: (e as Error).message });
    }
  }

  async function exportData() {
    try {
      const local = { projects: state.projects.map(({ media, ...p }) => ({ ...p, media: media ? { kind: media.kind } : null })), likes: state.likes, saves: state.saves, following: state.following, blocked: state.blocked, consents: state.consents };
      const cloud = signedIn ? await api.exportMyData() : null;
      await Share.share({ message: JSON.stringify({ exportedAt: new Date().toISOString(), local, cloud }, null, 2) });
    } catch (e) {
      Alert.alert('Export failed', (e as Error).message);
    }
  }

  function deleteEverything() {
    Alert.alert(
      'Delete account and all data?',
      signedIn
        ? 'Your account, Studio projects, uploads, posts, comments and likes will be permanently deleted. This cannot be undone.'
        : 'All WonderReel data on this phone will be erased. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete forever', style: 'destructive', onPress: async () => {
            try {
              if (signedIn) {
                await api.deleteAccount();
                await supabase?.auth.signOut();
              }
              await wipeAllPrivateMedia();
              await resetAll();
            } catch (e) {
              Alert.alert('Could not delete', (e as Error).message);
            }
          },
        },
      ],
    );
  }

  return (
    <Screen>
      {signedIn ? (
        <Card style={{ marginBottom: 16, borderColor: section === 'profile' ? colors.pink : colors.line }}>
          <Kicker>PUBLIC PROFILE</Kicker>
          <Field label="HANDLE" value={handle} onChangeText={setHandle} autoCapitalize="none" maxLength={30} />
          <Field label="DISPLAY NAME" value={name} onChangeText={setName} maxLength={80} />
          <Field label="BIO" value={bio} onChangeText={setBio} maxLength={500} multiline />
          {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
          <GradientButton label="Save profile" onPress={saveProfile} small />
        </Card>
      ) : null}

      <Kicker>PRIVACY</Kicker>
      <Text style={[type.body, { marginBottom: 8 }]}>
        Your Studio is private. Your photos and videos only leave the phone when you start an AI render, and never in Family Mode.
        Public videos are checked by a moderator first. There are no direct messages.
      </Text>

      <Kicker style={{ marginTop: 16 }}>BLOCKED CREATORS</Kicker>
      {state.blocked.length ? state.blocked.map((h) => (
        <Row key={h} style={{ justifyContent: 'space-between', paddingVertical: 8 }}>
          <Text style={{ color: colors.white }}>@{h}</Text>
          <Pressable onPress={() => dispatch({ type: 'toggle', list: 'blocked', id: h, on: false })}><Text style={{ color: colors.pink, fontWeight: '700' }}>Unblock</Text></Pressable>
        </Row>
      )) : <Text style={type.small}>Nobody blocked.</Text>}
      {state.hidden.length ? (
        <GhostButton label={`Show ${state.hidden.length} hidden video(s) again`} onPress={() => state.hidden.forEach((id) => dispatch({ type: 'toggle', list: 'hidden', id, on: false }))} style={{ marginTop: 10 }} />
      ) : null}

      <Kicker style={{ marginTop: 22 }}>YOUR DATA</Kicker>
      <ListItem icon="download-outline" label="Export my data" sub="A copy of your projects, likes and settings" onPress={exportData} />
      <ListItem icon="document-text-outline" label="Privacy Policy" onPress={() => router.push('/legal/privacy')} />
      <ListItem icon="sparkles-outline" label="AI notice" onPress={() => router.push('/legal/ai')} />
      <ListItem icon="people-outline" label="Community rules" onPress={() => router.push('/legal/community')} />
      <ListItem icon="trash-outline" label={signedIn ? 'Delete account' : 'Erase all data on this phone'} danger onPress={deleteEverything} />
      <View style={{ height: 10 }} />
      {state.consents.at ? <Text style={type.small}>You accepted the terms (version {state.consents.terms}) on {new Date(state.consents.at).toLocaleDateString()}.</Text> : null}
    </Screen>
  );
}
