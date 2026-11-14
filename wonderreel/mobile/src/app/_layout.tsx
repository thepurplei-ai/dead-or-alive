import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppStateProvider, useApp } from '../state/AppState';
import { colors } from '../theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

const theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.bg, card: colors.panel, primary: colors.pink, text: colors.white, border: colors.line },
};

function RootStack() {
  const { state } = useApp();
  useEffect(() => {
    if (state.loaded) SplashScreen.hideAsync().catch(() => {});
  }, [state.loaded]);
  if (!state.loaded) return null;
  const header = {
    headerShown: true,
    headerStyle: { backgroundColor: colors.bg },
    headerTintColor: colors.white,
    headerTitleStyle: { fontWeight: '800' as const },
    headerShadowVisible: false,
  };
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'fade_from_bottom' }}>
      <Stack.Protected guard={state.onboarded}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="project/[id]" options={{ ...header, title: 'Project' }} />
        <Stack.Screen name="comments/[postId]" options={{ ...header, title: 'Comments', presentation: 'modal' }} />
        <Stack.Screen name="family" options={{ ...header, title: 'Family Mode' }} />
        <Stack.Screen name="settings" options={{ ...header, title: 'Settings & privacy' }} />
        <Stack.Screen name="auth" options={{ ...header, title: 'Account', presentation: 'modal' }} />
        <Stack.Screen name="credits" options={{ ...header, title: 'Credits' }} />
        <Stack.Screen name="admin" options={{ ...header, title: 'Moderation' }} />
        <Stack.Screen name="creator/[handle]" options={{ ...header, title: 'Creator' }} />
      </Stack.Protected>
      <Stack.Screen name="legal/[doc]" options={{ ...header, title: 'WonderReel' }} />
      <Stack.Protected guard={!state.onboarded}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaProvider>
        <ThemeProvider value={theme}>
          <AppStateProvider>
            <StatusBar style="light" />
            <RootStack />
          </AppStateProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
