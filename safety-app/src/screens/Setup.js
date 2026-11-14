// First screen: type your name, then create a code or type the other person's code.
import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { C, S } from '../theme';
import { T } from '../strings';
import { createCode, cancelCode, joinWithCode } from '../backend';

export default function Setup({ uid, name, onName }) {
  const [mode, setMode] = useState('start'); // start | code | join
  const [code, setCode] = useState(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  // If we leave this screen (because the pair was made), the code is no longer needed.
  useEffect(() => () => { if (code) cancelCode(code); }, [code]);

  const needName = () => {
    if (name.trim()) return false;
    setError(T.setup.errors.name);
    return true;
  };

  const onCreate = async () => {
    if (needName()) return;
    setBusy(true); setError(null);
    try {
      setCode(await createCode(uid, name.trim()));
      setMode('code');
    } catch (e) {
      setError(T.setup.errors.network);
    }
    setBusy(false);
  };

  const onJoin = async () => {
    if (needName()) return;
    setBusy(true); setError(null);
    try {
      const r = await joinWithCode(uid, name.trim(), typed);
      if (r !== 'ok') setError(T.setup.errors[r]);
      // On 'ok' the app switches screens by itself when the pair appears.
    } catch (e) {
      setError(T.setup.errors.network);
    }
    setBusy(false);
  };

  const back = () => {
    if (code) cancelCode(code);
    setCode(null); setTyped(''); setError(null); setMode('start');
  };

  return (
    <KeyboardAvoidingView style={S.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[S.pad, { paddingTop: 40, gap: 16 }]} keyboardShouldPersistTaps="handled">
        <Text style={{ fontSize: 15, fontWeight: '700', color: C.brand, letterSpacing: 1 }}>{T.appName.toUpperCase()}</Text>
        <Text style={S.h1}>{T.setup.title}</Text>

        {mode === 'start' && (
          <>
            <Text style={S.body}>{T.setup.intro}</Text>
            <Text style={[S.muted, { marginTop: 8 }]}>{T.setup.nameLabel}</Text>
            <TextInput
              style={S.input} value={name} onChangeText={onName}
              placeholder={T.setup.namePlaceholder} maxLength={30} autoCapitalize="words"
            />
            <Pressable style={S.btn} onPress={onCreate} disabled={busy}>
              <Text style={S.btnText}>{T.setup.create}</Text>
            </Pressable>
            <Pressable style={S.btnGhost} onPress={() => { if (!needName()) { setError(null); setMode('join'); } }} disabled={busy}>
              <Text style={S.btnGhostText}>{T.setup.join}</Text>
            </Pressable>
          </>
        )}

        {mode === 'code' && (
          <View style={[S.card, { alignItems: 'center', gap: 14 }]}>
            <Text style={S.muted}>{T.setup.codeTitle}</Text>
            <Text selectable style={{ fontSize: 44, fontWeight: '800', letterSpacing: 6, color: C.text }}>{code}</Text>
            <Text style={[S.body, { textAlign: 'center' }]}>{T.setup.codeHelp}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <ActivityIndicator color={C.brand} />
              <Text style={S.muted}>{T.setup.waiting}</Text>
            </View>
          </View>
        )}

        {mode === 'join' && (
          <>
            <Text style={S.body}>{T.setup.joinTitle}</Text>
            <TextInput
              style={[S.input, { fontSize: 30, letterSpacing: 6, textAlign: 'center', fontWeight: '800' }]}
              value={typed} onChangeText={setTyped} autoCapitalize="characters" autoCorrect={false}
              maxLength={8} placeholder="ABC123" autoFocus
            />
            <Pressable style={S.btn} onPress={onJoin} disabled={busy}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={S.btnText}>{T.setup.connect}</Text>}
            </Pressable>
          </>
        )}

        {busy && mode === 'start' && <ActivityIndicator color={C.brand} />}
        {error && <Text style={S.error}>{error}</Text>}

        {mode !== 'start' && (
          <Pressable onPress={back} style={{ alignItems: 'center', padding: 12 }}>
            <Text style={S.muted}>{T.setup.cancel}</Text>
          </Pressable>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
