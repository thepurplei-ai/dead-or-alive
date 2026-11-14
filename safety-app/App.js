// SafePair — two people, one shared map, SOS with one hold, and a simple chat.
// Expo (React Native). Server: Firebase (anonymous sign-in + Cloud Firestore). See README.md.

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Vibration, Linking, AppState } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { C, S } from './src/theme';
import { T } from './src/strings';
import { isConfigured } from './src/firebaseConfig';
import { partnerOf, shouldSend, directionsUrl } from './src/core';
import Setup from './src/screens/Setup';
import MapTab from './src/screens/MapTab';
import ChatTab from './src/screens/ChatTab';
import SettingsTab from './src/screens/SettingsTab';

// Saved on this phone only.
const KEY = { name: 'name-v1', home: 'home-v1', sharing: 'sharing-v1' };

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <SafeAreaView style={S.screen} edges={['top', 'bottom']}>
        {isConfigured ? <Root /> : <Center text={T.notConfigured} />}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function Center({ text, spinner }) {
  return (
    <View style={[S.screen, { alignItems: 'center', justifyContent: 'center', padding: 30, gap: 14 }]}>
      {spinner && <ActivityIndicator color={C.brand} size="large" />}
      <Text style={[S.body, { textAlign: 'center' }]}>{text}</Text>
    </View>
  );
}

function Root() {
  // backend.js starts Firebase, so load it only once we know it is configured.
  const api = require('./src/backend');
  const [uid, setUid] = useState(null);
  const [pair, setPair] = useState(undefined); // undefined = still loading, null = not paired
  const [name, setName] = useState('');

  useEffect(() => {
    AsyncStorage.getItem(KEY.name).then((n) => n && setName(n)).catch(() => {});
    return api.watchUser((id) => setUid(id));
  }, []);

  useEffect(() => (uid ? api.watchMyPair(uid, setPair) : undefined), [uid]);

  const changeName = (n) => {
    setName(n);
    AsyncStorage.setItem(KEY.name, n).catch(() => {});
  };

  if (!uid || pair === undefined) return <Center text={T.loading} spinner />;
  if (!pair) return <Setup uid={uid} name={name} onName={changeName} />;
  return <Paired api={api} uid={uid} pair={pair} name={name} onName={changeName} />;
}

