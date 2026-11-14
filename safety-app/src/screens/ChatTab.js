// Simple chat between the two people. SOS and "I'm OK" also show up here.
import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, FlatList, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { C, S } from '../theme';
import { T } from '../strings';
import { cleanMessage } from '../core';

function time(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function ChatTab({ uid, messages, onSend }) {
  const [text, setText] = useState('');

  const send = () => {
    const t = cleanMessage(text);
    if (!t) return;
    setText('');
    onSend(t);
  };

  const render = ({ item: m }) => {
    const mine = m.from === uid;
    if (m.kind === 'sos' || m.kind === 'ok') {
      const sos = m.kind === 'sos';
      return (
        <View style={[st.event, { backgroundColor: sos ? C.sosSoft : '#E3F8EE' }]}>
          <Text style={{ color: sos ? C.sosDark : C.ok, fontWeight: '700' }}>
            {sos ? '🆘 ' + T.chat.sosMsg : '✅ ' + T.chat.okMsg} · {time(m.ts)}
          </Text>
        </View>
      );
    }
    return (
      <View style={[st.bubble, mine ? st.mine : st.theirs]}>
        <Text style={{ color: mine ? '#fff' : C.text, fontSize: 16 }}>{m.text}</Text>
        <Text style={{ color: mine ? 'rgba(255,255,255,0.75)' : C.muted, fontSize: 11, marginTop: 3, alignSelf: 'flex-end' }}>
          {time(m.ts)}
        </Text>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <FlatList
        data={messages} keyExtractor={(m) => m.id} renderItem={render} inverted
        contentContainerStyle={{ padding: 14, gap: 8, flexGrow: 1 }}
        ListEmptyComponent={<Text style={[S.muted, st.empty]}>{T.chat.empty}</Text>}
      />
      <View style={st.bar}>
        <TextInput
          style={[S.input, { flex: 1, paddingVertical: 10, fontSize: 16 }]} value={text} onChangeText={setText}
          placeholder={T.chat.placeholder} multiline maxLength={500}
        />
        <Pressable style={[S.btn, { paddingHorizontal: 18, paddingVertical: 12 }]} onPress={send}>
          <Text style={S.btnText}>{T.chat.send}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  bubble: { maxWidth: '80%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9 },
  mine: { alignSelf: 'flex-end', backgroundColor: C.brand, borderBottomRightRadius: 4 },
  theirs: { alignSelf: 'flex-start', backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderBottomLeftRadius: 4 },
  event: { alignSelf: 'center', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6 },
  // The list is upside down (newest at the bottom), so flip the empty text back.
  empty: { textAlign: 'center', marginTop: 40, transform: [{ scaleY: -1 }] },
  bar: { flexDirection: 'row', gap: 8, padding: 10, borderTopWidth: 1, borderColor: C.line, backgroundColor: C.bg, alignItems: 'flex-end' },
});
