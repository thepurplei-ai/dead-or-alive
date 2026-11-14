// Bundled concept illustrations (from the original WonderReel artwork).
export const POSTERS: Record<string, number> = {
  hero: require('../../assets/posters/hero.jpg'),
  space: require('../../assets/posters/space.jpg'),
  santa: require('../../assets/posters/santa.jpg'),
  pirate: require('../../assets/posters/pirate.jpg'),
  fantasy: require('../../assets/posters/fantasy.jpg'),
};

export function posterSource(key?: string, url?: string) {
  if (url) return { uri: url };
  return POSTERS[key ?? ''] ?? POSTERS.fantasy;
}
