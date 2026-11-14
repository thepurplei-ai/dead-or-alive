// Settings: share location on/off, change name, disconnect.
import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, Switch, Alert, ScrollView } from 'react-native';
import { C, S } from '../theme';
import { T } from '../strings';

export default function SettingsTab({ sharing, onSharing, name, onSaveName, partnerName, onUnpair }) {
  const [draft, setDraft] = useState(name);

  const confirmUnpair = () => Alert.alert(T.settings.unpair, T.settings.unpairConfirm(partnerName), [
    { text: T.settings.no, style: 'cancel' },
    { text: T.settings.yes, style: 'destructive', onPress: onUnpair },
  ]);

  return (
    <ScrollView contentContainerStyle={[S.pad, { gap: 14 }]} keyboardShouldPersistTaps="handled">
      <View style={[S.card, { flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
        <View style={{ flex: 1 }}>
          <Text style={S.h2}>{T.settings.sharing}</Text>
          <Text style={S.muted}>{T.settings.sharingHelp}</Text>
        </View>
        <Switch value={sharing} onValueChange={onSharing} trackColor={{ true: C.brand }} />
      </View>

      <View style={[S.card, { gap: 10 }]}>
        <Text style={S.muted}>{T.settings.name}</Text>
        <TextInput style={S.input} value={draft} onChangeText={setDraft} maxLength={30} autoCapitalize="words" />
        <Pressable
          style={[S.btn, { opacity: draft.trim() && draft.trim() !== name ? 1 : 0.4 }]}
          disabled={!draft.trim() || draft.trim() === name} onPress={() => onSaveName(draft.trim())}
        >
          <Text style={S.btnText}>{T.settings.save}</Text>
        </Pressable>
      </View>

      <View style={[S.card, { gap: 10 }]}>
        <Text style={S.h2}>{T.settings.pairedWith(partnerName)}</Text>
        <Text style={S.muted}>{T.settings.privacy}</Text>
        <Pressable style={[S.btnGhost, { borderColor: C.sos }]} onPress={confirmUnpair}>
          <Text style={[S.btnGhostText, { color: C.sos }]}>{T.settings.unpair}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
