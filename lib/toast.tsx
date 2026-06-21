// lib/toast.tsx
// Lightweight, cross-platform (web + native) toast — a small sonner-style API.
// Call from anywhere (even outside React): toast.success('Tersimpan'), toast.error(msg, detail).
// Mount <Toaster /> once at the app root; it subscribes to the module store below.

import { Feather } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';

export type ToastType = 'success' | 'error' | 'info';
export interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
  description?: string;
}

type Listener = (toasts: ToastItem[]) => void;
let items: ToastItem[] = [];
const listeners = new Set<Listener>();
let counter = 0;

const emit = () => listeners.forEach(l => l([...items]));

const dismiss = (id: number) => {
  items = items.filter(t => t.id !== id);
  emit();
};

const push = (type: ToastType, message: string, description?: string) => {
  const id = ++counter;
  items = [...items, { id, type, message, description }];
  emit();
  setTimeout(() => dismiss(id), 3500);
  return id;
};

// Callable like sonner: toast('msg') plus toast.success/error/info(msg, description?).
export const toast = Object.assign((message: string, description?: string) => push('info', message, description), {
  success: (m: string, d?: string) => push('success', m, d),
  error: (m: string, d?: string) => push('error', m, d),
  info: (m: string, d?: string) => push('info', m, d),
  dismiss,
});

const THEME: Record<ToastType, { icon: any; color: string; bg: string }> = {
  success: { icon: 'check-circle', color: '#16A34A', bg: '#F0FDF4' },
  error: { icon: 'alert-circle', color: '#DC2626', bg: '#FEF2F2' },
  info: { icon: 'info', color: '#0F172A', bg: '#F8FAFC' },
};

export function Toaster() {
  const [list, setList] = useState<ToastItem[]>([]);
  const { width } = useWindowDimensions();
  const isWide = width >= 768; // desktop → bottom-center, mobile → top-center
  useEffect(() => {
    listeners.add(setList);
    return () => {
      listeners.delete(setList);
    };
  }, []);

  if (list.length === 0) return null;
  const posStyle = isWide ? ({ bottom: 24 } as const) : ({ top: Platform.OS === 'web' ? 16 : 50 } as const);
  return (
    <View
      style={[styles.wrap, Platform.OS === 'web' ? ({ position: 'fixed' } as any) : null, posStyle]}
      pointerEvents="box-none"
    >
      {list.map(t => {
        const th = THEME[t.type];
        return (
          <Animated.View
            key={t.id}
            entering={FadeInDown.duration(220)}
            exiting={FadeOutUp.duration(180)}
            style={{ width: '100%', maxWidth: 440, alignItems: 'stretch' }}
          >
            <Pressable
              onPress={() => dismiss(t.id)}
              style={[styles.toast, { backgroundColor: th.bg, borderColor: th.color }]}
            >
              <Feather name={th.icon} size={18} color={th.color} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.msg, { color: th.color }]} numberOfLines={3}>
                  {t.message}
                </Text>
                {!!t.description && (
                  <Text style={styles.desc} numberOfLines={4}>
                    {t.description}
                  </Text>
                )}
              </View>
            </Pressable>
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 16,
    zIndex: 99999,
    gap: 8,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    shadowColor: '#0F172A',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  msg: { fontSize: 13, fontWeight: '800' },
  desc: { fontSize: 12, color: '#475569', marginTop: 2 },
});
