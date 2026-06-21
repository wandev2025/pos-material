import { Feather, Ionicons } from '@expo/vector-icons';
import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useProfile } from '../lib/ProfileContext';
import { forgetAccount, getRecentAccounts, type RecentAccount, rememberAccount } from '../lib/recentAccounts';
import { supabase, supabaseAnonKey, supabaseUrl } from '../lib/supabase';
import { toast } from '../lib/toast';

// Vercel-style account switcher pinned to the sidebar bottom: a trigger row that
// opens a drop-UP menu (Kelola Pengguna · Tambah Staff · Ganti Akun · Keluar).
export default function AccountMenu({ collapsed }: { collapsed?: boolean }) {
  const { profile, user } = useProfile() as any;
  const router = useRouter();
  const isManager = profile?.role === 'OWNER' || profile?.role === 'SUPERADMIN';

  const [menuOpen, setMenuOpen] = useState(false);
  const [switchOpen, setSwitchOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  // Remember the current account on this device for quick re-login later.
  useEffect(() => {
    if (user?.email && profile)
      rememberAccount({ email: user.email, name: profile.full_name || user.email, role: profile.role });
  }, [user?.email, profile?.id, profile?.full_name, profile?.role]);

  const initial = (profile?.full_name || user?.email || 'U').charAt(0).toUpperCase();

  const logout = async () => {
    await supabase.auth.signOut();
    setMenuOpen(false);
    setSwitchOpen(false);
    router.replace('/login' as any);
  };

  return (
    <>
      <TouchableOpacity
        style={[styles.trigger, collapsed && styles.triggerCollapsed]}
        onPress={() => setMenuOpen(true)}
        activeOpacity={0.85}
      >
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
        {!collapsed && (
          <>
            <View style={{ flex: 1 }}>
              <Text style={styles.name} numberOfLines={1}>
                {profile?.full_name || 'User'}
              </Text>
              <Text style={styles.role}>{profile?.role || ''}</Text>
            </View>
            <Ionicons name="chevron-expand" size={16} color="#94A3B8" />
          </>
        )}
      </TouchableOpacity>

      {/* DROP-UP MENU */}
      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.menuBackdrop} onPress={() => setMenuOpen(false)}>
          <View style={styles.menu}>
            <View style={styles.menuHeader}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initial}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>
                  {profile?.full_name || 'User'}
                </Text>
                <Text style={styles.email} numberOfLines={1}>
                  {user?.email}
                </Text>
              </View>
            </View>
            <View style={styles.divider} />
            {isManager && (
              <MenuItem
                icon="users"
                label="Kelola Pengguna"
                onPress={() => {
                  setMenuOpen(false);
                  router.push('/(tabs)/users' as any);
                }}
              />
            )}
            {isManager && (
              <MenuItem
                icon="user-plus"
                label="Tambah Staff"
                onPress={() => {
                  setMenuOpen(false);
                  setAddOpen(true);
                }}
              />
            )}
            <MenuItem
              icon="repeat"
              label="Ganti Akun"
              onPress={() => {
                setMenuOpen(false);
                setSwitchOpen(true);
              }}
            />
            <View style={styles.divider} />
            <MenuItem icon="log-out" label="Keluar" danger onPress={logout} />
          </View>
        </Pressable>
      </Modal>

      <SwitchAccountModal
        visible={switchOpen}
        onClose={() => setSwitchOpen(false)}
        currentEmail={user?.email}
        onAddOther={logout}
      />
      <AddStaffModal visible={addOpen} onClose={() => setAddOpen(false)} />
    </>
  );
}

function MenuItem({
  icon,
  label,
  onPress,
  danger,
}: {
  icon: any;
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <TouchableOpacity style={styles.menuItem} onPress={onPress}>
      <Feather name={icon} size={16} color={danger ? '#DC2626' : '#475569'} />
      <Text style={[styles.menuItemText, danger && { color: '#DC2626' }]}>{label}</Text>
    </TouchableOpacity>
  );
}

