// components/OfflineBanner.tsx
// Thin banner shown only while offline. On web it pins to the top of the
// viewport; on native it renders in normal flow wherever it is mounted.
import { Feather } from '@expo/vector-icons';
import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { useOnline } from '../lib/offline/OfflineContext';

const webFixed: any = { position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999 };

export default function OfflineBanner() {
  const online = useOnline();
  if (online) return null;

  return (
    <View style={[styles.banner, Platform.OS === 'web' ? webFixed : null]}>
      <Feather name="wifi-off" size={14} color="#FFFFFF" />
      <Text style={styles.text}>Tidak ada koneksi internet — perubahan dinonaktifkan sementara</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#DC2626',
  },
  text: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
});
