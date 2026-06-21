// lib/confirm.tsx
// Global confirm dialog — a styled modal replacing window.confirm / Alert.alert.
// Call from anywhere: if (await confirm({ title, message, danger: true })) { ... }
// Mount <ConfirmHost /> once at the app root (next to <Toaster />).

import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}
interface Pending extends ConfirmOptions {
  id: number;
  resolve: (ok: boolean) => void;
}

type Listener = (c: Pending | null) => void;
let current: Pending | null = null;
const listeners = new Set<Listener>();
let counter = 0;
const emit = () =>
  listeners.forEach(l => {
    l(current);
  });

export function confirm(opts: ConfirmOptions): Promise<boolean> {
  return new Promise(resolve => {
    current?.resolve(false); // cancel any already-open prompt
    current = { ...opts, id: ++counter, resolve };
    emit();
  });
}

function settle(ok: boolean) {
  current?.resolve(ok);
  current = null;
  emit();
}

export function ConfirmHost() {
  const [c, setC] = useState<Pending | null>(null);
  useEffect(() => {
    listeners.add(setC);
    return () => {
      listeners.delete(setC);
    };
  }, []);

  return (
    <Modal visible={!!c} transparent animationType="none" onRequestClose={() => settle(false)}>
      <Pressable style={styles.backdrop} onPress={() => settle(false)}>
        <Pressable style={styles.dialog} onPress={() => {}}>
          <Text style={styles.title}>{c?.title}</Text>
          {!!c?.message && <Text style={styles.message}>{c.message}</Text>}
          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => settle(false)}>
              <Text style={styles.cancelText}>{c?.cancelText || 'Batal'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.confirmBtn, c?.danger && styles.dangerBtn]} onPress={() => settle(true)}>
              <Text style={styles.confirmText}>{c?.confirmText || 'Ya'}</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  dialog: { width: '100%', maxWidth: 400, backgroundColor: '#FFF', borderRadius: 18, padding: 24 },
  title: { fontSize: 18, fontWeight: '900', color: '#0F172A' },
  message: { fontSize: 14, color: '#475569', marginTop: 8, lineHeight: 20 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 22 },
  cancelBtn: { paddingHorizontal: 18, paddingVertical: 11, borderRadius: 12, backgroundColor: '#F1F5F9' },
  cancelText: { fontSize: 13, fontWeight: '800', color: '#475569' },
  confirmBtn: { paddingHorizontal: 18, paddingVertical: 11, borderRadius: 12, backgroundColor: '#0F172A' },
  dangerBtn: { backgroundColor: '#DC2626' },
  confirmText: { fontSize: 13, fontWeight: '800', color: '#FFF' },
});
