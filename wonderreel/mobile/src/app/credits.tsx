import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Card, Kicker, Notice, Row, Screen } from '../components/ui';
import * as api from '../lib/api';
import { cloudEnabled } from '../lib/config';
import { CREDIT_COST } from '../lib/rules';
import { useApp } from '../state/AppState';
import { colors, type } from '../theme';

type Entry = { id: string; delta: number; kind: string; reason: string | null; created_at: string };

export default function Credits() {
  const { state } = useApp();
  const [balance, setBalance] = useState<number | null>(null);
  const [history, setHistory] = useState<Entry[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!cloudEnabled || !state.session) return;
    Promise.all([api.creditBalance(), api.creditHistory()])
      .then(([b, h]) => { setBalance(b); setHistory(h as Entry[]); })
      .catch((e) => setError((e as Error).message));
  }, [state.session]);

  return (
    <Screen>
      <Kicker>CREDITS</Kicker>
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text style={type.h2}>Balance</Text>
          <Text style={{ color: colors.pink, fontSize: 28, fontWeight: '900' }}>{balance ?? '—'}</Text>
        </Row>
        <Text style={[type.small, { marginTop: 6 }]}>New accounts get a free starter allowance. Credits are reserved when a render starts and refunded if it fails or is cancelled.</Text>
      </Card>

      <Text style={[type.h2, { marginTop: 18, marginBottom: 8 }]}>What things cost</Text>
      <Card>
        {Object.entries(CREDIT_COST).map(([k, v]) => (
          <Row key={k} style={{ justifyContent: 'space-between', paddingVertical: 6 }}>
            <Text style={{ color: colors.white }}>{k.replace(/_/g, ' ')}</Text>
            <Text style={{ color: colors.muted }}>{v} credit{v > 1 ? 's' : ''}</Text>
          </Row>
        ))}
        <Text style={[type.small, { marginTop: 6 }]}>Estimates. The server sets the final cost and shows it in your history.</Text>
      </Card>

      <Text style={[type.h2, { marginTop: 18, marginBottom: 8 }]}>Plans</Text>
      <Notice tone="info">
        Buying credits and subscriptions uses Google Play Billing (and Apple In-App Purchase on iPhone). It is not switched on yet: prices
        will be set after measuring real AI costs, and the Play Console products must be created first.
      </Notice>

      <Text style={[type.h2, { marginTop: 18, marginBottom: 8 }]}>History</Text>
      {!cloudEnabled || !state.session ? <Text style={type.small}>Sign in to see your history.</Text> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      {history.map((h) => (
        <View key={h.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.line }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.white }}>{h.reason ?? h.kind}</Text>
            <Text style={type.small}>{new Date(h.created_at).toLocaleString()} · {h.kind}</Text>
          </View>
          <Text style={{ color: h.delta >= 0 ? colors.success : colors.white, fontWeight: '800' }}>{h.delta > 0 ? '+' : ''}{h.delta}</Text>
        </View>
      ))}
    </Screen>
  );
}
