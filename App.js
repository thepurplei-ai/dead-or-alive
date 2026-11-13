// Dead or Alive — padel ball checker
// Expo (React Native) app. Needs a development build, not Expo Go,
// because the microphone streaming library has native code. See README.md.

import React, { useRef, useState } from 'react';
import { SafeAreaView, View, Text, Pressable, StyleSheet, StatusBar, ScrollView } from 'react-native';
import { useAudioRecorder } from '@siteed/audio-studio';
import { AudioModule } from 'expo-audio';
import { analyzeBounce, FIP_MIN_CM, FIP_MAX_CM } from './src/bounceAnalyzer';
import { T } from './src/strings';

const SAMPLE_RATE = 44100;
const LISTEN_MS = 4500; // long enough for 4–6 bounces from waist height

const COLORS = {
  bg: '#0F2A3D',        // padel-court blue
  card: '#163A52',
  text: '#F4F7F6',
  muted: '#9DB4C4',
  alive: '#3DDC84',
  tired: '#FFC23C',
  dead: '#FF5A4E',
  ball: '#E6F24A',      // ball yellow
};

export default function App() {
  const { startRecording, stopRecording } = useAudioRecorder();
  const chunks = useRef([]);
  const [screen, setScreen] = useState('home'); // home | listening | result | error
  const [result, setResult] = useState(null);
  const [mode, setMode] = useState('test');     // test | calibrate
  const [referenceE, setReferenceE] = useState(null);
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

    const res = analyzeBounce(samples, SAMPLE_RATE, nextMode === 'test' && referenceE ? { referenceE } : {});
    if (!res.ok) {
      setError(res.reason === 'no_impacts' ? T.errors.noImpacts : T.errors.tooFew);
      setScreen('error');
      return;
    }
    if (nextMode === 'calibrate') {
      setReferenceE(res.e);
      setResult({ ...res, calibration: true });
    } else {
      setResult(res);
      setHistory((h) => [{ cm: res.equivalentCm, verdict: res.verdict, at: new Date() }, ...h].slice(0, 10));
    }
    setScreen('result');
  }

  return (
    <SafeAreaView style={s.root}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={s.wrap}>
        <Text style={s.brand}>DEAD <Text style={{ color: COLORS.ball }}>●</Text> ALIVE</Text>

        {screen === 'home' && (
          <View style={s.block}>
            <Text style={s.h1}>{T.home.title}</Text>
            <Steps />
            <Big label={T.home.test} onPress={() => listen('test')} />
            <Pressable onPress={() => listen('calibrate')} style={s.link}>
              <Text style={s.linkText}>
                {referenceE ? T.home.recalibrate : T.home.calibrate}
              </Text>
            </Pressable>
            {history.length > 0 && <History items={history} />}
          </View>
        )}

        {screen === 'listening' && (
          <View style={[s.block, s.center]}>
            <View style={s.pulse}><Text style={s.pulseBall}>●</Text></View>
            <Text style={s.h1}>{T.listening.title}</Text>
            <Text style={s.p}>{mode === 'calibrate' ? T.listening.calibrate : T.listening.test}</Text>
          </View>
        )}

        {screen === 'result' && result && (
          result.calibration ? (
            <View style={[s.block, s.center]}>
              <Text style={s.h1}>{T.result.calibrated}</Text>
              <Text style={s.p}>{T.result.calibratedText}</Text>
              <Big label={T.home.test} onPress={() => listen('test')} />
              <Back onPress={() => setScreen('home')} />
            </View>
          ) : (
            <Verdict result={result} calibrated={!!referenceE} onAgain={() => listen('test')} onHome={() => setScreen('home')} />
          )
        )}

        {screen === 'error' && (
          <View style={[s.block, s.center]}>
            <Text style={s.h1}>{T.errors.title}</Text>
            <Text style={s.p}>{error}</Text>
            <Big label={T.errors.retry} onPress={() => listen(mode)} />
            <Back onPress={() => setScreen('home')} />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Steps() {
  return (
    <View style={s.card}>
      {T.home.steps.map((step, i) => (
        <View key={i} style={s.stepRow}>
          <Text style={s.stepNum}>{i + 1}</Text>
          <Text style={s.stepText}>{step}</Text>
        </View>
      ))}
    </View>
  );
}

function Verdict({ result, calibrated, onAgain, onHome }) {
  const color = COLORS[result.verdict];
  const v = T.verdict[result.verdict];
  return (
    <View style={[s.block, s.center]}>
      <View style={[s.badge, { borderColor: color }]}>
        <Text style={[s.badgeText, { color }]}>{v.title}</Text>
      </View>
      <Text style={s.cm}>{Math.round(result.equivalentCm)} cm</Text>
      <Text style={s.p}>{T.result.equivalent(FIP_MIN_CM, FIP_MAX_CM)}</Text>
      <Text style={[s.p, { color: COLORS.text }]}>{v.advice}</Text>
      {result.confidence !== 'high' && <Text style={s.note}>{T.result.lowConfidence}</Text>}
      {!calibrated && <Text style={s.note}>{T.result.notCalibrated}</Text>}
      <Big label={T.result.again} onPress={onAgain} />
      <Back onPress={onHome} />
    </View>
  );
}

function History({ items }) {
  return (
    <View style={[s.card, { marginTop: 24 }]}>
      <Text style={s.h2}>{T.home.history}</Text>
      {items.map((it, i) => (
        <View key={i} style={s.histRow}>
          <Text style={[s.dot, { color: COLORS[it.verdict] }]}>●</Text>
          <Text style={s.histText}>{Math.round(it.cm)} cm · {T.verdict[it.verdict].title}</Text>
          <Text style={s.histTime}>{it.at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
        </View>
      ))}
    </View>
  );
}

const Big = ({ label, onPress }) => (
  <Pressable onPress={onPress} style={({ pressed }) => [s.big, pressed && { opacity: 0.85 }]} accessibilityRole="button">
    <Text style={s.bigText}>{label}</Text>
  </Pressable>
);
const Back = ({ onPress }) => (
  <Pressable onPress={onPress} style={s.link} accessibilityRole="button">
    <Text style={s.linkText}>{T.back}</Text>
  </Pressable>
);

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  wrap: { padding: 20, paddingBottom: 48 },
  brand: { color: COLORS.text, fontSize: 15, fontWeight: '800', letterSpacing: 3, marginBottom: 24 },
  block: { gap: 16 },
  center: { alignItems: 'center' },
  h1: { color: COLORS.text, fontSize: 28, fontWeight: '800', textAlign: 'center' },
  h2: { color: COLORS.text, fontSize: 17, fontWeight: '700', marginBottom: 8 },
  p: { color: COLORS.muted, fontSize: 16, textAlign: 'center', lineHeight: 22 },
  note: { color: COLORS.tired, fontSize: 14, textAlign: 'center' },
  card: { backgroundColor: COLORS.card, borderRadius: 16, padding: 16, gap: 12 },
  stepRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  stepNum: { color: COLORS.bg, backgroundColor: COLORS.ball, width: 26, height: 26, borderRadius: 13, textAlign: 'center', lineHeight: 26, fontWeight: '800', overflow: 'hidden' },
  stepText: { color: COLORS.text, fontSize: 16, flex: 1, lineHeight: 22 },
  big: { backgroundColor: COLORS.ball, borderRadius: 999, paddingVertical: 18, paddingHorizontal: 32, alignSelf: 'stretch', alignItems: 'center', marginTop: 8 },
  bigText: { color: COLORS.bg, fontSize: 19, fontWeight: '800' },
  link: { padding: 12, alignItems: 'center' },
  linkText: { color: COLORS.muted, fontSize: 15, textDecorationLine: 'underline' },
  pulse: { width: 140, height: 140, borderRadius: 70, borderWidth: 3, borderColor: COLORS.ball, alignItems: 'center', justifyContent: 'center', marginVertical: 24 },
  pulseBall: { color: COLORS.ball, fontSize: 64 },
  badge: { borderWidth: 4, borderRadius: 999, paddingVertical: 14, paddingHorizontal: 36, marginTop: 12 },
  badgeText: { fontSize: 36, fontWeight: '900', letterSpacing: 2 },
  cm: { color: COLORS.text, fontSize: 56, fontWeight: '900' },
  histRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { fontSize: 16 },
  histText: { color: COLORS.text, fontSize: 15, flex: 1 },
  histTime: { color: COLORS.muted, fontSize: 13 },
});
