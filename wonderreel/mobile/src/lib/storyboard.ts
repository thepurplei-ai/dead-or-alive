// On-device storyboard planner and AI Director "edit" commands.
// It works offline and is clearly labeled as a plan (never as a rendered video).
// When the cloud AI Director is configured, the server returns the same Storyboard shape.
import type { Scene, Storyboard, Style } from './types.ts';

type Theme = 'hero' | 'space' | 'santa' | 'pirate' | 'castle' | 'comedy' | 'travel' | 'action';

const THEME_RULES: [Theme, RegExp][] = [
  ['santa', /santa|christmas|gift|present|holiday|snow|reindeer/],
  ['hero', /hero|rescue|superpower|save|saving|puppy|cape/],
  ['space', /alien|mars|space|astronaut|planet|galaxy|rocket|star/],
  ['pirate', /pirate|island|ship|ocean|treasure|sail/],
  ['comedy', /funny|comedy|clumsy|hilarious|silly|prank/],
  ['travel', /travel|trip|holiday photo|vacation|city tour|road trip/],
  ['action', /chase|agent|spy|race|action|heist/],
];

export function inferTheme(prompt: string): Theme {
  const p = prompt.toLowerCase();
  for (const [theme, rule] of THEME_RULES) if (rule.test(p)) return theme;
  return 'castle';
}

const BEATS: Record<Theme, [string, string, string][]> = {
  hero: [
    ['The ordinary moment', 'We meet our hero in a familiar world.', 'Slow push-in'],
    ['The call to adventure', 'An urgent rescue mission unfolds high above the city.', 'Aerial sweep'],
    ['The heroic rescue', 'The hero overcomes an obstacle with courage and creativity.', 'Low-angle hero shot'],
    ['The return', 'The adventure ends with a triumphant cinematic reveal.', 'Golden-hour wide shot'],
  ],
  space: [
    ['The launch', 'Our explorer sets out toward an unknown world.', 'Rumbling close-up'],
    ['Arrival', 'A vast alien landscape reveals incredible scale.', 'Slow crane up'],
    ['The discovery', 'Ancient secrets emerge from the planet surface.', 'Torch-lit tracking shot'],
    ['A new beginning', 'One breathtaking final shot hints at the next adventure.', 'Wide pull-back'],
  ],
  santa: [
    ['A mystery on Christmas Eve', 'One special present goes missing in the snowy village.', 'Snowy establishing shot'],
    ['Following the clues', 'A trail of magical lights and friendly helpers leads the way.', 'Tracking shot'],
    ['The surprising discovery', 'A clever twist reveals where the gift was hidden.', 'Reveal pan'],
    ['The celebration', 'The present arrives just in time for a warm finale.', 'Cozy wide shot'],
  ],
  pirate: [
    ['The ancient map', 'A daring captain finds a clue leading beyond the horizon.', 'Macro on the map'],
    ['Sailing into the unknown', 'The ship races across dramatic sunset waves.', 'Bow-mounted shot'],
    ['The hidden island', 'A spectacular island and secret treasure are discovered.', 'Drone reveal'],
    ['The legend lives on', 'Our adventurer sails onward into the sunset.', 'Silhouette wide'],
  ],
  castle: [
    ['The mysterious portal', 'A familiar place transforms into an enchanted world.', 'Swirling push-in'],
    ['The magical journey', 'A luminous path leads toward an extraordinary castle.', 'Floating dolly'],
    ['The brave choice', 'The hero solves a puzzle and meets a surprising new friend.', 'Over-the-shoulder'],
    ['The final wonder', 'A joyful, glowing finale reveals the magic of imagination.', 'Sparkling crane out'],
  ],
  comedy: [
    ['A perfect plan', 'Our hero explains a flawless plan. Nothing can go wrong.', 'Confident close-up'],
    ['It goes wrong', 'One small mistake sets off a chain of silly chaos.', 'Whip pans'],
    ['Making it worse', 'Every fix creates a bigger, funnier problem.', 'Split-screen reactions'],
    ['Accidental triumph', 'By pure luck everything works out brilliantly.', 'Slow-motion victory'],
  ],
  travel: [
    ['Departure', 'Bags packed, the journey begins with a spark of magic.', 'Window-seat shot'],
    ['A new world', 'The destination transforms into something extraordinary.', 'Wide reveal'],
    ['The hidden gem', 'A secret place only the travellers discover.', 'Handheld follow'],
    ['Postcard ending', 'The perfect sunset moment, framed like a postcard.', 'Golden-hour wide'],
  ],
  action: [
    ['The mission', 'A secret briefing sets an impossible task.', 'Tense close-up'],
    ['The chase', 'A high-speed pursuit through neon streets.', 'Tracking dolly'],
    ['The twist', 'An unexpected ally changes everything.', 'Dutch angle'],
    ['Mission complete', 'A cool walk away from a spectacular finale.', 'Slow-motion wide'],
  ],
};

