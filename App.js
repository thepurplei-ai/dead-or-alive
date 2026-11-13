// Dead or Alive — padel ball checker
// Expo (React Native) app. Needs a development build, not Expo Go,
// because the microphone streaming library has native code. See README.md.
// Design: "Night Court" — near-black court, neon ball-lime accent, one colour per verdict.

import React, { useEffect, useRef, useState } from 'react';
import {
  SafeAreaView, View, Text, Pressable, StyleSheet, StatusBar, ScrollView, Animated, Easing,
} from 'react-native';
import { useAudioRecorder } from '@siteed/audio-studio';
import { AudioModule } from 'expo-audio';
import { analyzeBounce, FIP_MIN_CM, FIP_MAX_CM, THRESHOLDS } from './src/bounceAnalyzer';
import { T } from './src/strings';

const SAMPLE_RATE = 44100;
const LISTEN_MS = 4500; // long enough for 4–6 bounces from waist height

// Colour tokens. Change the look of the whole app here.
const C = {
  bg: '#07090C',        // night court
  surface: '#10151B',   // cards
  surface2: '#18202A',  // raised elements, gauge track
  line: '#243040',      // hairlines
  text: '#F3F6F8',
  muted: '#8593A3',
  lime: '#D7FF3B',      // padel-ball accent
  onLime: '#07090C',
  alive: '#22E5A0',     // mint
  tired: '#FFB020',     // amber
  dead: '#FF4867',      // coral red
};

// Gauge scale (cm, equivalent bounce from 2.54 m)
const GAUGE_MIN = 100;
const GAUGE_MAX = 155;

