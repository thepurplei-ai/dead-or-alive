import type { FeedPost, RemixTemplate } from '../lib/types.ts';

// Built-in concept templates from the WonderReel prototype. These are illustrations,
// not real user videos, and the UI always labels them "Sample concept".
export const TEMPLATES: (RemixTemplate & { posterKey: string })[] = [
  {
    templateId: 'tpl-hero',
    title: 'The hero above the city',
    category: 'Superhero',
    style: 'Cinematic',
    posterKey: 'hero',
    prompt:
      'Turn my photo into a cinematic superhero adventure above a glowing city at sunset. I help rescue a lost puppy and return home as a hero.',
    scenes: [
      { number: 1, title: 'The ordinary moment', description: 'We meet our hero in a familiar world.', camera: 'Slow push-in', durationSec: 5 },
      { number: 2, title: 'The call to adventure', description: 'An urgent rescue mission unfolds high above the city.', camera: 'Aerial sweep', durationSec: 5 },
      { number: 3, title: 'The heroic rescue', description: 'The hero overcomes an obstacle with courage and creativity.', camera: 'Low-angle hero shot', durationSec: 5 },
      { number: 4, title: 'The return', description: 'The adventure ends with a triumphant cinematic reveal.', camera: 'Golden-hour wide shot', durationSec: 5 },
    ],
  },
  {
    templateId: 'tpl-space',
    title: 'First steps on Mars',
    category: 'Space',
    style: 'Cinematic',
    posterKey: 'space',
    prompt:
      'Transform my footage into an epic astronaut adventure on Mars. I discover a glowing ancient alien city beneath the red sands.',
    scenes: [
      { number: 1, title: 'The launch', description: 'Our explorer sets out toward an unknown world.', camera: 'Rumbling close-up', durationSec: 5 },
      { number: 2, title: 'Arrival on Mars', description: 'A vast orange landscape reveals incredible scale.', camera: 'Slow crane up', durationSec: 5 },
      { number: 3, title: 'The discovery', description: 'Ancient secrets glow beneath the planet surface.', camera: 'Torch-lit tracking shot', durationSec: 5 },
      { number: 4, title: 'A new beginning', description: 'One breathtaking final shot hints at the next adventure.', camera: 'Wide pull-back', durationSec: 5 },
    ],
  },
  {
    templateId: 'tpl-santa',
    title: 'Santa and the missing gift',
    category: 'Holiday',
    style: 'Animated',
    posterKey: 'santa',
    prompt:
      'Make a magical holiday adventure where Santa must find a lost Christmas present across a snowy village, following mysterious glowing clues.',
    scenes: [
      { number: 1, title: 'A mystery on Christmas Eve', description: 'One special present goes missing in the snowy village.', camera: 'Snowy establishing shot', durationSec: 5 },
      { number: 2, title: 'Following the clues', description: 'Santa follows a trail of magical lights and friendly helpers.', camera: 'Tracking shot', durationSec: 5 },
      { number: 3, title: 'The surprising discovery', description: 'A clever twist reveals where the gift was hidden.', camera: 'Reveal pan', durationSec: 5 },
      { number: 4, title: 'The celebration', description: 'The present arrives just in time for a warm finale.', camera: 'Cozy wide shot', durationSec: 5 },
    ],
  },
  {
    templateId: 'tpl-pirate',
    title: 'Beyond the hidden island',
    category: 'Adventure',
    style: 'Fantasy',
    posterKey: 'pirate',
    prompt:
      'Create a cinematic pirate adventure. I captain an old ship through a golden sunset and discover a mysterious hidden island.',
    scenes: [
      { number: 1, title: 'The ancient map', description: 'A daring captain finds a clue leading beyond the horizon.', camera: 'Macro on the map', durationSec: 5 },
      { number: 2, title: 'Sailing into the unknown', description: 'The ship races across dramatic sunset waves.', camera: 'Bow-mounted shot', durationSec: 5 },
      { number: 3, title: 'The hidden island', description: 'A spectacular island and secret treasure are discovered.', camera: 'Drone reveal', durationSec: 5 },
      { number: 4, title: 'The legend lives on', description: 'Our adventurer sails onward into the sunset.', camera: 'Silhouette wide', durationSec: 5 },
    ],
  },
  {
    templateId: 'tpl-castle',
    title: 'The enchanted kingdom',
    category: 'Fantasy',
    style: 'Fantasy',
    posterKey: 'fantasy',
    prompt:
      'Transform me into a magical explorer who discovers an enchanted castle filled with friendly creatures and glowing spells.',
    scenes: [
      { number: 1, title: 'The mysterious portal', description: 'A familiar place transforms into an enchanted world.', camera: 'Swirling push-in', durationSec: 5 },
      { number: 2, title: 'The magical journey', description: 'A luminous path leads toward an extraordinary castle.', camera: 'Floating dolly', durationSec: 5 },
      { number: 3, title: 'The brave choice', description: 'The hero solves a puzzle and meets a surprising friend.', camera: 'Over-the-shoulder', durationSec: 5 },
      { number: 4, title: 'The final wonder', description: 'A joyful, glowing finale reveals the magic of imagination.', camera: 'Sparkling crane out', durationSec: 5 },
    ],
  },
];

