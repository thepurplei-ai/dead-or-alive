import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
  type StyleProp, type TextInputProps, type TextStyle, type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, gradient, gradientEnd, gradientStart, radius, type } from '../theme';

export type IconName = React.ComponentProps<typeof Ionicons>['name'];
export { Ionicons };

export function Screen({ children, scroll = true, padded = true, style }: {
  children: React.ReactNode; scroll?: boolean; padded?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const insets = useSafeAreaInsets();
  const pad = { paddingTop: insets.top + 12, paddingHorizontal: padded ? 16 : 0, paddingBottom: 110 };
  if (!scroll) return <View style={[styles.screen, pad, style]}>{children}</View>;
  return (
    <ScrollView style={styles.screen} contentContainerStyle={[pad, style]} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

export function GradientButton({ label, onPress, icon, disabled, loading, style, small, accessibilityHint }: {
  label: string; onPress?: () => void; icon?: IconName; disabled?: boolean; loading?: boolean;
  style?: StyleProp<ViewStyle>; small?: boolean; accessibilityHint?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
      style={({ pressed }) => [{ opacity: disabled ? 0.45 : pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] }, style]}>
      <LinearGradient
        colors={gradient as unknown as [string, string, string]}
        start={gradientStart}
        end={gradientEnd}
        style={[styles.gradBtn, small && { minHeight: 40, paddingHorizontal: 14 }]}>
        {loading ? <ActivityIndicator color="#fff" /> : icon ? <Ionicons name={icon} size={small ? 16 : 19} color="#fff" /> : null}
        <Text style={[styles.gradText, small && { fontSize: 13 }]}>{label}</Text>
      </LinearGradient>
    </Pressable>
  );
}

export function GhostButton({ label, onPress, icon, style, danger, disabled }: {
  label: string; onPress?: () => void; icon?: IconName; style?: StyleProp<ViewStyle>; danger?: boolean; disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.ghost, danger && { borderColor: '#5a2a3a' }, { opacity: disabled ? 0.45 : pressed ? 0.7 : 1 }, style]}>
      {icon ? <Ionicons name={icon} size={17} color={danger ? colors.danger : '#e9e2f5'} /> : null}
      <Text style={[styles.ghostText, danger && { color: colors.danger }]}>{label}</Text>
    </Pressable>
  );
}

export function Chip({ label, selected, onPress, icon }: { label: string; selected?: boolean; onPress?: () => void; icon?: IconName }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      style={({ pressed }) => [styles.chip, selected && styles.chipOn, pressed && { opacity: 0.75 }]}>
      {icon ? <Ionicons name={icon} size={14} color={selected ? '#fff' : '#bdb3d4'} /> : null}
      <Text style={[styles.chipText, selected && { color: '#fff' }]}>{label}</Text>
    </Pressable>
  );
}

export function Kicker({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[type.kicker, { marginBottom: 8 }, style]}>{children}</Text>;
}

export function GradientText({ children, style }: { children: string; style?: StyleProp<TextStyle> }) {
  // Native gradient text needs masked views; a solid pink keeps it light and readable.
  return <Text style={[style, { color: colors.pink }]}>{children}</Text>;
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Field(props: TextInputProps & { label?: string }) {
  const { label, style, ...rest } = props;
  return (
    <View style={{ marginBottom: 12 }}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput placeholderTextColor={colors.muted2} style={[styles.input, style]} {...rest} />
    </View>
  );
}

export function Notice({ tone = 'info', children, icon }: { tone?: 'info' | 'warn' | 'error' | 'ok'; children: React.ReactNode; icon?: IconName }) {
  const c = { info: '#b9a8f7', warn: colors.warning, error: colors.danger, ok: colors.success }[tone];
  const i: IconName = icon ?? ({ info: 'information-circle', warn: 'warning', error: 'alert-circle', ok: 'checkmark-circle' } as const)[tone];
  return (
    <View style={[styles.notice, { borderColor: c + '55', backgroundColor: c + '14' }]} accessibilityRole="alert">
      <Ionicons name={i} size={18} color={c} style={{ marginTop: 1 }} />
      <Text style={[styles.noticeText]}>{children}</Text>
    </View>
  );
}

export function Empty({ icon, title, body, action }: { icon: IconName; title: string; body: string; action?: React.ReactNode }) {
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={36} color={colors.pink} />
      <Text style={[type.h2, { marginTop: 10, textAlign: 'center' }]}>{title}</Text>
      <Text style={[type.body, { textAlign: 'center', marginTop: 6, marginBottom: 14 }]}>{body}</Text>
      {action}
    </View>
  );
}

export function Row({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 8 }, style]}>{children}</View>;
}

export function ListItem({ icon, label, sub, onPress, danger, right }: {
  icon: IconName; label: string; sub?: string; onPress?: () => void; danger?: boolean; right?: React.ReactNode;
}) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.listItem, pressed && { backgroundColor: '#1b1e30' }]}>
      <View style={styles.listIcon}>
        <Ionicons name={icon} size={19} color={danger ? colors.danger : colors.pink} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: danger ? colors.danger : colors.white, fontWeight: '700', fontSize: 15 }}>{label}</Text>
        {sub ? <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>{sub}</Text> : null}
      </View>
      {right ?? <Ionicons name="chevron-forward" size={18} color={colors.muted2} />}
    </Pressable>
  );
}

export function Badge({ label, tone = 'pink' }: { label: string; tone?: 'pink' | 'muted' | 'ok' | 'warn' | 'error' }) {
  const c = { pink: colors.pink, muted: colors.muted, ok: colors.success, warn: colors.warning, error: colors.danger }[tone];
  return (
    <View style={[styles.badge, { borderColor: c + '66', backgroundColor: c + '1a' }]}>
      <Text style={{ color: c, fontSize: 10, fontWeight: '800', letterSpacing: 0.8 }}>{label.toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  gradBtn: {
    minHeight: 50, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingHorizontal: 18, shadowColor: '#c46dce', shadowOpacity: 0.35, shadowRadius: 18, elevation: 6,
  },
  gradText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  ghost: {
    minHeight: 46, borderRadius: radius.md, borderWidth: 1, borderColor: '#3a3650', backgroundColor: '#181a2b',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 14,
  },
  ghostText: { color: '#e9e2f5', fontWeight: '700', fontSize: 14 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 36, borderRadius: radius.pill,
    backgroundColor: '#1a1b2a', borderWidth: 1, borderColor: '#313044',
  },
  chipOn: { backgroundColor: '#3b2a52', borderColor: colors.pink },
  chipText: { color: '#bdb3d4', fontWeight: '700', fontSize: 13 },
  card: { backgroundColor: colors.panel, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: 16 },
  label: { color: colors.muted, fontSize: 12, fontWeight: '700', marginBottom: 6, letterSpacing: 0.4 },
  input: {
    backgroundColor: colors.panel2, borderWidth: 1, borderColor: '#333447', borderRadius: radius.md, color: colors.white,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15,
  },
  notice: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: radius.md, borderWidth: 1, marginVertical: 8 },
  noticeText: { color: '#e4dff0', fontSize: 13, lineHeight: 19, flex: 1 },
  empty: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 20 },
  listItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 6, borderRadius: radius.md },
  listIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#1d1b30', alignItems: 'center', justifyContent: 'center' },
  badge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 4, alignSelf: 'flex-start' },
});
