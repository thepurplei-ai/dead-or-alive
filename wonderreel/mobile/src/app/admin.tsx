import { Image } from 'expo-image';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, RefreshControl, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { Badge, Card, Chip, Empty, GhostButton, GradientButton, Kicker, Notice, Row } from '../components/ui';
import * as api from '../lib/api';
import { cloudEnabled } from '../lib/config';
import { colors, type } from '../theme';

type Item = Awaited<ReturnType<typeof api.moderationQueue>>[number];

const FLAGS: [string, string][] = [
  ['generation_enabled', 'AI generation'],
  ['publishing_enabled', 'Public publishing'],
  ['comments_enabled', 'Comments'],
  ['family_cloud_enabled', 'Family cloud processing (keep OFF)'],
];

// Access is enforced by the server: admin_queue / admin_decide reject non-moderators.
export default function Admin() {
  const [items, setItems] = useState<Item[]>([]);
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState<'all' | Item['kind']>('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!cloudEnabled) return;
    setLoading(true);
    setError('');
    try {
      const [q, f] = await Promise.all([api.moderationQueue(), api.getFlags()]);
      setItems(q);
      setFlags(f);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function decide(it: Item, decision: 'approve' | 'reject' | 'takedown' | 'dismiss') {
    try {
      await api.moderationDecide(it.kind, it.id, decision, notes[it.id] ?? '');
      setItems((xs) => xs.filter((x) => !(x.id === it.id && x.kind === it.kind)));
    } catch (e) {
      Alert.alert('Failed', (e as Error).message);
    }
  }

  async function toggleFlag(key: string, value: boolean) {
    if (key === 'family_cloud_enabled' && value) {
      return Alert.alert('Blocked', 'Family cloud processing stays off until parental consent, provider approval and legal review are complete.');
    }
    try {
      await api.setFlag(key, value);
      setFlags((f) => ({ ...f, [key]: value }));
    } catch (e) {
      Alert.alert('Failed', (e as Error).message);
    }
  }

  if (!cloudEnabled) return <View style={{ flex: 1, backgroundColor: colors.bg, padding: 16 }}><Notice>Moderation needs the cloud to be connected.</Notice></View>;

  const shown = items.filter((i) => filter === 'all' || i.kind === filter);
  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.pink} />}>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <Kicker>KILL SWITCHES</Kicker>
      <Card>
        {FLAGS.map(([k, label]) => (
          <Row key={k} style={{ justifyContent: 'space-between', paddingVertical: 6 }}>
            <Text style={{ color: colors.white, flex: 1 }}>{label}</Text>
            <Switch value={!!flags[k]} onValueChange={(v) => toggleFlag(k, v)} trackColor={{ true: colors.purple }} />
          </Row>
        ))}
      </Card>

      <Kicker style={{ marginTop: 20 }}>REVIEW QUEUE · {items.length}</Kicker>
      <Row style={{ marginBottom: 10, flexWrap: 'wrap' }}>
        {(['all', 'post', 'comment', 'report'] as const).map((f) => <Chip key={f} label={f} selected={filter === f} onPress={() => setFilter(f)} />)}
      </Row>
      {shown.length === 0 ? <Empty icon="checkmark-done" title="All clear" body="Nothing waiting for review." /> : null}
      {shown.map((it) => (
        <Card key={it.kind + it.id} style={{ marginBottom: 12 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Badge label={it.kind} tone={it.kind === 'report' ? 'error' : 'warn'} />
            <Text style={type.small}>{new Date(it.created_at).toLocaleString()}</Text>
          </Row>
          <Text style={[type.h2, { marginTop: 8 }]}>{it.title}</Text>
          <Text style={type.small}>@{it.handle}</Text>
          <Text style={[type.body, { marginTop: 6 }]}>{it.body}</Text>
          {it.preview_url ? <Image source={{ uri: it.preview_url }} style={{ height: 260, borderRadius: 10, marginTop: 10 }} contentFit="contain" /> : null}
          <TextInput placeholder="Note for audit log" placeholderTextColor={colors.muted2} value={notes[it.id] ?? ''} onChangeText={(t) => setNotes({ ...notes, [it.id]: t })}
            style={{ marginTop: 10, color: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: 10 }} />
          <Row style={{ marginTop: 10 }}>
            {it.kind === 'report' ? (
              <>
                <GradientButton label="Take down" small onPress={() => decide(it, 'takedown')} style={{ flex: 1 }} />
                <GhostButton label="Dismiss" onPress={() => decide(it, 'dismiss')} style={{ flex: 1 }} />
              </>
            ) : (
              <>
                <GradientButton label="Approve" small onPress={() => decide(it, 'approve')} style={{ flex: 1 }} />
                <GhostButton label="Reject" danger onPress={() => decide(it, 'reject')} style={{ flex: 1 }} />
              </>
            )}
          </Row>
        </Card>
      ))}
    </ScrollView>
  );
}
