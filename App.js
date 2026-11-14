// Dead or Alive — padel ball checker
// Expo (React Native) app. Needs a development build, not Expo Go,
// because the microphone streaming library has native code. See README.md.
// Design: "Clean Court" — light and airy, padel-court blue and ball yellow, one colour per verdict.

import React, { useEffect, useRef, useState } from 'react';
import {
  SafeAreaView, View, Text, Pressable, StyleSheet, StatusBar, ScrollView, Animated, Easing,
} from 'react-native';
import { useAudioRecorder } from '@siteed/audio-studio';
import { AudioModule } from 'expo-audio';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { analyzeBounce, pcm16ToFloat32, FIP_MIN_CM, FIP_MAX_CM, THRESHOLDS } from './src/bounceAnalyzer';
import { T } from './src/strings';

const SAMPLE_RATE = 44100;
const CALIBRATION_KEY = 'calibration-v1'; // saved on the phone only
const LISTEN_MS = 4500; // long enough for 4–6 bounces from waist height

// Colour tokens. Change the look of the whole app here.
const C = {
  bg: '#F4F6FA',        // light page
  card: '#FFFFFF',
  line: '#E6EBF2',      // hairlines
  track: '#EEF2F7',     // gauge track
  text: '#0E1B2C',      // headings, numbers
  body: '#33415A',      // normal text
  muted: '#7A879A',
  court: '#1D4FA0',     // padel-court blue
  courtSoft: '#E7EEF9',
  courtLine: 'rgba(255,255,255,0.16)',
  ball: '#F4E541',      // ball yellow
  alive: '#12B76A',
  aliveSoft: '#E3F8EE',
  tired: '#F79009',
  tiredSoft: '#FEF0DC',
  dead: '#F04438',
  deadSoft: '#FDE7E5',
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
  const [reference, setReference] = useState(null); // new-ball calibration: { e, sigma, at }

  // Load the saved calibration when the app opens.
  useEffect(() => {
    AsyncStorage.getItem(CALIBRATION_KEY)
      .then((raw) => {
        const saved = raw && JSON.parse(raw);
        if (saved && typeof saved.e === 'number') setReference(saved);
      })
      .catch(() => {}); // no saved calibration: the app works without one
  }, []);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState(null);
  const [heard, setHeard] = useState(null); // what the microphone delivered, shown on errors

  async function listen(nextMode) {
    setMode(nextMode);
    setError(null);
    setHeard(null);
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
        // 16-bit: the library's float32 stream converts from 16-bit samples on Android.
        encoding: 'pcm_16bit',
        interval: 100, // deliver audio every 100 ms
        streamFormat: 'float32',
        onAudioStream: async (event) => {
          const samples = event && toFloat32(event.data);
          if (samples && samples.length) chunks.current.push(samples);
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

    let loudest = 0;
    for (let i = 0; i < samples.length; i++) loudest = Math.max(loudest, Math.abs(samples[i]));
    const info = { seconds: samples.length / SAMPLE_RATE, loudest };
    setHeard(info);
    if (samples.length < SAMPLE_RATE * 0.5 || loudest === 0) {
      setError(T.errors.noSound);
      setScreen('error');
      return;
    }

    const res = analyzeBounce(
      samples,
      SAMPLE_RATE,
      nextMode === 'test' && reference ? { referenceE: reference.e, referenceSigma: reference.sigma } : {},
    );
    if (!res.ok) {
      setHeard({ ...info, bounces: res.bounces ? res.bounces.length : 0 });
      setError(res.reason === 'no_impacts' ? T.errors.noImpacts : T.errors.tooFew);
      setScreen('error');
      return;
    }
    if (nextMode === 'calibrate') {
      const cal = { e: res.e, sigma: res.eSigma, at: Date.now() };
      setReference(cal);
      AsyncStorage.setItem(CALIBRATION_KEY, JSON.stringify(cal)).catch(() => {});
      setResult({ ...res, calibration: true });
    } else {
      setResult(res);
      setHistory((h) => [{ cm: res.equivalentCm, verdict: res.verdict, at: new Date() }, ...h].slice(0, 10));
    }
    setScreen('result');
  }

  return (
    <SafeAreaView style={s.root}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />
      <ScrollView contentContainerStyle={s.wrap}>
        {screen === 'home' ? (
          <View style={s.block}>
            <Hero calibrated={!!reference} />
            <Steps />
            <BigButton label={T.home.test} onPress={() => listen('test')} />
            <TextButton
              label={reference ? T.home.recalibrate(new Date(reference.at || Date.now())) : T.home.calibrate}
              color={C.court}
              onPress={() => listen('calibrate')}
            />
            {history.length > 0 && <History items={history} />}
          </View>
        ) : (
          <Header calibrated={!!reference} />
        )}

        {screen === 'listening' && <Listening calibrate={mode === 'calibrate'} />}

        {screen === 'result' && result && (
          result.calibration ? (
            <View style={[s.block, s.center]}>
              <IconCircle soft={C.courtSoft} color={C.court} text="✓" />
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
            <IconCircle soft={C.tiredSoft} color={C.tired} text="!" />
            <Text style={[s.title, s.textCenter]}>{T.errors.title}</Text>
            <Text style={[s.p, s.textCenter]}>{error}</Text>
            {heard && <Text style={s.diag}>{T.errors.heard(heard.seconds, heard.loudest, heard.bounces)}</Text>}
            <BigButton label={T.errors.retry} onPress={() => listen(mode)} />
            <TextButton label={T.back} onPress={() => setScreen('home')} />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/** Turns any audio chunk the library may send into Float32 samples in [-1, 1]. */
function toFloat32(data) {
  if (!data) return null;
  if (data instanceof Float32Array) return data;
  if (data instanceof Int16Array) return Float32Array.from(data, (v) => v / 32768);
  if (Array.isArray(data)) return Float32Array.from(data);
  if (typeof data === 'string') {
    // base64-encoded 16-bit PCM
    const bin = global.atob(data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return pcm16ToFloat32(bytes);
  }
  return null;
}

const BrandBall = ({ size = 12 }) => (
  <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: C.ball, borderWidth: 2, borderColor: C.court }} />
);

const CalibratedBadge = ({ onBlue }) => (
  <View style={[s.badge, onBlue && s.badgeOnBlue]}>
    <Text style={[s.badgeText, onBlue && { color: '#fff' }]}>✓ {T.home.calibratedBadge}</Text>
  </View>
);

/** Small header for the screens after home. */
function Header({ calibrated }) {
  return (
    <View style={s.header}>
      <View style={s.brandRow}>
        <BrandBall />
        <Text style={s.brand}>Dead or Alive</Text>
      </View>
      {calibrated && <CalibratedBadge />}
    </View>
  );
}

/** Home hero: a padel-court blue card with faint court lines and a ball. */
function Hero({ calibrated }) {
  return (
    <View style={s.hero}>
      <View style={s.courtOutline} />
      <View style={s.courtCenter} />
      <View style={s.courtService} />
      <View style={s.heroBall} />
      <View style={s.heroTop}>
        <View style={s.brandRow}>
          <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: C.ball }} />
          <Text style={[s.brand, { color: '#fff' }]}>Dead or Alive</Text>
        </View>
        {calibrated && <CalibratedBadge onBlue />}
      </View>
      <Text style={s.heroKicker}>{T.home.kicker}</Text>
      <Text style={s.heroTitle}>{T.home.title}</Text>
    </View>
  );
}

function Steps() {
  return (
    <View style={s.card}>
      {T.home.steps.map((step, i) => (
        <View key={i} style={[s.stepRow, i > 0 && s.divider]}>
          <View style={s.stepNum}><Text style={s.stepNumText}>{i + 1}</Text></View>
          <Text style={s.stepText}>{step}</Text>
        </View>
      ))}
    </View>
  );
}

function Listening({ calibrate }) {
  // A ball that bounces lower and lower, like the real thing, and a ripple on the floor.
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
    <View style={[s.card, s.center, { paddingVertical: 28 }]}>
      <View style={s.stage}>
        <Animated.View
          style={[s.ring, {
            opacity: ring.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }),
            transform: [{ scaleX: ring.interpolate({ inputRange: [0, 1], outputRange: [0.4, 2.2] }) }, { scaleY: 0.25 }],
          }]}
        />
        <View style={s.floor} />
        <Animated.View style={[s.ball, { transform: [{ translateY: y }] }]} />
      </View>
      <Text style={s.kicker}>{T.listening.kicker}</Text>
      <Text style={[s.title, s.textCenter, { marginTop: 6 }]}>{T.listening.title}</Text>
      <Text style={[s.p, s.textCenter, { marginTop: 8 }]}>{calibrate ? T.listening.calibrate : T.listening.test}</Text>
    </View>
  );
}