export default function App() {
  const { startRecording, stopRecording } = useAudioRecorder();
  const chunks = useRef([]);
  const [screen, setScreen] = useState('home'); // home | listening | result | error
  const [result, setResult] = useState(null);
  const [mode, setMode] = useState('test');     // test | calibrate
  const [reference, setReference] = useState(null); // new-ball calibration: { e, sigma }
  const [history, setHistory] = useState([]);
  const [error, setError] = useState(null);

  async function listen(nextMode) {
    setMode(nextMode);
    setError(null);
    const perm = await AudioModule.requestRecordingPermissionsAsync();
    if (!perm.granted) {
      setError(T.errors.permission);
      setScreen('error');
      return;
    }
    chunks.current = [];
    setScreen('listening');
    try {
      await startRecording({
        sampleRate: SAMPLE_RATE,
        channels: 1,
        encoding: 'pcm_32bit',
        streamFormat: 'float32',
        onAudioStream: async (event) => {
          if (event && event.data) chunks.current.push(event.data);
        },
      });
    } catch (e) {
      setError(T.errors.mic);
      setScreen('error');
      return;
    }
    setTimeout(finish, LISTEN_MS, nextMode);
  }

  async function finish(nextMode) {
    try {
      await stopRecording();
    } catch (e) {
      // ignore: we already have the streamed samples
    }
    const total = chunks.current.reduce((n, c) => n + c.length, 0);
    const samples = new Float32Array(total);
    let o = 0;
    for (const c of chunks.current) { samples.set(c, o); o += c.length; }

    const res = analyzeBounce(
      samples,
      SAMPLE_RATE,
      nextMode === 'test' && reference ? { referenceE: reference.e, referenceSigma: reference.sigma } : {},
    );
    if (!res.ok) {
      setError(res.reason === 'no_impacts' ? T.errors.noImpacts : T.errors.tooFew);
      setScreen('error');
      return;
    }
    if (nextMode === 'calibrate') {
      setReference({ e: res.e, sigma: res.eSigma });
      setResult({ ...res, calibration: true });
    } else {
      setResult(res);
      setHistory((h) => [{ cm: res.equivalentCm, verdict: res.verdict, at: new Date() }, ...h].slice(0, 10));
    }
    setScreen('result');
  }

  return (
    <SafeAreaView style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <ScrollView contentContainerStyle={s.wrap}>
        <Header calibrated={!!reference} />

        {screen === 'home' && (
          <View style={s.block}>
            <Text style={s.kicker}>{T.home.kicker}</Text>
            <Text style={s.title}>{T.home.title}</Text>
            <Steps />
            <BigButton label={T.home.test} onPress={() => listen('test')} />
            <Chip
              label={reference ? T.home.recalibrate : T.home.calibrate}
              active={!!reference}
              onPress={() => listen('calibrate')}
            />
            {history.length > 0 && <History items={history} />}
          </View>
        )}

        {screen === 'listening' && <Listening calibrate={mode === 'calibrate'} />}

        {screen === 'result' && result && (
          result.calibration ? (
            <View style={[s.block, s.center]}>
              <View style={[s.iconCircle, { borderColor: C.lime }]}>
                <Text style={[s.iconText, { color: C.lime }]}>✓</Text>
              </View>
              <Text style={[s.title, s.textCenter]}>{T.result.calibrated}</Text>
              <Text style={[s.p, s.textCenter]}>{T.result.calibratedText}</Text>
              <BigButton label={T.home.test} onPress={() => listen('test')} />
              <TextButton label={T.back} onPress={() => setScreen('home')} />
            </View>
          ) : (
            <Verdict
              result={result}
              calibrated={!!reference}
              onAgain={() => listen('test')}
              onHome={() => setScreen('home')}
            />
          )
        )}

        {screen === 'error' && (
          <View style={[s.block, s.center]}>
            <View style={[s.iconCircle, { borderColor: C.tired }]}>
              <Text style={[s.iconText, { color: C.tired }]}>!</Text>
            </View>
            <Text style={[s.title, s.textCenter]}>{T.errors.title}</Text>
            <Text style={[s.p, s.textCenter]}>{error}</Text>
            <BigButton label={T.errors.retry} onPress={() => listen(mode)} />
            <TextButton label={T.back} onPress={() => setScreen('home')} />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Header({ calibrated }) {
  return (
    <View style={s.header}>
      <View style={s.brandRow}>
        <Text style={s.brand}>DEAD</Text>
        <View style={s.brandBall} />
        <Text style={s.brand}>ALIVE</Text>
      </View>
      {calibrated && (
        <View style={s.badgeSmall}>
          <View style={[s.dotSmall, { backgroundColor: C.lime }]} />
          <Text style={s.badgeSmallText}>{T.home.calibratedBadge}</Text>
        </View>
      )}
    </View>
  );
}

function Steps() {
  return (
    <View style={s.card}>
      {T.home.steps.map((step, i) => (
        <View key={i} style={[s.stepRow, i > 0 && s.stepDivider]}>
          <Text style={s.stepNum}>{String(i + 1).padStart(2, '0')}</Text>
          <Text style={s.stepText}>{step}</Text>
        </View>
      ))}
    </View>
  );
}

function Listening({ calibrate }) {
  // A ball that bounces lower and lower, like the real thing, and an expanding ring.
  const y = useRef(new Animated.Value(0)).current;
  const ring = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const hop = (h, ms) => Animated.sequence([
      Animated.timing(y, { toValue: -h, duration: ms, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(y, { toValue: 0, duration: ms, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]);
    const bounce = Animated.loop(Animated.sequence([hop(90, 380), hop(60, 310), hop(36, 240), hop(18, 170), Animated.delay(250)]));
    const pulse = Animated.loop(Animated.timing(ring, { toValue: 1, duration: 1400, easing: Easing.out(Easing.cubic), useNativeDriver: true }));
    bounce.start();
    pulse.start();
    return () => { bounce.stop(); pulse.stop(); };
  }, [y, ring]);

  return (
    <View style={[s.block, s.center]}>
      <View style={s.stage}>
        <Animated.View
          style={[s.ring, {
            opacity: ring.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
            transform: [{ scaleX: ring.interpolate({ inputRange: [0, 1], outputRange: [0.4, 2.2] }) }, { scaleY: 0.25 }],
          }]}
        />
        <View style={s.floor} />
        <Animated.View style={[s.ball, { transform: [{ translateY: y }] }]} />
      </View>
      <Text style={s.kicker}>{T.listening.kicker}</Text>
      <Text style={[s.title, s.textCenter]}>{T.listening.title}</Text>
      <Text style={[s.p, s.textCenter]}>{calibrate ? T.listening.calibrate : T.listening.test}</Text>
    </View>
  );
}

function Verdict({ result, calibrated, onAgain, onHome }) {
  const color = C[result.verdict];
  const v = T.verdict[result.verdict];
  return (
    <View style={s.block}>
      <View style={[s.resultCard, { borderColor: color + '55' }]}>
        <View style={[s.glow, { backgroundColor: color }]} />
        <View style={[s.verdictPill, { backgroundColor: color + '22' }]}>
          <View style={[s.dotSmall, { backgroundColor: color }]} />
          <Text style={[s.verdictPillText, { color }]}>{v.title}</Text>
        </View>
        <View style={s.numberRow}>
          <Text style={s.cm}>{Math.round(result.equivalentCm)}</Text>
          <Text style={s.cmUnit}>cm</Text>
        </View>
        <Text style={s.range}>{T.result.range(Math.max(1, Math.round(result.uncertaintyCm)))}</Text>
        <Gauge value={result.equivalentCm} color={color} />
        <Text style={s.small}>{T.result.equivalent(FIP_MIN_CM, FIP_MAX_CM)}</Text>
      </View>

      <Text style={s.advice}>{v.advice}</Text>
      {result.confidence !== 'high' && <Note text={T.result.lowConfidence} />}
      {!calibrated && <Note text={T.result.notCalibrated} />}
      <BigButton label={T.result.again} onPress={onAgain} />
      <TextButton label={T.back} onPress={onHome} />
    </View>
  );
}

/** Horizontal scale: DEAD | TIRED | ALIVE zones, the new-ball (FIP) band, and a marker. */
function Gauge({ value, color }) {
  const pct = (cm) => `${((Math.min(GAUGE_MAX, Math.max(GAUGE_MIN, cm)) - GAUGE_MIN) / (GAUGE_MAX - GAUGE_MIN)) * 100}%`;
  const zone = (from, to, c) => (
    <View style={[s.zone, { left: pct(from), width: `${((to - from) / (GAUGE_MAX - GAUGE_MIN)) * 100}%`, backgroundColor: c + '40' }]} />
  );
  return (
    <View style={s.gauge}>
      <View style={s.track}>
        {zone(GAUGE_MIN, THRESHOLDS.tired, C.dead)}
        {zone(THRESHOLDS.tired, THRESHOLDS.alive, C.tired)}
        {zone(THRESHOLDS.alive, GAUGE_MAX, C.alive)}
        <View style={[s.fipBand, { left: pct(FIP_MIN_CM), width: pct(GAUGE_MIN + FIP_MAX_CM - FIP_MIN_CM) }]} />
      </View>
      <View style={[s.marker, { left: pct(value), borderColor: color }]} />
      <View style={s.ticks}>
        {[THRESHOLDS.tired, FIP_MIN_CM, FIP_MAX_CM].map((t) => (
          <Text key={t} style={[s.tick, { left: pct(t) }]}>{t}</Text>
        ))}
      </View>
      <Text style={[s.fipLabel, { left: pct((FIP_MIN_CM + FIP_MAX_CM) / 2) }]}>{T.result.newBall}</Text>
    </View>
  );
}

function History({ items }) {
  return (
    <View style={[s.card, { marginTop: 12 }]}>
      <Text style={s.cardTitle}>{T.home.history}</Text>
      {items.map((it, i) => (
        <View key={i} style={[s.histRow, i > 0 && s.stepDivider]}>
          <View style={[s.histBar, { backgroundColor: C[it.verdict] }]} />
          <Text style={s.histCm}>{Math.round(it.cm)}<Text style={s.histUnit}> cm</Text></Text>
          <Text style={[s.histVerdict, { color: C[it.verdict] }]}>{T.verdict[it.verdict].title}</Text>
          <Text style={s.histTime}>{it.at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
        </View>
      ))}
    </View>
  );
}

const Note = ({ text }) => (
  <View style={s.note}>
    <View style={[s.dotSmall, { backgroundColor: C.tired, marginTop: 7 }]} />
    <Text style={s.noteText}>{text}</Text>
  </View>
);

const BigButton = ({ label, onPress }) => (
  <Pressable
    onPress={onPress}
    accessibilityRole="button"
    style={({ pressed }) => [s.big, pressed && { transform: [{ scale: 0.98 }], opacity: 0.9 }]}
  >
    <Text style={s.bigText}>{label}</Text>
    <View style={s.bigArrow}><Text style={s.bigArrowText}>→</Text></View>
  </Pressable>
);

const Chip = ({ label, onPress, active }) => (
  <Pressable
    onPress={onPress}
    accessibilityRole="button"
    style={({ pressed }) => [s.chip, active && { borderColor: C.lime + '66' }, pressed && { opacity: 0.7 }]}
  >
    <Text style={[s.chipText, active && { color: C.lime }]}>{label}</Text>
  </Pressable>
);

const TextButton = ({ label, onPress }) => (
  <Pressable onPress={onPress} style={s.textBtn} accessibilityRole="button">
    <Text style={s.textBtnText}>{label}</Text>
  </Pressable>
);

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  wrap: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 48 },
  block: { gap: 16 },
  center: { alignItems: 'center' },
  textCenter: { textAlign: 'center' },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28, marginTop: 8, minHeight: 34 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brand: { color: C.text, fontSize: 14, fontWeight: '900', letterSpacing: 3 },
  brandBall: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.lime },
  badgeSmall: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line },
  badgeSmallText: { color: C.text, fontSize: 12, fontWeight: '700' },
  dotSmall: { width: 8, height: 8, borderRadius: 4 },

  kicker: { color: C.lime, fontSize: 12, fontWeight: '800', letterSpacing: 2, textTransform: 'uppercase' },
  title: { color: C.text, fontSize: 34, fontWeight: '900', letterSpacing: -0.8, lineHeight: 38 },
  p: { color: C.muted, fontSize: 16, lineHeight: 23 },
  small: { color: C.muted, fontSize: 13, lineHeight: 18, marginTop: 18 },

  card: { backgroundColor: C.surface, borderRadius: 24, padding: 18, borderWidth: 1, borderColor: C.line },
  cardTitle: { color: C.muted, fontSize: 12, fontWeight: '800', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 },
  stepRow: { flexDirection: 'row', gap: 14, alignItems: 'flex-start', paddingVertical: 12 },
  stepDivider: { borderTopWidth: 1, borderTopColor: C.line },
  stepNum: { color: C.lime, fontSize: 13, fontWeight: '900', width: 22, marginTop: 2, fontVariant: ['tabular-nums'] },
  stepText: { color: C.text, fontSize: 16, flex: 1, lineHeight: 23 },

  big: {
    backgroundColor: C.lime, borderRadius: 999, paddingVertical: 8, paddingLeft: 28, paddingRight: 8, marginTop: 8,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', alignSelf: 'stretch', minHeight: 68,
    shadowColor: C.lime, shadowOpacity: 0.35, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 6,
  },
  bigText: { color: C.onLime, fontSize: 19, fontWeight: '900', letterSpacing: -0.2 },
  bigArrow: { width: 52, height: 52, borderRadius: 26, backgroundColor: C.onLime, alignItems: 'center', justifyContent: 'center' },
  bigArrowText: { color: C.lime, fontSize: 22, fontWeight: '900' },

  chip: { alignSelf: 'center', paddingVertical: 12, paddingHorizontal: 18, borderRadius: 999, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface },
  chipText: { color: C.muted, fontSize: 14, fontWeight: '700', textAlign: 'center' },
  textBtn: { padding: 12, alignItems: 'center', alignSelf: 'center' },
  textBtnText: { color: C.muted, fontSize: 15, fontWeight: '700' },

  stage: { width: 220, height: 200, alignItems: 'center', justifyContent: 'flex-end', marginTop: 24, marginBottom: 8 },
  floor: { width: 160, height: 2, borderRadius: 1, backgroundColor: C.line },
  ring: { position: 'absolute', bottom: -14, width: 120, height: 30, borderRadius: 60, borderWidth: 2, borderColor: C.lime },
  ball: {
    position: 'absolute', bottom: 2, width: 44, height: 44, borderRadius: 22, backgroundColor: C.lime,
    shadowColor: C.lime, shadowOpacity: 0.6, shadowRadius: 18, shadowOffset: { width: 0, height: 0 }, elevation: 8,
  },

  iconCircle: { width: 84, height: 84, borderRadius: 42, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  iconText: { fontSize: 36, fontWeight: '900' },

  resultCard: { backgroundColor: C.surface, borderRadius: 28, padding: 22, paddingTop: 20, borderWidth: 1, overflow: 'hidden' },
  glow: { position: 'absolute', top: -150, right: -110, width: 280, height: 280, borderRadius: 140, opacity: 0.09 },
  verdictPill: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999 },
  verdictPillText: { fontSize: 18, fontWeight: '900', letterSpacing: 3 },
  numberRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 14 },
  cm: { color: C.text, fontSize: 96, fontWeight: '900', letterSpacing: -4, lineHeight: 100, fontVariant: ['tabular-nums'] },
  cmUnit: { color: C.muted, fontSize: 24, fontWeight: '800', marginLeft: 6, marginBottom: 16 },
  range: { color: C.muted, fontSize: 16, fontWeight: '700', marginTop: -2 },

  gauge: { marginTop: 26, height: 58 },
  track: { height: 12, borderRadius: 6, backgroundColor: C.surface2, overflow: 'hidden' },
  zone: { position: 'absolute', top: 0, bottom: 0 },
  fipBand: { position: 'absolute', top: 0, bottom: 0, borderWidth: 2, borderColor: C.alive, borderRadius: 6 },
  marker: { position: 'absolute', top: -6, width: 24, height: 24, marginLeft: -12, borderRadius: 12, backgroundColor: C.text, borderWidth: 5 },
  ticks: { height: 18, marginTop: 8 },
  tick: { position: 'absolute', width: 40, marginLeft: -20, textAlign: 'center', color: C.muted, fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
  fipLabel: { position: 'absolute', top: 40, width: 100, marginLeft: -50, textAlign: 'center', color: C.alive, fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },

  advice: { color: C.text, fontSize: 18, fontWeight: '700', lineHeight: 25, marginTop: 4 },
  note: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  noteText: { color: C.muted, fontSize: 14, lineHeight: 20, flex: 1 },

  histRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  histBar: { width: 4, height: 28, borderRadius: 2 },
  histCm: { color: C.text, fontSize: 20, fontWeight: '900', width: 72, fontVariant: ['tabular-nums'] },
  histUnit: { color: C.muted, fontSize: 13, fontWeight: '700' },
  histVerdict: { fontSize: 13, fontWeight: '900', letterSpacing: 1.5, flex: 1 },
  histTime: { color: C.muted, fontSize: 13, fontVariant: ['tabular-nums'] },
});
