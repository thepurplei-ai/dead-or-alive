import { Stack, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Text } from 'react-native';
import { Kicker, Notice, Screen } from '../../components/ui';
import { AI_NOTICE_VERSION, PRIVACY_VERSION, TERMS_VERSION } from '../../lib/config';
import { type } from '../../theme';

// Draft texts. They must be reviewed by a lawyer before public launch.
const DOCS: Record<string, { title: string; version: string; body: string[] }> = {
  terms: {
    title: 'Terms of Use',
    version: TERMS_VERSION,
    body: [
      'WonderReel is an AI movie studio and community for adults aged 18 and over.',
      'You may only upload photos and videos you own or have permission to use. Everyone identifiable in your media must be an adult who agreed. Do not upload children’s media to the public community.',
      'Not allowed: sexual content, nudity, sexualised images of anyone, content involving minors in unsafe ways, harassment, hate, violence, dangerous acts, impersonation, deepfakes of real people without consent, and copyright infringement.',
      'All AI-generated content is labelled. Do not present it as real footage.',
      'Public posts are reviewed by moderators before they appear. We can remove content and suspend accounts that break these rules.',
      '“Create My Version” lets others reuse only the story idea and scene structure you allow. It never copies your face, voice or media. You can turn it off for any post.',
      'Credits are used for AI rendering. Failed or cancelled renders are refunded.',
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    version: PRIVACY_VERSION,
    body: [
      'What we collect: your email, handle, profile text, the result of the age check (not your birth date), your projects, and the media you choose to upload for rendering.',
      'Your Studio is private. Files are stored in private storage that only you can reach. Public copies are made only after a moderator approves a post you asked to publish.',
      'AI processing: when you press Render, your prompt and chosen media are sent to our AI providers to make your result: Anthropic’s Claude plans your story and checks it for safety, and Runway makes the images and videos. We do not use your media to train models, and we do not sell your data.',
      'Family Mode is stored on your phone only. Children’s photos and videos are never sent to cloud AI services.',
      'You can export your data and delete your account at any time in Settings. Deletion removes your projects, uploads, posts, comments and likes.',
      'No advertising tracking, no location tracking, and no direct messages.',
    ],
  },
  ai: {
    title: 'AI notice',
    version: AI_NOTICE_VERSION,
    body: [
      'WonderReel uses artificial intelligence to plan stories and to create images and videos.',
      'Storyboards are plans, not rendered videos. Rendered results come from AI providers and may contain mistakes.',
      'Everything made with WonderReel is labelled “AI-generated”.',
      'Your photos and videos are only sent to an AI provider when you confirm a render, and never from Family Mode.',
      'Prompts and media are checked by safety filters before and after rendering. Some requests will be refused.',
    ],
  },
  community: {
    title: 'Community rules',
    version: TERMS_VERSION,
    body: [
      'Adults only (18+). Be kind. Credit the creators you remix.',
      'Never post children, or anyone who did not agree to be in your video.',
      'No sexual content, hate, harassment, violence, scams or spam.',
      'Report anything that breaks the rules. Moderators review every report.',
    ],
  },
};

export default function Legal() {
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const d = DOCS[doc] ?? DOCS.terms;
  return (
    <Screen>
      <Stack.Screen options={{ title: d.title }} />
      <Kicker>VERSION {d.version}</Kicker>
      <Notice tone="warn">Draft for development. Needs legal review before public launch.</Notice>
      {d.body.map((p, i) => <Text key={i} style={[type.body, { marginTop: 12 }]}>{p}</Text>)}
    </Screen>
  );
}