function Verdict({ result, calibrated, onAgain, onHome }) {
  const color = C[result.verdict];
  const soft = C[result.verdict + 'Soft'];
  const v = T.verdict[result.verdict];
  return (
    <View style={s.block}>
      <View style={[s.card, s.center, { paddingVertical: 28 }]}>
        <View style={[s.verdictCircle, { backgroundColor: soft }]}>
          <View style={[s.verdictDot, { backgroundColor: color }]} />
        </View>
        <Text style={[s.verdictTitle, { color }]}>{v.title}</Text>
        <View style={s.numberRow}>
          <Text style={s.cm}>{Math.round(result.equivalentCm)}</Text>
          <Text style={s.cmUnit}>cm</Text>
        </View>
        <Text style={s.range}>{T.result.range(Math.max(1, Math.round(result.uncertaintyCm)))}</Text>
        <Gauge value={result.equivalentCm} />
        <Text style={[s.small, s.textCenter]}>{T.result.equivalent(FIP_MIN_CM, FIP_MAX_CM)}</Text>
      </View>

      <Text style={[s.advice, s.textCenter]}>{v.advice}</Text>
      {result.confidence !== 'high' && <Note text={T.result.lowConfidence} />}
      {!calibrated && <Note text={T.result.notCalibrated} />}
      <BigButton label={T.result.again} onPress={onAgain} />
      <TextButton label={T.back} onPress={onHome} />
    </View>
  );
}