// Lists accounts remembered on this device; pick one and type only the password.
function SwitchAccountModal({
  visible,
  onClose,
  currentEmail,
  onAddOther,
}: {
  visible: boolean;
  onClose: () => void;
  currentEmail?: string;
  onAddOther: () => void;
}) {
  const [accounts, setAccounts] = useState<RecentAccount[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) {
      setAccounts(getRecentAccounts());
      setPicked(null);
      setPassword('');
    }
  }, [visible]);

  const others = accounts.filter(a => a.email.toLowerCase() !== (currentEmail || '').toLowerCase());

  const doSwitch = async (email: string) => {
    if (!password) return;
    setBusy(true);
    // signInWithPassword swaps the active session in place — no full logout needed.
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      toast.error('Password salah');
      return;
    }
    toast.success('Berhasil ganti akun');
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.centerBackdrop} onPress={onClose}>
        <Pressable style={styles.dialog} onPress={() => {}}>
          <Text style={styles.dialogTitle}>Ganti Akun</Text>
          <Text style={styles.dialogSub}>Akun di komputer ini</Text>
          <ScrollView style={{ maxHeight: 300 }} keyboardShouldPersistTaps="handled">
            {others.map(a => (
              <View key={a.email}>
                <TouchableOpacity
                  style={styles.acctRow}
                  onPress={() => {
                    setPicked(picked === a.email ? null : a.email);
                    setPassword('');
                  }}
                >
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{(a.name || a.email).charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name} numberOfLines={1}>
                      {a.name}
                    </Text>
                    <Text style={styles.email} numberOfLines={1}>
                      {a.email} · {a.role}
                    </Text>
                  </View>
                  <Feather name={picked === a.email ? 'chevron-up' : 'chevron-down'} size={16} color="#94A3B8" />
                </TouchableOpacity>
                {picked === a.email && (
                  <View style={styles.pwRow}>
                    <TextInput
                      style={styles.pwInput}
                      placeholder="Password"
                      placeholderTextColor="#94A3B8"
                      secureTextEntry
                      value={password}
                      onChangeText={setPassword}
                      autoFocus
                      onSubmitEditing={() => doSwitch(a.email)}
                    />
                    <TouchableOpacity style={styles.pwBtn} onPress={() => doSwitch(a.email)} disabled={busy}>
                      {busy ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <Text style={styles.pwBtnText}>Masuk</Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        forgetAccount(a.email);
                        setAccounts(getRecentAccounts());
                      }}
                      style={{ padding: 6 }}
                    >
                      <Feather name="x" size={16} color="#CBD5E1" />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ))}
            {others.length === 0 && (
              <Text style={styles.emptyNote}>Belum ada akun lain tersimpan di komputer ini.</Text>
            )}
          </ScrollView>
          <TouchableOpacity style={styles.outlineBtn} onPress={onAddOther}>
            <Feather name="plus" size={16} color="#DC2626" />
            <Text style={styles.outlineBtnText}>Masuk akun lain</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// Creates a STAFF account via a throwaway client so the owner stays logged in.
function AddStaffModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) {
      setName('');
      setEmail('');
      setPassword('');
    }
  }, [visible]);

  const create = async () => {
    if (!name.trim() || !email.trim() || password.length < 6) {
      toast.error('Lengkapi nama, email, dan password (min 6 karakter).');
      return;
    }
    setBusy(true);
    // A separate client (persistSession:false) so signUp does NOT replace the owner's session.
    const tmp = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        storageKey: 'pos-staff-create',
      },
    });
    const { error } = await tmp.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: name.trim() } },
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Akun staff "${name.trim()}" dibuat`);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.centerBackdrop} onPress={onClose}>
        <Pressable style={styles.dialog} onPress={() => {}}>
          <Text style={styles.dialogTitle}>Tambah Staff</Text>
          <Text style={styles.dialogSub}>Akun baru dengan peran STAFF</Text>
          <Text style={styles.fieldLabel}>Nama</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Nama staff"
            placeholderTextColor="#94A3B8"
          />
          <Text style={styles.fieldLabel}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="email@toko.com"
            placeholderTextColor="#94A3B8"
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <Text style={styles.fieldLabel}>Password Sementara</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="min. 6 karakter"
            placeholderTextColor="#94A3B8"
            secureTextEntry
          />
          <TouchableOpacity style={styles.primaryBtn} onPress={create} disabled={busy}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>BUAT AKUN STAFF</Text>}
          </TouchableOpacity>
          <Text style={styles.note}>
            Beri tahu staff email & password ini untuk login. Atur peran lanjutan di Kelola Pengguna.
          </Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  triggerCollapsed: { justifyContent: 'center', paddingHorizontal: 0 },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: '#DC2626',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { color: '#FFF', fontWeight: '900', fontSize: 16 },
  name: { fontSize: 14, fontWeight: '800', color: '#0F172A' },
  role: { fontSize: 11, fontWeight: '700', color: '#94A3B8', letterSpacing: 0.5 },
  email: { fontSize: 11, color: '#64748B', marginTop: 1 },

  menuBackdrop: { flex: 1 },
  menu: {
    position: 'absolute',
    left: 16,
    bottom: 80,
    width: 236,
    backgroundColor: '#FFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingVertical: 6,
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
  },
  menuHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10 },
  divider: { height: 1, backgroundColor: '#F1F5F9', marginVertical: 4 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 11 },
  menuItemText: { fontSize: 13, fontWeight: '700', color: '#334155' },

  centerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  dialog: { width: '100%', maxWidth: 400, backgroundColor: '#FFF', borderRadius: 18, padding: 22 },
  dialogTitle: { fontSize: 18, fontWeight: '900', color: '#0F172A' },
  dialogSub: { fontSize: 12, color: '#94A3B8', marginTop: 2, marginBottom: 14 },
  acctRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  pwRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 10, paddingLeft: 50 },
  pwInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    color: '#0F172A',
    outlineStyle: 'none' as any,
  },
  pwBtn: {
    backgroundColor: '#DC2626',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pwBtnText: { color: '#FFF', fontWeight: '800', fontSize: 12 },
  emptyNote: { color: '#94A3B8', fontSize: 13, paddingVertical: 16, textAlign: 'center' },
  outlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#FECACA',
  },
  outlineBtnText: { color: '#DC2626', fontWeight: '800', fontSize: 13 },

  fieldLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#94A3B8',
    textTransform: 'uppercase',
    marginBottom: 6,
    marginTop: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    color: '#0F172A',
    marginBottom: 10,
    outlineStyle: 'none' as any,
  },
  primaryBtn: { backgroundColor: '#DC2626', borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 6 },
  primaryBtnText: { color: '#FFF', fontWeight: '900', fontSize: 14, letterSpacing: 0.5 },
  note: { fontSize: 11, color: '#94A3B8', marginTop: 12, lineHeight: 16 },
});
