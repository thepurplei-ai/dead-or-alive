// Map with both people (and home), the distance, navigation buttons and the big SOS button.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Linking, StyleSheet, Animated, Platform } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { C, S } from '../theme';
import { T } from '../strings';
import { distanceMeters, formatDistance, ageMinutes, directionsUrl } from '../core';

const SOS_HOLD_MS = 2000;

export default function MapTab({
  me, partner, partnerName, home, onSetHome, sharing, locationDenied, mySos, onSos, onOk, notice,
}) {
  const map = useRef(null);
  const fitted = useRef(false);
  const [now, setNow] = useState(Date.now());
  const fill = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  // Zoom so both people (and home) are on screen, once, when we first know where they are.
  useEffect(() => {
    if (fitted.current || !map.current || !me) return;
    if (!partner) {
      map.current.animateToRegion({ latitude: me.lat, longitude: me.lng, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 400);
      return;
    }
    fitted.current = true;
    const pts = [me, partner].map((p) => ({ latitude: p.lat, longitude: p.lng }));
    map.current.fitToCoordinates(pts, { edgePadding: { top: 120, bottom: 320, left: 60, right: 60 }, animated: true });
  }, [me, partner]);

  const dist = distanceMeters(me, partner);
  const age = ageMinutes(partner?.ts, now);

  const holdStart = () => {
    Animated.timing(fill, { toValue: 1, duration: SOS_HOLD_MS, useNativeDriver: false }).start();
  };
  const holdEnd = () => {
    fill.stopAnimation();
    Animated.timing(fill, { toValue: 0, duration: 150, useNativeDriver: false }).start();
  };

  const initial = me
    ? { latitude: me.lat, longitude: me.lng, latitudeDelta: 0.02, longitudeDelta: 0.02 }
    : { latitude: 40.4168, longitude: -3.7038, latitudeDelta: 30, longitudeDelta: 30 };

  return (
    <View style={{ flex: 1 }}>
      <MapView
        ref={map} style={StyleSheet.absoluteFill} initialRegion={initial}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        showsUserLocation showsMyLocationButton={false} toolbarEnabled={false}
      >
        {partner && (
          <Marker coordinate={{ latitude: partner.lat, longitude: partner.lng }} title={partnerName} pinColor={C.partner} />
        )}
        {home && (
          <Marker coordinate={{ latitude: home.lat, longitude: home.lng }} title={T.map.home} pinColor={C.home} />
        )}
      </MapView>

      {/* Top card: where the other person is */}
      <View style={[S.card, st.top]}>
        <Text style={S.h2}>{partnerName}</Text>
        {partner ? (
          <Text style={S.body}>
            {dist != null ? T.map.away(formatDistance(dist)) + ' · ' : ''}{T.map.seen(age)}
          </Text>
        ) : (
          <Text style={S.body}>{T.map.noPartner(partnerName)}</Text>
        )}
        {locationDenied && <Text style={S.error}>{T.map.locationOff}</Text>}
        {!sharing && !locationDenied && <Text style={S.error}>{T.map.paused}</Text>}
        {notice && <Text style={[S.muted, { marginTop: 6 }]}>{notice}</Text>}
      </View>

      {/* Bottom: navigation + SOS */}
      <View style={st.bottom}>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Pressable
            style={[S.btn, { flex: 1, opacity: partner ? 1 : 0.4 }]} disabled={!partner}
            onPress={() => Linking.openURL(directionsUrl(partner))}
          >
            <Text style={S.btnText} numberOfLines={1}>{T.map.toPartner(partnerName)}</Text>
          </Pressable>
          <Pressable
            style={[S.btn, { flex: 1, backgroundColor: C.home }]}
            onPress={() => (home ? Linking.openURL(directionsUrl(home)) : onSetHome(null))}
          >
            <Text style={S.btnText}>{T.map.toHome}</Text>
          </Pressable>
        </View>
        <Pressable onPress={() => onSetHome(me)} style={{ alignSelf: 'flex-end', paddingVertical: 6 }}>
          <Text style={[S.muted, { color: C.home, fontWeight: '600' }]}>{T.map.setHome}</Text>
        </Pressable>

        {mySos ? (
          <View style={[S.card, { backgroundColor: C.sosSoft, borderColor: C.sos, gap: 10 }]}>
            <Text style={[S.h2, { color: C.sosDark }]}>{T.sos.sentTitle}</Text>
            <Text style={S.body}>{T.sos.sentText(partnerName)}</Text>
            <Pressable style={[S.btn, { backgroundColor: C.ok }]} onPress={onOk}>
              <Text style={S.btnText}>{T.sos.imOk}</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            onPressIn={holdStart} onPressOut={holdEnd}
            onLongPress={() => { holdEnd(); onSos(); }} delayLongPress={SOS_HOLD_MS}
            style={st.sos} accessibilityRole="button" accessibilityLabel={T.sos.hold}
          >
            <Animated.View
              style={[st.sosFill, { width: fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]}
            />
            <Text style={st.sosText}>{T.sos.button}</Text>
            <Text style={st.sosHint}>{T.sos.hold}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  top: { position: 'absolute', top: 12, left: 12, right: 12, gap: 4, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 10, elevation: 3 },
  bottom: { position: 'absolute', left: 12, right: 12, bottom: 12, gap: 6 },
  sos: {
    backgroundColor: C.sos, borderRadius: 24, height: 110, alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden', marginTop: 4, shadowColor: C.sos, shadowOpacity: 0.35, shadowRadius: 14, elevation: 6,
  },
  sosFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: C.sosDark },
  sosText: { color: '#fff', fontSize: 44, fontWeight: '900', letterSpacing: 4 },
  sosHint: { color: 'rgba(255,255,255,0.9)', fontSize: 13, marginTop: 2 },
});
