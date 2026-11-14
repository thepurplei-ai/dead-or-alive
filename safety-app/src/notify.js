// Alerts on the phone.
// - Push: when the app is closed, the other phone sends a push through Expo's free push service.
// - When the app is open, App.js also shows a big banner and vibrates for SOS.

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false,
  }),
});

/** Asks permission and returns this phone's push token, or null. */
export async function getPushToken() {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('sos', {
        name: 'SOS',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 600, 300, 600, 300, 600],
        sound: 'default',
        bypassDnd: true,
      });
      await Notifications.setNotificationChannelAsync('messages', {
        name: 'Messages',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted' || !Device.isDevice) return null;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) return null;
    return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  } catch (e) {
    return null; // push not set up yet: in-app alerts still work
  }
}

/** Sends a push to the other phone. Never throws. */
export async function pushTo(token, title, body, sos = false) {
  if (!token) return;
  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        to: token, title, body, sound: 'default', priority: 'high',
        channelId: sos ? 'sos' : 'messages',
      }),
    });
  } catch (e) { /* offline: the other phone still sees it when it opens the app */ }
}

