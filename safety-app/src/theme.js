// Colour tokens and shared styles. Change the look of the whole app here.
import { StyleSheet } from 'react-native';

export const C = {
  bg: '#F5F7FB',
  card: '#FFFFFF',
  line: '#E4E9F1',
  text: '#0F1B2D',
  body: '#3A4760',
  muted: '#7B879B',
  brand: '#2F5BEA',     // calm blue: "connected"
  brandSoft: '#E8EEFD',
  partner: '#8B5CF6',   // the other person on the map
  home: '#0E9F6E',
  sos: '#E5322D',
  sosDark: '#B42318',
  sosSoft: '#FDE8E7',
  ok: '#12B76A',
};

export const S = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  pad: { padding: 20 },
  h1: { fontSize: 28, fontWeight: '800', color: C.text },
  h2: { fontSize: 20, fontWeight: '700', color: C.text },
  body: { fontSize: 16, lineHeight: 23, color: C.body },
  muted: { fontSize: 14, color: C.muted },
  card: { backgroundColor: C.card, borderRadius: 18, padding: 18, borderWidth: 1, borderColor: C.line },
  input: {
    backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 14, fontSize: 18, color: C.text,
  },
  btn: { backgroundColor: C.brand, borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
  btnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  btnGhost: { borderRadius: 16, paddingVertical: 16, alignItems: 'center', borderWidth: 1.5, borderColor: C.brand },
  btnGhostText: { color: C.brand, fontSize: 17, fontWeight: '700' },
  error: { color: C.sosDark, fontSize: 15, marginTop: 10 },
});
