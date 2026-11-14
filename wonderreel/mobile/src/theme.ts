// WonderReel design tokens, taken from the original web prototype (styles.css).
export const colors = {
  bg: '#0b0d17',
  panel: '#111421',
  panel2: '#171a29',
  card: '#151a2d',
  line: '#25273c',
  lineStrong: '#373347',
  white: '#f8f7ff',
  text: '#f8f7ff',
  muted: '#9295ab',
  muted2: '#676b7e',
  pink: '#f488bd',
  purple: '#9074fc',
  tagPink: '#efb2e0',
  danger: '#ff6b8a',
  success: '#7be0b0',
  warning: '#ffcf7a',
} as const;

// "linear-gradient(115deg,#ef7fba 0%,#c76ecf 49%,#8870f8 100%)"
export const gradient = ['#ef7fba', '#c76ecf', '#8870f8'] as const;
export const gradientStart = { x: 0, y: 0.2 };
export const gradientEnd = { x: 1, y: 0.8 };

export const radius = { sm: 8, md: 12, lg: 18, xl: 22, pill: 999 } as const;
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const type = {
  hero: { fontSize: 34, fontWeight: '800' as const, letterSpacing: -1.2, color: colors.white },
  h1: { fontSize: 26, fontWeight: '800' as const, letterSpacing: -0.6, color: colors.white },
  h2: { fontSize: 20, fontWeight: '800' as const, letterSpacing: -0.3, color: colors.white },
  body: { fontSize: 14, lineHeight: 21, color: '#c9c8d8' },
  small: { fontSize: 12, color: colors.muted },
  kicker: { fontSize: 10, fontWeight: '800' as const, letterSpacing: 2, color: '#e38ac9' },
};
