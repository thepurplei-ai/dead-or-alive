// App settings. A .js file (not app.json) so the Google Maps key can come from an EAS secret
// instead of being written in the code: `GOOGLE_MAPS_API_KEY`.
const LOCATION_TEXT =
  'SafePair shares your location only with the one person you connected with, so you can find each other.';

module.exports = {
  expo: {
    name: 'SafePair',
    slug: 'safepair',
    version: '1.0.0',
    orientation: 'portrait',
    userInterfaceStyle: 'light',
    backgroundColor: '#F5F7FB',
    icon: './assets/icon.png',
    ios: {
      bundleIdentifier: 'com.thepurpleiai.safepair',
      supportsTablet: false,
      infoPlist: {
        NSLocationWhenInUseUsageDescription: LOCATION_TEXT,
      },
    },
    android: {
      package: 'com.thepurpleiai.safepair',
      adaptiveIcon: { foregroundImage: './assets/adaptive-icon.png', backgroundColor: '#2F5BEA' },
      permissions: [
        'android.permission.ACCESS_COARSE_LOCATION',
        'android.permission.ACCESS_FINE_LOCATION',
        'android.permission.VIBRATE',
        'android.permission.POST_NOTIFICATIONS',
      ],
      config: {
        googleMaps: { apiKey: process.env.GOOGLE_MAPS_API_KEY || '' },
      },
      // For push alerts on Android. Download it from Firebase (Project settings → Android app).
      ...(require('fs').existsSync('./google-services.json') ? { googleServicesFile: './google-services.json' } : {}),
    },
    plugins: [
      ['expo-location', { locationWhenInUsePermission: LOCATION_TEXT }],
      ['expo-notifications', { color: '#E5322D' }],
      'expo-status-bar',
    ],
    extra: {
      eas: {
        // Filled in by `eas init`.
      },
    },
  },
};