const t = (id: string) => TEMPLATES.find((x) => x.templateId === id)!;

export const SAMPLE_POSTS: FeedPost[] = [
  { id: 'sample-hero', handle: 'adventurelab', avatarLetter: 'A', title: 'The hero above the city', caption: 'When the world needs a hero, imagination takes flight.', tags: ['superhero', 'adventure', 'wonderreel'], likeCount: 2400, commentCount: 128, posterKey: 'hero', aiGenerated: true, allowRemix: true, template: t('tpl-hero'), sample: true },
  { id: 'sample-space', handle: 'cosmicstudio', avatarLetter: 'C', title: 'First steps on Mars', caption: 'A mission through the stars, where every discovery changes everything.', tags: ['space', 'scifi', 'explore'], likeCount: 4800, commentCount: 242, posterKey: 'space', aiGenerated: true, allowRemix: true, template: t('tpl-space'), sample: true },
  { id: 'sample-santa', handle: 'holidaymagic', avatarLetter: 'H', title: 'Santa and the missing gift', caption: 'One present. One magical night. The adventure of a lifetime.', tags: ['christmas', 'holiday', 'magic'], likeCount: 3100, commentCount: 93, posterKey: 'santa', aiGenerated: true, allowRemix: true, template: t('tpl-santa'), sample: true },
  { id: 'sample-pirate', handle: 'dreamframes', avatarLetter: 'D', title: 'Beyond the hidden island', caption: 'Set sail. Follow the map. Find the impossible.', tags: ['pirates', 'fantasy', 'cinematic'], likeCount: 1900, commentCount: 75, posterKey: 'pirate', aiGenerated: true, allowRemix: true, template: t('tpl-pirate'), sample: true },
  { id: 'sample-castle', handle: 'dreamframes', avatarLetter: 'D', title: 'The enchanted kingdom', caption: 'Every portal leads somewhere magical.', tags: ['fantasy', 'castle', 'magic'], likeCount: 1250, commentCount: 41, posterKey: 'fantasy', aiGenerated: true, allowRemix: false, template: t('tpl-castle'), sample: true },
];

export const PROMPT_CHIPS = [
  { label: 'Superhero', prompt: 'Make me a superhero saving a puppy above a glowing city at sunset.' },
  { label: 'Santa Mission', prompt: 'Santa searches a snowy village for a missing present, following glowing clues.' },
  { label: 'Astronaut', prompt: 'Turn me into an astronaut discovering an alien civilization on a distant planet.' },
  { label: 'Pirate', prompt: 'I captain a pirate ship through a golden sunset and find a hidden island.' },
  { label: 'Wizard', prompt: 'I become a wizard who opens a portal to an enchanted castle full of friendly creatures.' },
  { label: 'Fantasy', prompt: 'Our holiday photo becomes a magical adventure in a glowing fantasy forest.' },
  { label: 'Comedy', prompt: 'A clumsy secret agent mission where everything goes hilariously wrong but ends in triumph.' },
];

export const FAMILY_PROMPTS = [
  { label: 'Santa mission', prompt: 'A cozy mission to help Santa deliver the last present before sunrise.' },
  { label: 'Helping heroes', prompt: 'Kind superheroes help neighbours, rescue a kitten and plant a garden together.' },
  { label: 'Space explorer', prompt: 'A friendly space explorer visits a planet of giggling bouncy aliens.' },
  { label: 'Bedtime adventure', prompt: 'A sleepy moonlit boat trip where gentle stars sing everyone to sleep.' },
];
