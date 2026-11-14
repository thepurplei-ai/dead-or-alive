import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Badge, Ionicons, Notice, Screen } from '../../components/ui';
import { SAMPLE_POSTS } from '../../data/samples';
import * as api from '../../lib/api';
import { cloudEnabled } from '../../lib/config';
import { checkComment } from '../../lib/rules';
import { newId, useApp, type LocalComment } from '../../state/AppState';
import { colors, type } from '../../theme';

type Row = { id: string; text: string; handle: string; at: string; status: string };

export default function Comments() {
  const { postId } = useLocalSearchParams<{ postId: string }>();
  const { state, dispatch } = useApp();
  const sample = SAMPLE_POSTS.find((p) => p.id === postId);
  const [rows, setRows] = useState<Row[]>([]);
  const [text, setText] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (sample || !cloudEnabled) return;
    api.fetchComments(postId)
      .then((d) => setRows(d.map((c) => {
        const author = (c as { author?: { handle?: string } | { handle?: string }[] }).author;
        const handle = Array.isArray(author) ? author[0]?.handle : author?.handle;
        return { id: c.id, text: c.body, handle: handle ?? 'creator', at: c.created_at, status: c.moderation_status };
      })))
      .catch((e) => setError((e as Error).message));
  }, [postId, sample]);

  const local: Row[] = (state.comments[postId] ?? []).map((c) => ({ id: c.id, text: c.text, handle: 'you', at: c.at, status: c.status }));
  const all = sample ? local : [...local.filter((l) => !rows.some((r) => r.id === l.id)), ...rows];

  async function send() {
    setError('');
    const c = checkComment(text);
    if (!c.ok) return setError(c.reason);
    const body = text.trim();
    setText('');
    if (sample || !cloudEnabled) {
      dispatch({ type: 'addComment', postId, comment: { id: newId('c'), text: body, at: new Date().toISOString(), status: 'local' } });
      return;
    }
    if (!state.session) return setError('Sign in to comment.');
    try {
      const r = await api.addComment(postId, body);
      const comment: LocalComment = { id: r.id, text: body, at: new Date().toISOString(), status: r.status === 'approved' ? 'approved' : 'pending' };
      if (r.status === 'rejected') return setError('This comment breaks the community rules.');
      dispatch({ type: 'addComment', postId, comment });
    } catch (e) {
      setError((e as Error).message);
      setText(body);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        {sample ? <Notice tone="info">This is a sample concept. Comments here stay on your phone.</Notice> : null}
        {all.length === 0 ? <Text style={[type.body, { textAlign: 'center', marginTop: 30 }]}>No comments yet. Be kind and say something nice.</Text> : null}
        {all.map((c) => (
          <View key={c.id} style={styles.comment}>
            <Text style={{ color: colors.white, fontWeight: '800' }}>@{c.handle}</Text>
            <Text style={[type.body, { marginTop: 2 }]}>{c.text}</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 4, alignItems: 'center' }}>
              <Text style={type.small}>{new Date(c.at).toLocaleString()}</Text>
              {c.status === 'pending' ? <Badge label="Waiting for review" tone="warn" /> : null}
            </View>
          </View>
        ))}
        {error ? <Notice tone="error">{error}</Notice> : null}
      </Screen>
      <View style={styles.bar}>
        <TextInput value={text} onChangeText={setText} placeholder="Add a kind comment…" placeholderTextColor={colors.muted2} style={styles.input} maxLength={600} onSubmitEditing={send} returnKeyType="send" />
        <Pressable onPress={send} style={styles.send} accessibilityLabel="Send comment"><Ionicons name="send" size={18} color="#fff" /></Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  comment: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
  bar: { flexDirection: 'row', gap: 8, padding: 12, paddingBottom: 28, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.panel },
  input: { flex: 1, backgroundColor: colors.panel2, borderRadius: 12, color: colors.white, paddingHorizontal: 12, borderWidth: 1, borderColor: '#333447', minHeight: 44 },
  send: { width: 46, height: 46, borderRadius: 12, backgroundColor: colors.purple, alignItems: 'center', justifyContent: 'center' },
});