function Paired({ api, uid, pair, name, onName }) {
  const partnerUid = partnerOf(pair.members, uid);
  const partnerName = pair.names?.[partnerUid] || '…';
  const partnerToken = pair.tokens?.[partnerUid];

  const [tab, setTab] = useState('map');
  const [me, setMe] = useState(null);
  const [locations, setLocations] = useState({});
  const [messages, setMessages] = useState([]);
  const [home, setHome] = useState(null);
  const [sharing, setSharing] = useState(true);
  const [locationDenied, setLocationDenied] = useState(false);
  const [notice, setNotice] = useState(null);
  const [unread, setUnread] = useState(0);
  const lastSent = useRef(null);
  const lastPos = useRef(null);
  const seenMessages = useRef(null);
  const tabRef = useRef(tab);
  tabRef.current = tab;

  const sos = pair.sos || null;
  const mySos = sos?.from === uid;
  const partnerSos = sos && sos.from === partnerUid;

  // Load saved settings, register for push, watch shared data.
  useEffect(() => {
    AsyncStorage.multiGet([KEY.home, KEY.sharing]).then(([[, h], [, sh]]) => {
      if (h) setHome(JSON.parse(h));
      if (sh === 'off') setSharing(false);
    }).catch(() => {});
    require('./src/notify').getPushToken().then((t) => {
      if (t && pair.tokens?.[uid] !== t) api.savePushToken(pair.id, uid, t).catch(() => {});
    });
    // Keep my name in the pair up to date (for example after reinstalling).
    if (name && pair.names?.[uid] !== name) api.saveMyName(pair.id, uid, name).catch(() => {});
    const a = api.watchLocations(pair.id, setLocations);
    const b = api.watchMessages(pair.id, (list) => {
      // Count new messages from the other person while not looking at the chat.
      if (seenMessages.current) {
        const fresh = list.filter((m) => !seenMessages.current.has(m.id) && m.from !== uid);
        if (fresh.length && tabRef.current !== 'chat') setUnread((u) => u + fresh.length);
      }
      seenMessages.current = new Set(list.map((m) => m.id));
      setMessages(list);
    });
    return () => { a(); b(); };
  }, [pair.id]);

  // Share my location while the app is open.
  useEffect(() => {
    if (!sharing) return undefined;
    let sub = null;
    let cancelled = false;
    const send = (p, force) => {
      const now = Date.now();
      if (!force && !shouldSend(lastSent.current, p, now)) return;
      lastSent.current = { ...p, ts: now };
      api.sendLocation(pair.id, uid, p).catch(() => {});
    };
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      if (status !== 'granted') { setLocationDenied(true); return; }
      setLocationDenied(false);
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 5 },
        (l) => {
          const p = { lat: l.coords.latitude, lng: l.coords.longitude, accuracy: l.coords.accuracy };
          lastPos.current = p;
          setMe(p);
          send(p);
        },
      );
      if (cancelled) sub.remove();
    })().catch(() => setLocationDenied(true));
    // Even when standing still, refresh every minute so the other person sees "updated now".
    const timer = setInterval(() => lastPos.current && send(lastPos.current), 15000);
    // Send right away when the app comes back to the front.
    const appSub = AppState.addEventListener('change', (s) => {
      if (s === 'active' && lastPos.current) send(lastPos.current, true);
    });
    return () => { cancelled = true; sub?.remove(); clearInterval(timer); appSub.remove(); };
  }, [sharing, pair.id]);

  // Vibrate hard when the other person sends SOS.
  useEffect(() => {
    if (partnerSos) {
      Vibration.vibrate([0, 700, 300, 700, 300, 700]);
      setTab('map');
    }
  }, [partnerSos, sos?.ts]);

  const flash = (text) => {
    setNotice(text);
    setTimeout(() => setNotice(null), 4000);
  };

  const onSos = async () => {
    Vibration.vibrate(200);
    try {
      await api.startSos(pair.id, uid, lastPos.current);
      require('./src/notify').pushTo(partnerToken, T.sos.alertTitle(name), T.sos.pushBody, true);
    } catch (e) {
      flash(T.offline);
    }
  };

  const onOk = async () => {
    try {
      await api.endSos(pair.id, uid);
      require('./src/notify').pushTo(partnerToken, T.sos.okTitle(name), '', false);
    } catch (e) { flash(T.offline); }
  };

  const onSend = async (text) => {
    try {
      await api.sendMessage(pair.id, uid, text);
      require('./src/notify').pushTo(partnerToken, T.chat.newFrom(name), text, false);
    } catch (e) { flash(T.offline); }
  };

  const onSetHome = (p) => {
    if (!p) { flash(T.map.noHome); return; }
    const h = { lat: p.lat, lng: p.lng };
    setHome(h);
    AsyncStorage.setItem(KEY.home, JSON.stringify(h)).catch(() => {});
    flash(T.map.homeSaved);
  };

  const onSharing = (on) => {
    setSharing(on);
    AsyncStorage.setItem(KEY.sharing, on ? 'on' : 'off').catch(() => {});
  };

  const onSaveName = (n) => {
    onName(n);
    api.saveMyName(pair.id, uid, n).catch(() => flash(T.offline));
  };

  const partnerLoc = locations[partnerUid] || null;
  // While the other person is in SOS, show where they pressed it if we have nothing newer.
  const partnerShown = partnerLoc || (partnerSos && sos.lat != null ? { lat: sos.lat, lng: sos.lng, ts: sos.ts } : null);

  return (
    <View style={{ flex: 1 }}>
      {partnerSos && (
        <View style={st.alert}>
          <Text style={st.alertTitle}>🆘 {T.sos.alertTitle(partnerName)}</Text>
          {partnerShown && (
            <Pressable style={st.alertBtn} onPress={() => Linking.openURL(directionsUrl(partnerShown))}>
              <Text style={{ color: C.sosDark, fontWeight: '800', fontSize: 16 }}>{T.sos.goToThem}</Text>
            </Pressable>
          )}
        </View>
      )}

      <View style={{ flex: 1 }}>
        {tab === 'map' && (
          <MapTab
            me={me} partner={partnerShown} partnerName={partnerName} home={home} onSetHome={(p) => onSetHome(p || null)}
            sharing={sharing} locationDenied={locationDenied} mySos={mySos} onSos={onSos} onOk={onOk} notice={notice}
          />
        )}
        {tab === 'chat' && <ChatTab uid={uid} messages={messages} onSend={onSend} />}
        {tab === 'settings' && (
          <SettingsTab
            sharing={sharing} onSharing={onSharing} name={name} onSaveName={onSaveName}
            partnerName={partnerName} onUnpair={() => api.unpair(pair.id).catch(() => flash(T.offline))}
          />
        )}
      </View>

      <View style={st.tabs}>
        {['map', 'chat', 'settings'].map((k) => (
          <Pressable key={k} style={st.tab} onPress={() => { setTab(k); if (k === 'chat') setUnread(0); }}>
            <Text style={[st.tabText, tab === k && { color: C.brand }]}>
              {T.tabs[k]}{k === 'chat' && unread > 0 ? ` (${unread})` : ''}
            </Text>
            {tab === k && <View style={st.tabLine} />}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  alert: { backgroundColor: C.sos, padding: 14, gap: 10, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  alertTitle: { color: '#fff', fontSize: 18, fontWeight: '800', flex: 1 },
  alertBtn: { backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  tabs: { flexDirection: 'row', borderTopWidth: 1, borderColor: C.line, backgroundColor: C.card },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 14 },
  tabText: { fontSize: 15, fontWeight: '700', color: C.muted },
  tabLine: { position: 'absolute', top: 0, height: 3, width: 40, borderRadius: 2, backgroundColor: C.brand },
});
