import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, Text, View } from 'react-native';
import { Badge, Card, Chip, Field, GhostButton, GradientButton, Ionicons, Kicker, ListItem, Notice, Row, Screen } from '../components/ui';
import { FAMILY_PROMPTS } from '../data/samples';
import { openFamilyCreate } from '../lib/flow';
import { deletePrivateCopy } from '../lib/mediaStore';
import { newId, useApp } from '../state/AppState';
import { colors, type } from '../theme';

const PIN_KEY = 'wonderreel_family_pin';

async function readPin() {
  if (Platform.OS === 'web') return globalThis.localStorage?.getItem(PIN_KEY) ?? null;
  return SecureStore.getItemAsync(PIN_KEY);
}
async function writePin(pin: string | null) {
  if (Platform.OS === 'web') return pin ? globalThis.localStorage?.setItem(PIN_KEY, pin) : globalThis.localStorage?.removeItem(PIN_KEY);
  return pin ? SecureStore.setItemAsync(PIN_KEY, pin) : SecureStore.deleteItemAsync(PIN_KEY);
}

export default function Family() {
  const { state, dispatch } = useApp();
  const [stored, setStored] = useState<string | null | undefined>(undefined);
  const [unlocked, setUnlocked] = useState(false);
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState('');

  useEffect(() => { readPin().then(setStored).catch(() => setStored(null)); }, []);

  if (state.ageStatus !== 'adult') {
    return <Screen><Notice tone="warn">Family Mode can only be opened by an adult account.</Notice></Screen>;
  }
  if (stored === undefined) return <Screen><Text style={type.body}>Loading…</Text></Screen>;

  if (!stored) {
    return (
      <Screen>
        <Kicker>FAMILY MODE · SET UP</Kicker>
        <Text style={type.h1}>Make private stories for your family</Text>
        <Text style={[type.body, { marginVertical: 10 }]}>
          You stay in control. Family stories are never public, there are no child accounts, no messages and no discovery.
        </Text>
        <Notice tone="warn" icon="shield-checkmark">
          For now, children’s photos and videos are never sent to cloud AI. You can plan and save stories on this phone.
        </Notice>
        <Text style={[type.h2, { marginTop: 14, marginBottom: 10 }]}>Choose a parent PIN</Text>
        <Field label="PIN (4–8 digits)" value={pin} onChangeText={setPin} keyboardType="number-pad" secureTextEntry maxLength={8} />
        <Field label="Repeat PIN" value={pin2} onChangeText={setPin2} keyboardType="number-pad" secureTextEntry maxLength={8} />
        {error ? <Notice tone="error">{error}</Notice> : null}
        <GradientButton label="Turn on Family Mode" icon="lock-closed" onPress={async () => {
          if (!/^\d{4,8}$/.test(pin)) return setError('Use 4 to 8 digits.');
          if (pin !== pin2) return setError('The PINs do not match.');
          await writePin(pin);
          dispatch({ type: 'family', family: { ...state.family, setUp: true } });
          setStored(pin);
          setUnlocked(true);
        }} />
      </Screen>
    );
  }

  if (!unlocked) {
    return (
      <Screen>
        <Ionicons name="lock-closed" size={40} color={colors.pink} style={{ alignSelf: 'center', marginTop: 30 }} />
        <Text style={[type.h1, { textAlign: 'center', marginVertical: 12 }]}>Parent PIN</Text>
        <Field value={pin} onChangeText={setPin} keyboardType="number-pad" secureTextEntry maxLength={8} placeholder="••••" style={{ textAlign: 'center', fontSize: 22 }} />
        {error ? <Notice tone="error">{error}</Notice> : null}
        <GradientButton label="Unlock" onPress={() => { if (pin === stored) { setUnlocked(true); setError(''); } else setError('Wrong PIN.'); setPin(''); }} />
      </Screen>
    );
  }

  const familyProjects = state.projects.filter((p) => p.family);

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <Kicker style={{ marginBottom: 0 }}>FAMILY MODE</Kicker>
        <Badge label="Private · parent controlled" />
      </Row>
      <Text style={[type.h1, { marginTop: 6 }]}>Family stories</Text>

      <Text style={[type.h2, { marginTop: 18, marginBottom: 10 }]}>Guided adventures</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {FAMILY_PROMPTS.map((p) => <Chip key={p.label} label={p.label} icon="sparkles" onPress={() => openFamilyCreate(dispatch)} />)}
      </View>
      <GradientButton label="New family story" icon="add" onPress={() => openFamilyCreate(dispatch)} style={{ marginTop: 14 }} />

      <Text style={[type.h2, { marginTop: 22, marginBottom: 6 }]}>Your family stories</Text>
      {familyProjects.length ? familyProjects.map((p) => (
        <ListItem key={p.id} icon="book-outline" label={p.title} sub={new Date(p.updatedAt).toLocaleDateString()} onPress={() => router.push(`/project/${p.id}`)} />
      )) : <Text style={type.small}>No family stories yet.</Text>}

      <Card style={{ marginTop: 22 }}>
        <Text style={type.h2}>Children (nicknames only)</Text>
        <Text style={[type.small, { marginVertical: 6 }]}>Use a nickname, not a real name. We never ask for a child’s photo, age or school.</Text>
        {state.family.children.map((c) => (
          <Row key={c.id} style={{ justifyContent: 'space-between', paddingVertical: 6 }}>
            <Text style={{ color: colors.white, fontWeight: '700' }}>{c.nickname}</Text>
            <Pressable onPress={() => dispatch({ type: 'family', family: { ...state.family, children: state.family.children.filter((x) => x.id !== c.id) } })}>
              <Text style={{ color: colors.danger }}>Remove</Text>
            </Pressable>
          </Row>
        ))}
        <Row>
          <View style={{ flex: 1 }}><Field placeholder="e.g. Little Star" value={nickname} onChangeText={setNickname} maxLength={20} /></View>
          <GhostButton label="Add" onPress={() => {
            const n = nickname.trim();
            if (!n) return;
            dispatch({ type: 'family', family: { ...state.family, children: [...state.family.children, { id: newId('kid'), nickname: n }] } });
            setNickname('');
          }} style={{ marginBottom: 12 }} />
        </Row>
      </Card>

      <View style={{ gap: 8, marginTop: 18 }}>
        <GhostButton label="Lock Family Mode" icon="lock-closed-outline" onPress={() => router.back()} />
        <GhostButton label="Delete all family data" icon="trash-outline" danger onPress={() => Alert.alert('Delete all family data?', 'All family stories, media and nicknames will be erased from this phone.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: async () => {
            for (const p of familyProjects) { await deletePrivateCopy(p.media); dispatch({ type: 'deleteProject', id: p.id }); }
            dispatch({ type: 'family', family: { setUp: false, children: [] } });
            await writePin(null);
            router.back();
          } },
        ])} />
      </View>
    </Screen>
  );
}
