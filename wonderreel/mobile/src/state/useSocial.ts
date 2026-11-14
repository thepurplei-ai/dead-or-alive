import { router } from 'expo-router';
import { Alert, Share } from 'react-native';
import * as api from '../lib/api';
import { cloudEnabled } from '../lib/config';
import { openRemix } from '../lib/flow';
import { canRemix, toRemixTemplate } from '../lib/rules';
import type { FeedPost } from '../lib/types';
import { useApp } from './AppState';

const REPORT_REASONS = [
  ['minor', 'Shows a child or minor'],
  ['likeness', 'Uses my face, voice or likeness without permission'],
  ['sexual', 'Sexual or nude content'],
  ['violence', 'Violence or dangerous acts'],
  ['harassment', 'Harassment or hate'],
  ['copyright', 'Copyright or trademark'],
  ['spam', 'Spam or scam'],
] as const;

/**
 * Social actions with an optimistic local update. For real cloud posts the server
 * is the source of truth (RLS checks every write); sample concepts stay local.
 */
export function useSocial() {
  const { state, dispatch } = useApp();
  const signedIn = !!state.session;
  const remote = (p: FeedPost) => cloudEnabled && !p.sample;

  function needAccount(): boolean {
    if (cloudEnabled && !signedIn) {
      router.push('/auth');
      return true;
    }
    return false;
  }

  async function sync(fn: () => Promise<unknown>, undo: () => void) {
    try {
      await fn();
    } catch (e) {
      undo();
      Alert.alert('Not saved', (e as Error).message);
    }
  }

  function report(p: FeedPost) {
      if (remote(p) && needAccount()) return;
      Alert.alert('Report video', 'Why are you reporting it? Our moderators review every report.', [
        ...REPORT_REASONS.map(([code, label]) => ({
          text: label,
          onPress: () => {
            dispatch({ type: 'toggle', list: 'hidden', id: p.id, on: true });
            if (remote(p)) sync(() => api.reportPost(p.id, code, label), () => {});
            Alert.alert('Thanks for reporting', 'We hid this video for you. A moderator will review it.');
          },
        })),
        { text: 'Cancel', style: 'cancel' as const },
      ]);
  }

  function block(p: FeedPost) {
      if (remote(p) && needAccount()) return;
      dispatch({ type: 'toggle', list: 'blocked', id: p.handle, on: true });
      dispatch({ type: 'toggle', list: 'following', id: p.handle, on: false });
      if (remote(p) && p.creatorId) sync(() => api.blockUser(p.creatorId!), () => {});
      Alert.alert('Blocked', `You will no longer see videos from @${p.handle}. You can unblock in Settings.`);
    }

  return {
    blockedSet: new Set(state.blocked),
    isLiked: (p: FeedPost) => state.likes.includes(p.id),
    isSaved: (p: FeedPost) => state.saves.includes(p.id),
    isFollowing: (p: FeedPost) => state.following.includes(p.handle),
    remixable: (p: FeedPost) => canRemix(p, new Set(state.blocked)),

    like(p: FeedPost) {
      if (remote(p) && needAccount()) return;
      const on = !state.likes.includes(p.id);
      dispatch({ type: 'toggle', list: 'likes', id: p.id, on });
      if (remote(p)) sync(() => api.setLike(p.id, on), () => dispatch({ type: 'toggle', list: 'likes', id: p.id, on: !on }));
    },
    save(p: FeedPost) {
      if (remote(p) && needAccount()) return;
      const on = !state.saves.includes(p.id);
      dispatch({ type: 'toggle', list: 'saves', id: p.id, on });
      if (remote(p)) sync(() => api.setSave(p.id, on), () => dispatch({ type: 'toggle', list: 'saves', id: p.id, on: !on }));
    },
    follow(p: FeedPost) {
      if (remote(p) && needAccount()) return;
      const on = !state.following.includes(p.handle);
      dispatch({ type: 'toggle', list: 'following', id: p.handle, on });
      if (remote(p) && p.creatorId) {
        sync(() => api.setFollow(p.creatorId!, on), () => dispatch({ type: 'toggle', list: 'following', id: p.handle, on: !on }));
      }
    },
    async share(p: FeedPost) {
      // Only public, approved posts are shareable; private Studio media is never linked.
      await Share.share({ message: `“${p.title}” by @${p.handle} on WonderReel (AI-generated). wonderreel://post/${p.id}` }).catch(() => {});
    },
    remix(p: FeedPost) {
      const tpl = toRemixTemplate(p);
      if (!tpl || !canRemix(p, new Set(state.blocked))) {
        Alert.alert('Not available', 'This video cannot be remixed.');
        return;
      }
      openRemix(dispatch, tpl);
    },
    more(p: FeedPost) {
      Alert.alert(`@${p.handle}`, 'What would you like to do?', [
        { text: 'Report video', onPress: () => report(p) },
        { text: `Block @${p.handle}`, style: 'destructive', onPress: () => block(p) },
        { text: 'Not interested', onPress: () => dispatch({ type: 'toggle', list: 'hidden', id: p.id, on: true }) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    },
    report,
    block,
  };
}