const TITLES: Record<Theme, string> = {
  hero: 'The Rescue Above the City',
  space: 'Discovery Among the Stars',
  santa: 'The Missing Present',
  pirate: 'The Hidden Island',
  castle: 'The Enchanted Kingdom',
  comedy: 'The Perfect Plan',
  travel: 'The Magic Journey',
  action: 'Mission: Wonder',
};

export function planStoryboard(prompt: string, style: Style): Storyboard {
  const theme = inferTheme(prompt);
  const scenes: Scene[] = BEATS[theme].map(([title, description, camera], i) => ({
    number: i + 1,
    title,
    description,
    camera,
    durationSec: 5,
  }));
  return { title: TITLES[theme], theme, style, prompt, scenes, source: 'local' };
}

/**
 * Apply a conversational edit such as "change the ending", "add a friendly robot"
 * or "make it more dramatic". Returns the new storyboard and a short Director reply.
 */
export function applyDirectorEdit(board: Storyboard, request: string): { board: Storyboard; reply: string } {
  const r = request.toLowerCase().trim();
  const scenes = board.scenes.map((s) => ({ ...s }));
  const last = scenes[scenes.length - 1];

  const addMatch = /\badd (?:a |an |the )?(.+)$/.exec(r);
  if (/ending|finale|end\b/.test(r)) {
    const happy = /happy|sweet|warm/.test(r);
    const twist = /twist|surpris/.test(r);
    last.title = twist ? 'The final twist' : happy ? 'A joyful ending' : 'A new ending';
    last.description = twist
      ? 'Just when it seems over, a surprising reveal changes everything.'
      : happy
        ? 'Everyone celebrates together in a warm, glowing finale.'
        : 'The story closes on a bold new image that sets up a sequel.';
    return { board: { ...board, scenes }, reply: `I rewrote scene ${last.number}: "${last.title}".` };
  }
  if (/dramatic|epic|intense|cinematic/.test(r)) {
    for (const s of scenes) {
      s.description = s.description.replace(/\.$/, '') + ', with sweeping music and dramatic light.';
      s.camera = s.camera ? `${s.camera}, slow motion` : 'Slow motion';
    }
    return { board: { ...board, scenes }, reply: 'I made every scene more dramatic: bigger light, slower motion, sweeping music.' };
  }
  if (/funny|funnier|comedy|silly/.test(r)) {
    scenes[2].description = scenes[2].description.replace(/\.$/, '') + ' — but with a hilarious mishap first.';
    return { board: { ...board, scenes }, reply: 'I added a funny mishap to scene 3.' };
  }
  if (/shorter|fewer scenes|three scenes/.test(r) && scenes.length > 3) {
    const trimmed = [scenes[0], scenes[2], { ...last, number: 3 }].map((s, i) => ({ ...s, number: i + 1 }));
    return { board: { ...board, scenes: trimmed }, reply: 'I tightened the story to three scenes.' };
  }
  if (addMatch) {
    const thing = addMatch[1].replace(/[.!?]+$/, '').slice(0, 60);
    scenes[1].description = scenes[1].description.replace(/\.$/, '') + `, joined by ${withArticle(thing)}.`;
    scenes[2].description = scenes[2].description.replace(/\.$/, '') + ` The ${thing} helps save the day.`;
    return { board: { ...board, scenes }, reply: `I added ${withArticle(thing)} to scenes 2 and 3.` };
  }
  const sceneMatch = /scene (\d)/.exec(r);
  if (sceneMatch) {
    const idx = Number(sceneMatch[1]) - 1;
    if (scenes[idx]) {
      const note = request.replace(/.*scene \d[:,]?\s*/i, '').slice(0, 160);
      if (note) scenes[idx].description = note.charAt(0).toUpperCase() + note.slice(1);
      return { board: { ...board, scenes }, reply: `Scene ${idx + 1} updated.` };
    }
  }
  return {
    board,
    reply: 'Tell me what to change, for example: "change the ending", "add a friendly robot", "make it more dramatic" or "scene 2: we fly over the ocean".',
  };
}

function withArticle(word: string) {
  if (/^(a|an|the|my|our|some)\b/.test(word)) return word;
  return (/^[aeiou]/.test(word) ? 'an ' : 'a ') + word;
}

/** Build the final generation prompt for one scene, adding safe visual direction. */
export function scenePrompt(board: Storyboard, sceneNumber: number): string {
  const s = board.scenes.find((x) => x.number === sceneNumber) ?? board.scenes[0];
  return `${board.prompt}\nScene ${s.number} — ${s.title}: ${s.description}${s.camera ? ` Camera: ${s.camera}.` : ''}\nVisual style: ${board.style}.`;
}
