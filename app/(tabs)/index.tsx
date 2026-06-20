import { Feather } from '@expo/vector-icons';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useProfile } from '../../lib/ProfileContext';

export default function Dashboard() {
  const { profile } = useProfile();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.welcome}>Selamat datang,</Text>
      <Text style={styles.name}>{profile?.full_name || 'Admin'}</Text>
      <Text style={styles.quote}>"Jadilah seperti petani, menanam dengan sungguh-sungguh, lalu menyerahkan hasil panen pada Tuhan."</Text>

      <View style={styles.statsCard}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>OVERVIEW HARI INI</Text>
          <Text style={styles.time}>00.57</Text>
        </View>
        <View style={styles.statsRow}>
          <StatItem label="SALES" value="0" unit="Nota" />
          <StatItem label="CASH" value="Rp 0" isRed />
          <StatItem label="DIGITAL" value="Rp 0" isRed />
        </View>
        <Text style={styles.onDuty}>ON DUTY</Text>
        <Text style={styles.noAbsen}>Belum ada absen masuk</Text>
      </View>

      <View style={styles.statusCard}>
        <View style={styles.statusHeader}>
          <Feather name="shield" size={20} color="#DC2626" />
          <Text style={styles.statusTitle}>STATUS KREDENSIAL</Text>
        </View>
        <View style={styles.badge}><Text style={styles.badgeText}>{profile?.role || 'OWNER'}</Text></View>
        <Text style={styles.statusDesc}>Akses <Text style={{fontWeight:'bold'}}>{profile?.role?.toLowerCase() || 'owner'}</Text> dikonfirmasi. Gunakan menu di samping untuk mengelola operasional toko.</Text>
      </View>
    </ScrollView>
  );
}

function StatItem({ label, value, unit, isRed }: any) {
  return (
    <View style={styles.statItem}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, isRed && { color: '#DC2626' }]}>{value} <Text style={styles.statUnit}>{unit}</Text></Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  content: { padding: 40 },
  welcome: { fontSize: 16, color: '#6B7280' },
  name: { fontSize: 36, fontWeight: '900', color: '#111827', marginBottom: 10 },
  quote: { fontStyle: 'italic', color: '#9CA3AF', textAlign: 'center', marginBottom: 40 },
  statsCard: { backgroundColor: '#FFF', borderRadius: 24, padding: 25, borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 20 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  cardTitle: { fontSize: 12, fontWeight: '800', color: '#4B5563' },
  time: { fontSize: 12, color: '#9CA3AF' },
  statsRow: { flexDirection: 'row', backgroundColor: '#F9FAFB', borderRadius: 16, padding: 20, marginBottom: 20 },
  statItem: { flex: 1, alignItems: 'center' },
  statLabel: { fontSize: 10, fontWeight: '700', color: '#9CA3AF', marginBottom: 5 },
  statValue: { fontSize: 20, fontWeight: '800', color: '#1F2937' },
  statUnit: { fontSize: 12, fontWeight: 'normal' },
  onDuty: { fontSize: 11, fontWeight: '800', color: '#DC2626', marginBottom: 5 },
  noAbsen: { fontSize: 13, color: '#9CA3AF', fontStyle: 'italic' },
  statusCard: { backgroundColor: '#FFF', borderRadius: 24, padding: 25, borderWidth: 1, borderColor: '#E5E7EB' },
  statusHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 15 },
  statusTitle: { fontSize: 12, fontWeight: '800', color: '#4B5563' },
  badge: { backgroundColor: '#DC2626', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8, alignSelf: 'flex-start', marginBottom: 15 },
  badgeText: { color: '#FFF', fontWeight: 'bold', fontSize: 11 },
  statusDesc: { color: '#6B7280', fontSize: 14, lineHeight: 22 }
});