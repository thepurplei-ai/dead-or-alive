import { Link } from 'expo-router';
import React, { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Field, GradientButton, Ionicons, Kicker, Notice, Screen } from '../components/ui';
import { AI_NOTICE_VERSION, PRIVACY_VERSION, TERMS_VERSION } from '../lib/config';
import { ageFrom, isValidDate } from '../lib/rules';
import { useApp } from '../state/AppState';
import { colors, type } from '../theme';

const SLIDES = [
  { icon: 'camera' as const, title: 'Take a photo or video', body: 'Start with your own picture or clip. It stays on your phone until you choose to create.' },
  { icon: 'sparkles' as const, title: 'Tell the AI Director your idea', body: '"Make me a superhero saving a puppy." The Director plans a 4-scene movie you can change by chatting.' },
  { icon: 'repeat' as const, title: 'Watch it. Remix it. Make it yours.', body: 'Tap Create My Version on a video to make your own take on the story — never a copy of someone’s face or voice.' },
];

export default function Onboarding() {
  const { state, dispatch } = useApp();
  const [step, setStep] = useState(0);
  const [dob, setDob] = useState({ y: '', m: '', d: '' });
  const [agree, setAgree] = useState({ terms: false, ai: false });
  const [error, setError] = useState('');
  const underage = state.ageStatus === 'underage';
  // Remembered on the phone so the gate cannot simply be retried with another date.
  const setUnderage = (_: true) => dispatch({ type: 'load', state: { ageStatus: 'underage' } });

  if (underage) {
    return (
      <Screen style={{ flexGrow: 1, justifyContent: 'center' }}>
        <Ionicons name="lock-closed" size={44} color={colors.pink} style={{ alignSelf: 'center' }} />
        <Text style={[type.h1, { textAlign: 'center', marginTop: 16 }]}>WonderReel is for adults</Text>
        <Text style={[type.body, { textAlign: 'center', marginTop: 10 }]}>
          The WonderReel community is only for people aged 18 and over. A parent or guardian can use Family Mode on their own
          account to make private stories with you.
        </Text>
      </Screen>
    );
  }

  if (step < SLIDES.length) {
    const s = SLIDES[step];
    return (
      <Screen style={{ flexGrow: 1 }}>
        <View style={styles.brandRow}>
          <Image source={require('../../assets/brand/favicon.png')} style={{ width: 36, height: 36, borderRadius: 10 }} />
          <Text style={styles.brand}>Wonder<Text style={{ fontWeight: '900' }}>Reel</Text></Text>
        </View>
        <Text style={[type.hero, { marginTop: 36 }]}>
          Imagine it.{'\n'}<Text style={{ color: colors.pink }}>Create it.</Text>{'\n'}Share it.
        </Text>
        <View style={styles.slide}>
          <View style={styles.slideIcon}><Ionicons name={s.icon} size={28} color={colors.pink} /></View>
          <Text style={[type.h2, { marginTop: 14 }]}>{s.title}</Text>
          <Text style={[type.body, { marginTop: 8 }]}>{s.body}</Text>
        </View>
        <View style={styles.dots}>
          {SLIDES.map((_, i) => <View key={i} style={[styles.dot, i === step && styles.dotOn]} />)}
        </View>
        <GradientButton label={step === SLIDES.length - 1 ? 'Get started' : 'Next'} icon="arrow-forward" onPress={() => setStep(step + 1)} />
        <Pressable onPress={() => setStep(SLIDES.length)} style={{ padding: 14, alignSelf: 'center' }} accessibilityRole="button">
          <Text style={{ color: colors.muted, fontWeight: '700' }}>Skip</Text>
        </Pressable>
      </Screen>
    );
  }

  const submit = () => {
    setError('');
    const y = Number(dob.y), m = Number(dob.m), d = Number(dob.d);
    if (!isValidDate(y, m, d) || new Date(y, m - 1, d) > new Date()) return setError('Please enter a real date of birth.');
    if (!agree.terms || !agree.ai) return setError('Please accept the terms and the AI notice to continue.');
    // We keep only the result (adult or not), never the birth date itself, on the phone.
    if (ageFrom({ year: y, month: m, day: d }) < 18) {
      setUnderage(true);
      return;
    }
    const at = new Date().toISOString();
    dispatch({ type: 'onboard', ageStatus: 'adult', consents: { terms: TERMS_VERSION, privacy: PRIVACY_VERSION, ai: AI_NOTICE_VERSION, at } });
  };

  return (
    <Screen>
      <Kicker>BEFORE YOU START</Kicker>
      <Text style={type.h1}>Your date of birth</Text>
      <Text style={[type.body, { marginTop: 6, marginBottom: 16 }]}>
        The WonderReel community is for adults (18+). We only keep whether you are 18 or over.
      </Text>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Field label="DAY" placeholder="DD" keyboardType="number-pad" maxLength={2} value={dob.d} onChangeText={(d) => setDob({ ...dob, d })} style={{ width: 70 }} />
        <Field label="MONTH" placeholder="MM" keyboardType="number-pad" maxLength={2} value={dob.m} onChangeText={(m) => setDob({ ...dob, m })} style={{ width: 70 }} />
        <Field label="YEAR" placeholder="YYYY" keyboardType="number-pad" maxLength={4} value={dob.y} onChangeText={(y) => setDob({ ...dob, y })} style={{ width: 100 }} />
      </View>

      <Check on={agree.terms} onPress={() => setAgree({ ...agree, terms: !agree.terms })}>
        I accept the <Link href="/legal/terms" style={styles.link}>Terms</Link> and <Link href="/legal/privacy" style={styles.link}>Privacy Policy</Link>.
      </Check>
      <Check on={agree.ai} onPress={() => setAgree({ ...agree, ai: !agree.ai })}>
        I understand WonderReel makes AI-generated content. My photos and videos are only sent to AI services when I press
        Generate. <Link href="/legal/ai" style={styles.link}>AI notice</Link>
      </Check>

      {error ? <Notice tone="error">{error}</Notice> : null}
      <GradientButton label="Continue" icon="checkmark" onPress={submit} style={{ marginTop: 12 }} />
      <Notice tone="info">A self-declared age is not verification. Before public launch, WonderReel needs a proper age-assurance service.</Notice>
    </Screen>
  );
}

function Check({ on, onPress, children }: { on: boolean; onPress: () => void; children: React.ReactNode }) {
  return (
    <Pressable onPress={onPress} style={styles.check} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
      <Ionicons name={on ? 'checkbox' : 'square-outline'} size={22} color={on ? colors.pink : colors.muted} />
      <Text style={[type.body, { flex: 1 }]}>{children}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  brand: { color: colors.white, fontSize: 21, fontWeight: '500', letterSpacing: -0.8 },
  slide: { marginTop: 30, backgroundColor: colors.panel, borderRadius: 22, borderWidth: 1, borderColor: colors.line, padding: 22 },
  slideIcon: { width: 54, height: 54, borderRadius: 16, backgroundColor: '#24183a', alignItems: 'center', justifyContent: 'center' },
  dots: { flexDirection: 'row', gap: 6, alignSelf: 'center', marginVertical: 24 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#35324a' },
  dotOn: { width: 22, backgroundColor: colors.pink },
  check: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 10 },
  link: { color: colors.pink, fontWeight: '700' },
});
