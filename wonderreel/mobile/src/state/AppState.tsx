import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import { supabase } from '../lib/supabase';
import type { Project, RemixTemplate } from '../lib/types';

const KEY = 'wonderreel-state-v1';

export type LocalComment = { id: string; text: string; at: string; status: 'local' | 'pending' | 'approved' };

export type Consents = { terms?: string; privacy?: string; ai?: string; at?: string };

export type State = {
  loaded: boolean;
  onboarded: boolean;
  /** Result of the date-of-birth gate. Only a declaration, not verification. */
  ageStatus: 'unknown' | 'adult' | 'underage';
  consents: Consents;
  projects: Project[];
  likes: string[];
  saves: string[];
  following: string[];
  blocked: string[];
  hidden: string[];
  comments: Record<string, LocalComment[]>;
  family: { setUp: boolean; children: { id: string; nickname: string }[] };
  pendingRemix: RemixTemplate | null;
  pendingFamily: boolean;
  session: Session | null;
};

const initial: State = {
  loaded: false,
  onboarded: false,
  ageStatus: 'unknown',
  consents: {},
  projects: [],
  likes: [],
  saves: [],
  following: [],
  blocked: [],
  hidden: [],
  comments: {},
  family: { setUp: false, children: [] },
  pendingRemix: null,
  pendingFamily: false,
  session: null,
};

type Action =
  | { type: 'load'; state: Partial<State> }
  | { type: 'onboard'; ageStatus: State['ageStatus']; consents: Consents }
  | { type: 'upsertProject'; project: Project }
  | { type: 'deleteProject'; id: string }
  | { type: 'toggle'; list: 'likes' | 'saves' | 'following' | 'blocked' | 'hidden'; id: string; on?: boolean }
  | { type: 'addComment'; postId: string; comment: LocalComment }
  | { type: 'family'; family: State['family'] }
  | { type: 'pendingRemix'; template: RemixTemplate | null }
  | { type: 'pendingFamily'; on: boolean }
  | { type: 'session'; session: Session | null }
  | { type: 'reset' };

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'load':
      return { ...s, ...a.state, loaded: true };
    case 'onboard':
      return { ...s, onboarded: true, ageStatus: a.ageStatus, consents: a.consents };
    case 'upsertProject': {
      const others = s.projects.filter((p) => p.id !== a.project.id);
      return { ...s, projects: [a.project, ...others].sort((x, y) => y.updatedAt.localeCompare(x.updatedAt)) };
    }
    case 'deleteProject':
      return { ...s, projects: s.projects.filter((p) => p.id !== a.id) };
    case 'toggle': {
      const has = s[a.list].includes(a.id);
      const on = a.on ?? !has;
      const list = on ? (has ? s[a.list] : [...s[a.list], a.id]) : s[a.list].filter((x) => x !== a.id);
      return { ...s, [a.list]: list };
    }
    case 'addComment':
      return { ...s, comments: { ...s.comments, [a.postId]: [a.comment, ...(s.comments[a.postId] ?? [])] } };
    case 'family':
      return { ...s, family: a.family };
    case 'pendingRemix':
      return { ...s, pendingRemix: a.template, pendingFamily: a.template ? false : s.pendingFamily };
    case 'pendingFamily':
      return { ...s, pendingFamily: a.on, pendingRemix: a.on ? null : s.pendingRemix };
    case 'session':
      return { ...s, session: a.session };
    case 'reset':
      // Keep the age-gate result so a reset cannot be used to retry the gate.
      return { ...initial, loaded: true, ageStatus: s.ageStatus === 'underage' ? 'underage' : 'unknown' };
  }
}

const PERSISTED: (keyof State)[] = [
  'onboarded', 'ageStatus', 'consents', 'projects', 'likes', 'saves', 'following', 'blocked', 'hidden', 'comments', 'family',
];

type Ctx = { state: State; dispatch: React.Dispatch<Action>; resetAll: () => Promise<void> };
const AppCtx = createContext<Ctx | null>(null);

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        dispatch({ type: 'load', state: raw ? JSON.parse(raw) : {} });
      } catch {
        dispatch({ type: 'load', state: {} });
      }
    })();
  }, []);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => dispatch({ type: 'session', session: data.session }));
    const { data } = supabase.auth.onAuthStateChange((_e, session) => dispatch({ type: 'session', session }));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!state.loaded) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const out: Record<string, unknown> = {};
      for (const k of PERSISTED) out[k] = state[k];
      AsyncStorage.setItem(KEY, JSON.stringify(out)).catch(() => {});
    }, 250);
  }, [state]);

  const resetAll = useCallback(async () => {
    await AsyncStorage.removeItem(KEY);
    dispatch({ type: 'reset' });
  }, []);

  const value = useMemo(() => ({ state, dispatch, resetAll }), [state, resetAll]);
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp() {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error('useApp must be used inside AppStateProvider');
  return ctx;
}

export function newId(prefix = 'p') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