/** Horizontal scale: DEAD | TIRED | ALIVE zones, the new-ball (FIP) band, and a marker. */
function Gauge({ value }) {
  const frac = (cm) => (Math.min(GAUGE_MAX, Math.max(GAUGE_MIN, cm)) - GAUGE_MIN) / (GAUGE_MAX - GAUGE_MIN);
  const pct = (cm) => `${frac(cm) * 100}%`;
  const span = (from, to) => `${(frac(to) - frac(from)) * 100}%`;
  const zone = (from, to, c) => <View style={[s.zone, { left: pct(from), width: span(from, to), backgroundColor: c }]} />;
  return (
    <View style={s.gauge}>
      <View style={s.track}>
        {zone(GAUGE_MIN, THRESHOLDS.tired, C.dead)}
        {zone(THRESHOLDS.tired, THRESHOLDS.alive, C.tired)}
        {zone(THRESHOLDS.alive, GAUGE_MAX, C.alive)}
      </View>
      <View style={[s.fipBand, { left: pct(FIP_MIN_CM), width: span(FIP_MIN_CM, FIP_MAX_CM) }]} />
      <View style={[s.marker, { left: pct(value) }]} />
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
    <View style={[s.card, { marginTop: 8 }]}>
      <Text style={s.cardTitle}>{T.home.history}</Text>
      {items.map((it, i) => (
        <View key={i} style={[s.histRow, i > 0 && s.divider]}>
          <View style={[s.histDot, { backgroundColor: C[it.verdict + 'Soft'] }]}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: C[it.verdict] }} />
          </View>
          <Text style={s.histCm}>{Math.round(it.cm)}<Text style={s.histUnit}> cm</Text></Text>
          <Text style={[s.histVerdict, { color: C[it.verdict] }]}>{T.verdict[it.verdict].title}</Text>
          <Text style={s.histTime}>{it.at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
        </View>
      ))}
    </View>
  );
}

