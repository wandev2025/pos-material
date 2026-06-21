import { Feather } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { confirm } from '../../lib/confirm';
import { type Role, useProfile } from '../../lib/ProfileContext';
import { supabase } from '../../lib/supabase';
import { toast } from '../../lib/toast';

interface UserRow {
  id: string;
  full_name: string | null;
  role: Role;
}

const ROLE_COLORS: Record<Role, string> = {
  SUPERADMIN: '#7C3AED',
  OWNER: '#DC2626',
  ADMIN: '#2563EB',
  STAFF: '#64748B',
};

// Higher rank may remove lower rank (never equal/higher, never self).
const ROLE_RANK: Record<Role, number> = { SUPERADMIN: 4, OWNER: 3, ADMIN: 2, STAFF: 1 };

export default function UsersScreen() {
  const { profile, user } = useProfile();
  const { width } = useWindowDimensions();
  const isDesktop = width > 768;
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<UserRow[]>([]);

  const isSuperadmin = profile?.role === 'SUPERADMIN';
  const isManager = isSuperadmin || profile?.role === 'OWNER';

  // A superadmin can grant OWNER; an owner can only grant ADMIN / STAFF.
  const assignable: Role[] = isSuperadmin ? ['OWNER', 'ADMIN', 'STAFF'] : ['ADMIN', 'STAFF'];

  const fetchUsers = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('profiles').select('id, full_name, role').order('full_name');
    if (error) toast.error(error.message);
    if (data) setUsers(data as UserRow[]);
    setLoading(false);
  };

  useEffect(() => {
    if (isManager) fetchUsers();
  }, [isManager]);

  const changeRole = async (target: UserRow, role: Role) => {
    if (target.role === role) return;
    if (target.role === 'SUPERADMIN' && !isSuperadmin) {
      return toast.error('Hanya superadmin yang dapat mengubah superadmin.');
    }
    const apply = async () => {
      const { error } = await supabase.from('profiles').update({ role }).eq('id', target.id);
      if (error) toast.error(error.message);
      else fetchUsers();
    };
    const msg = `Ubah ${target.full_name || 'pengguna'} menjadi ${role}?`;
    if (await confirm({ title: 'Ubah Peran', message: msg, confirmText: 'Ubah' })) apply();
  };

  const removeUser = async (target: UserRow) => {
    const ok = await confirm({
      title: 'Hapus Pengguna',
      message: `Hapus akun "${target.full_name || 'pengguna'}" secara permanen? Tindakan ini tidak dapat dibatalkan.`,
      confirmText: 'Hapus',
      danger: true,
    });
    if (!ok) return;
    const { error } = await supabase.rpc('remove_user', { p_target: target.id });
    if (error) return toast.error(error.message);
    toast.success('Pengguna dihapus');
    fetchUsers();
  };

  if (!isManager) {
    return (
      <View style={styles.center}>
        <Text style={styles.denied}>Akses Manajer Diperlukan</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Manajemen Pengguna</Text>
        <TouchableOpacity style={styles.refreshBtn} onPress={fetchUsers}>
          <Feather name="refresh-cw" size={16} color="#FFF" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 50 }} color="#DC2626" />
      ) : (
        <FlatList
          data={users}
          keyExtractor={u => u.id}
          contentContainerStyle={{
            paddingHorizontal: isDesktop ? 20 : 14,
            paddingTop: 16,
            paddingBottom: isDesktop ? 16 : 120,
          }}
          ListEmptyComponent={<Text style={styles.empty}>Belum ada pengguna.</Text>}
          renderItem={({ item }) => {
            const isSelf = item.id === user?.id;
            const locked = isSelf || (item.role === 'SUPERADMIN' && !isSuperadmin);
            const canRemove = !isSelf && (ROLE_RANK[profile?.role as Role] ?? 0) > (ROLE_RANK[item.role] ?? 0);
            return (
              <Animated.View style={styles.card} entering={FadeIn.duration(180)}>
                <View style={styles.cardTop}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{(item.full_name || '?').charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>
                      {item.full_name || 'Tanpa Nama'}
                      {isSelf ? ' (Anda)' : ''}
                    </Text>
                    <Text style={[styles.roleTag, { color: ROLE_COLORS[item.role] }]}>{item.role}</Text>
                  </View>
                  {canRemove && (
                    <TouchableOpacity onPress={() => removeUser(item)} style={styles.removeBtn}>
                      <Feather name="trash-2" size={16} color="#DC2626" />
                    </TouchableOpacity>
                  )}
                </View>
                {locked ? (
                  <Text style={styles.lockedNote}>
                    {isSelf ? 'Anda tidak dapat mengubah peran sendiri.' : 'Hanya superadmin yang dapat mengubah ini.'}
                  </Text>
                ) : (
                  <View style={styles.chipRow}>
                    {assignable.map(r => (
                      <TouchableOpacity
                        key={r}
                        onPress={() => changeRole(item, r)}
                        style={[
                          styles.chip,
                          item.role === r && { backgroundColor: ROLE_COLORS[r], borderColor: ROLE_COLORS[r] },
                        ]}
                      >
                        <Text style={[styles.chipText, item.role === r && { color: '#FFF' }]}>{r}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </Animated.View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  denied: { color: '#94A3B8', fontWeight: '700' },
  header: {
    padding: 20,
    backgroundColor: '#FFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  title: { fontSize: 18, fontWeight: '900', color: '#111827' },
  refreshBtn: {
    width: 38,
    height: 38,
    backgroundColor: '#64748B',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  empty: { textAlign: 'center', color: '#94A3B8', marginTop: 40 },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  cardTop: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  avatarText: { color: '#FFF', fontWeight: '900', fontSize: 16 },
  name: { fontSize: 15, fontWeight: '800', color: '#1F2937' },
  roleTag: { fontSize: 11, fontWeight: '900', marginTop: 2, letterSpacing: 0.5 },
  removeBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#FEF2F2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  lockedNote: { fontSize: 11, color: '#94A3B8', fontStyle: 'italic', marginTop: 12 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  chipText: { fontSize: 12, fontWeight: '800', color: '#475569' },
});
