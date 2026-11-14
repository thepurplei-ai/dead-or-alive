import { router } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Field, GhostButton, GradientButton, Kicker, Notice, Row, Screen } from '../components/ui';
import * as api from '../lib/api';
import { AI_NOTICE_VERSION, cloudEnabled, PRIVACY_VERSION, TERMS_VERSION } from '../lib/config';
import { isValidDate } from '../lib/rules';
import { supabase } from '../lib/supabase';
import { useApp } from '../state/AppState';
import { colors, type } from '../theme';

type Mode = 'signin' | 'signup' | 'reset';

export default function Auth() {
  const { state } = useApp();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [dob, setDob] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'error' | 'ok' | 'info'; text: string } | null>(null);

  if (!cloudEnabled || !supabase) {
    return (
      <Screen>
        <Notice tone="info">
          Accounts are not connected yet. The app owner needs to add the Supabase project details (see SETUP.md). Until then, everything
          works on this phone without an account.
        </Notice>
      </Screen>
    );
  }

  if (state.session) {
    return (
      <Screen>
        <Kicker>ACCOUNT</Kicker>
        <Text style={type.h1}>Signed in</Text>
        <Text style={[type.body, { marginVertical: 8 }]}>{state.session.user.email}</Text>
        <GhostButton label="Sign out" icon="log-out-outline" onPress={async () => { await supabase!.auth.signOut(); router.back(); }} />
      </Screen>
    );
  }

  async function submit() {
    setMsg(null);
    const e = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return setMsg({ tone: 'error', text: 'Enter a valid email address.' });
    setBusy(true);
    try {
      if (mode === 'reset') {
        const { error } = await supabase!.auth.resetPasswordForEmail(e, { redirectTo: 'wonderreel://reset' });
        if (error) throw error;
        setMsg({ tone: 'ok', text: 'If that account exists, we sent a reset link. Check your email.' });
        return;
      }
      if (password.length < 10) throw new Error('Use a password of at least 10 characters.');
      if (mode === 'signup') {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob.trim());
        if (!m || !isValidDate(+m[1], +m[2], +m[3])) throw new Error('Enter your date of birth as YYYY-MM-DD.');
        const { data, error } = await supabase!.auth.signUp({ email: e, password });
        if (error) throw error;
        if (!data.session) {
          setMsg({ tone: 'ok', text: 'Check your email to confirm your account, then sign in. You will confirm your date of birth after.' });
          return;
        }
        await finishSignUp(dob.trim());
      } else {
        const { error } = await supabase!.auth.signInWithPassword({ email: e, password });
        if (error) throw error;
        const profile = await api.getMyProfile().catch(() => null);
        if (profile && profile.adult_status === 'unknown' && dob) await finishSignUp(dob.trim());
      }
      router.back();
    } catch (err) {
      setMsg({ tone: 'error', text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function finishSignUp(date: string) {
    // The server stores only the eligibility result; it decides, not the phone.
    const status = await api.declareBirthDate(date);
    await api.recordConsent('terms', TERMS_VERSION);
    await api.recordConsent('privacy', PRIVACY_VERSION);
    await api.recordConsent('ai_processing', AI_NOTICE_VERSION);
    if (status === 'underage') {
      await supabase!.auth.signOut();
      throw new Error('WonderReel accounts are only for adults aged 18 and over.');
    }
  }

  return (
    <Screen>
      <Kicker>{mode === 'signup' ? 'CREATE ACCOUNT' : mode === 'reset' ? 'RESET PASSWORD' : 'SIGN IN'}</Kicker>
      <Text style={[type.h1, { marginBottom: 16 }]}>{mode === 'signup' ? 'Join WonderReel' : mode === 'reset' ? 'Forgot your password?' : 'Welcome back'}</Text>
      <Field label="EMAIL" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
      {mode !== 'reset' ? (
        <Field label="PASSWORD" value={password} onChangeText={setPassword} secureTextEntry autoComplete={mode === 'signup' ? 'new-password' : 'password'} />
      ) : null}
      {mode === 'signup' ? (
        <>
          <Field label="DATE OF BIRTH (YYYY-MM-DD)" value={dob} onChangeText={setDob} placeholder="1990-04-21" keyboardType="numbers-and-punctuation" maxLength={10} />
          <Text style={[type.small, { marginBottom: 10 }]}>
            Accounts are for adults (18+). By creating an account you accept the Terms, Privacy Policy and AI notice.
          </Text>
        </>
      ) : null}
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
      <GradientButton label={mode === 'signup' ? 'Create account' : mode === 'reset' ? 'Send reset link' : 'Sign in'} onPress={submit} loading={busy} style={{ marginTop: 6 }} />
      <View style={{ marginTop: 18, gap: 12 }}>
        {mode !== 'signin' ? <Link label="I already have an account" onPress={() => setMode('signin')} /> : null}
        {mode !== 'signup' ? <Link label="Create a new account" onPress={() => setMode('signup')} /> : null}
        {mode !== 'reset' ? <Link label="Forgot password?" onPress={() => setMode('reset')} /> : null}
      </View>
    </Screen>
  );
}

function Link({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Row>
      <Pressable onPress={onPress} accessibilityRole="link"><Text style={{ color: colors.pink, fontWeight: '700' }}>{label}</Text></Pressable>
    </Row>
  );
}