const IconCircle = ({ soft, color, text }) => (
  <View style={[s.iconCircle, { backgroundColor: soft }]}>
    <Text style={[s.iconText, { color }]}>{text}</Text>
  </View>
);

const Note = ({ text }) => (
  <View style={s.note}>
    <Text style={s.noteIcon}>i</Text>
    <Text style={s.noteText}>{text}</Text>
  </View>
);

const BigButton = ({ label, onPress }) => (
  <Pressable
    onPress={onPress}
    accessibilityRole="button"
    style={({ pressed }) => [s.big, pressed && { transform: [{ scale: 0.98 }], opacity: 0.92 }]}
  >
    <View style={s.bigBall} />
    <Text style={s.bigText}>{label}</Text>
  </Pressable>
);

const TextButton = ({ label, onPress, color = C.muted }) => (
  <Pressable onPress={onPress} style={({ pressed }) => [s.textBtn, pressed && { opacity: 0.6 }]} accessibilityRole="button">
    <Text style={[s.textBtnText, { color }]}>{label}</Text>
  </Pressable>
);

const shadow = {
  shadowColor: '#0E1B2C', shadowOpacity: 0.06, shadowRadius: 18, shadowOffset: { width: 0, height: 6 }, elevation: 2,
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  wrap: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 48 },
  block: { gap: 16 },
  center: { alignItems: 'center' },
  textCenter: { textAlign: 'center' },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, marginBottom: 20, minHeight: 32 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brand: { color: C.court, fontSize: 16, fontWeight: '800' },
  badge: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, backgroundColor: C.courtSoft },
  badgeOnBlue: { backgroundColor: 'rgba(255,255,255,0.16)' },
  badgeText: { color: C.court, fontSize: 12, fontWeight: '700' },

  hero: { backgroundColor: C.court, borderRadius: 24, padding: 22, paddingBottom: 28, overflow: 'hidden', marginTop: 8 },
  courtOutline: { position: 'absolute', top: 12, left: 12, right: 12, bottom: 12, borderWidth: 2, borderColor: C.courtLine, borderRadius: 4 },
  courtCenter: { position: 'absolute', top: 12, bottom: 12, left: '50%', width: 2, backgroundColor: C.courtLine },
  courtService: { position: 'absolute', left: 12, right: 12, top: '62%', height: 2, backgroundColor: C.courtLine },
  heroBall: { position: 'absolute', right: -26, bottom: -26, width: 110, height: 110, borderRadius: 55, backgroundColor: C.ball },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroKicker: { color: C.ball, fontSize: 12, fontWeight: '800', letterSpacing: 1.5, textTransform: 'uppercase', marginTop: 26 },
  heroTitle: { color: '#fff', fontSize: 32, fontWeight: '800', letterSpacing: -0.8, lineHeight: 36, marginTop: 6, marginRight: 70 },

  kicker: { color: C.court, fontSize: 12, fontWeight: '800', letterSpacing: 1.5, textTransform: 'uppercase' },
  title: { color: C.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.6, lineHeight: 33 },
  p: { color: C.body, fontSize: 16, lineHeight: 23 },
  small: { color: C.muted, fontSize: 13, lineHeight: 18, marginTop: 16 },

  card: { backgroundColor: C.card, borderRadius: 22, paddingHorizontal: 18, paddingVertical: 8, ...shadow },
  cardTitle: { color: C.muted, fontSize: 12, fontWeight: '800', letterSpacing: 1.5, textTransform: 'uppercase', marginTop: 10, marginBottom: 4 },
  divider: { borderTopWidth: 1, borderTopColor: C.line },
  stepRow: { flexDirection: 'row', gap: 14, alignItems: 'flex-start', paddingVertical: 14 },
  stepNum: { width: 28, height: 28, borderRadius: 14, backgroundColor: C.courtSoft, alignItems: 'center', justifyContent: 'center' },
  stepNumText: { color: C.court, fontSize: 13, fontWeight: '800' },
  stepText: { color: C.body, fontSize: 16, flex: 1, lineHeight: 23, marginTop: 2 },

  big: {
    backgroundColor: C.court, borderRadius: 18, minHeight: 64, marginTop: 6, alignSelf: 'stretch',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12,
    shadowColor: C.court, shadowOpacity: 0.3, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 5,
  },
  bigBall: { width: 16, height: 16, borderRadius: 8, backgroundColor: C.ball },
  bigText: { color: '#fff', fontSize: 18, fontWeight: '800' },
  textBtn: { paddingVertical: 10, paddingHorizontal: 16, alignItems: 'center', alignSelf: 'center' },
  textBtnText: { fontSize: 15, fontWeight: '700', textAlign: 'center' },

  stage: { width: 220, height: 190, alignItems: 'center', justifyContent: 'flex-end', marginBottom: 18 },
  floor: { width: 170, height: 3, borderRadius: 2, backgroundColor: C.line },
  ring: { position: 'absolute', bottom: -14, width: 120, height: 30, borderRadius: 60, borderWidth: 3, borderColor: C.court },
  ball: { position: 'absolute', bottom: 3, width: 46, height: 46, borderRadius: 23, backgroundColor: C.ball, borderWidth: 3, borderColor: C.court },

  iconCircle: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  iconText: { fontSize: 38, fontWeight: '900' },

  verdictCircle: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  verdictDot: { width: 40, height: 40, borderRadius: 20 },
  verdictTitle: { fontSize: 28, fontWeight: '800', marginTop: 14, letterSpacing: 1 },
  numberRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 4 },
  cm: { color: C.text, fontSize: 80, fontWeight: '800', letterSpacing: -3, lineHeight: 86, fontVariant: ['tabular-nums'] },
  cmUnit: { color: C.muted, fontSize: 22, fontWeight: '700', marginLeft: 4, marginBottom: 14 },
  range: { color: C.muted, fontSize: 15, fontWeight: '600' },

  gauge: { marginTop: 24, height: 58, alignSelf: 'stretch' },
  track: { height: 8, borderRadius: 4, backgroundColor: C.track, overflow: 'hidden' },
  zone: { position: 'absolute', top: 0, bottom: 0 },
  fipBand: { position: 'absolute', top: -5, height: 18, borderWidth: 2, borderColor: C.text, borderRadius: 9, opacity: 0.25 },
  marker: { position: 'absolute', top: -7, width: 22, height: 22, marginLeft: -11, borderRadius: 11, backgroundColor: '#fff', borderWidth: 4, borderColor: C.text },
  ticks: { height: 18, marginTop: 10 },
  tick: { position: 'absolute', width: 40, marginLeft: -20, textAlign: 'center', color: C.muted, fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] },
  fipLabel: { position: 'absolute', top: 38, width: 110, marginLeft: -55, textAlign: 'center', color: C.alive, fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },

  advice: { color: C.text, fontSize: 17, fontWeight: '600', lineHeight: 24, marginTop: 2 },
  note: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: C.courtSoft, borderRadius: 14, padding: 12 },
  noteIcon: { width: 20, height: 20, borderRadius: 10, backgroundColor: C.court, color: '#fff', textAlign: 'center', lineHeight: 20, fontSize: 12, fontWeight: '900', overflow: 'hidden' },
  noteText: { color: C.body, fontSize: 14, lineHeight: 20, flex: 1 },
  diag: { color: C.muted, fontSize: 12, textAlign: 'center', fontVariant: ['tabular-nums'] },

  histRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  histDot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  histCm: { color: C.text, fontSize: 19, fontWeight: '800', width: 72, fontVariant: ['tabular-nums'] },
  histUnit: { color: C.muted, fontSize: 13, fontWeight: '600' },
  histVerdict: { fontSize: 13, fontWeight: '800', letterSpacing: 1, flex: 1 },
  histTime: { color: C.muted, fontSize: 13, fontVariant: ['tabular-nums'] },
});
