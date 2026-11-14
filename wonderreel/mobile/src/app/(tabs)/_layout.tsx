import { Tabs, type BottomTabBarProps } from 'expo-router/tabs';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, type IconName } from '../../components/ui';
import { colors, gradient } from '../../theme';

const ICONS: Record<string, [IconName, IconName, string]> = {
  index: ['home-outline', 'home', 'Home'],
  discover: ['compass-outline', 'compass', 'Discover'],
  create: ['add', 'add', 'Create'],
  studio: ['film-outline', 'film', 'Studio'],
  profile: ['person-circle-outline', 'person-circle', 'Profile'],
};

function TabBar({ state, navigateToTab }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {state.routes.map((route, i) => {
        const cfg = ICONS[route.name];
        if (!cfg) return null;
        const focused = state.index === i;
        const onPress = () => {
          if (!focused) navigateToTab(route.key);
        };
        if (route.name === 'create') {
          return (
            <Pressable key={route.key} onPress={onPress} style={styles.item} accessibilityRole="tab" accessibilityLabel="Create" accessibilityState={{ selected: focused }}>
              <LinearGradient colors={gradient as unknown as [string, string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.create}>
                <Ionicons name="add" size={30} color="#fff" />
              </LinearGradient>
            </Pressable>
          );
        }
        return (
          <Pressable key={route.key} onPress={onPress} style={styles.item} accessibilityRole="tab" accessibilityLabel={cfg[2]} accessibilityState={{ selected: focused }}>
            <Ionicons name={focused ? cfg[1] : cfg[0]} size={24} color={focused ? colors.white : '#8e8aa6'} />
            <Text style={[styles.label, focused && { color: colors.white }]}>{cfg[2]}</Text>
            {focused ? <View style={styles.dot} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}
      tabBar={(props) => <TabBar {...props} />}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="discover" />
      <Tabs.Screen name="create" />
      <Tabs.Screen name="studio" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#0b0d17f2', borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 8,
  },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 50 },
  label: { color: '#8e8aa6', fontSize: 11, fontWeight: '700', marginTop: 2 },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.pink, marginTop: 3 },
  create: {
    width: 54, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#c46dce', shadowOpacity: 0.5, shadowRadius: 14, elevation: 8,
  },
});
