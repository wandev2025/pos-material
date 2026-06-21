import { Feather } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, Platform, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, useWindowDimensions, View
} from 'react-native';
import { formatRupiah } from '../../lib/format';
import { parseNum } from '../../lib/number';
import { useOnline } from '../../lib/offline/OfflineContext';
import { useProfile } from '../../lib/ProfileContext';
import { supabase } from '../../lib/supabase';
import { toast } from '../../lib/toast';

interface CashSession {
  id: number;
  employee_name: string;
  opening_float: number;
  opened_at: string;
  closed_at: string | null;
  expected_cash: number | null;
  counted_cash: number | null;
  variance: number | null;
  status: 'OPEN' | 'CLOSED';
  note: string | null;
}

const fmtDateTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

export default function KasirScreen() {
  const { profile } = useProfile();
  const { width } = useWindowDimensions();
  const isDesktop = width > 900;
  const online = useOnline();
  const me = profile?.full_name || '';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [session, setSession] = useState<CashSession | null>(null);
  const [cashSales, setCashSales] = useState(0);
  const [recentClosed, setRecentClosed] = useState<CashSession[]>([]);
  const [closeResult, setCloseResult] = useState<CashSession | null>(null);

  // Form state
  const [openingFloat, setOpeningFloat] = useState('');
  const [countedCash, setCountedCash] = useState('');

  const expectedLive = useMemo(
    () => (session ? (session.opening_float || 0) + cashSales : 0),
    [session, cashSales]
  );
  const varianceLive = useMemo(
    () => parseNum(countedCash) - expectedLive,
    [countedCash, expectedLive]
  );

  const fetchData = async () => {
    if (!me) { setLoading(false); return; }
    setLoading(true);
    try {
      // Open session + recent closed shifts are independent — fetch together.
      const [{ data: openData }, { data: closedData }] = await Promise.all([
        supabase.from('cash_sessions')
          .select('*').eq('employee_name', me).eq('status', 'OPEN')
          .order('opened_at', { ascending: false }).limit(1),
        supabase.from('cash_sessions')
          .select('*').eq('employee_name', me).eq('status', 'CLOSED')
          .order('closed_at', { ascending: false }).limit(10),
      ]);
      const open = (openData?.[0] as CashSession) ?? null;
      setSession(open);
      setRecentClosed((closedData as CashSession[]) ?? []);

      // Live cash sales since this shift opened (this cashier, cash/tunai only)
      if (open) {
        const { data: salesData } = await supabase.from('sales')
          .select('total_amount').eq('employee_name', me)
          .gte('created_at', open.opened_at)
          .or('payment_method.ilike.%tunai%,payment_method.ilike.%cash%');
        setCashSales((salesData ?? []).reduce((a: number, s: any) => a + (s.total_amount || 0), 0));
      } else {
        setCashSales(0);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); /* eslint-disable-next-line */ }, [me]);

  const handleOpenSession = async () => {
    if (!online || saving) return;
    setSaving(true);
    const { error } = await supabase.rpc('open_cash_session', {
      p: { employee_name: me, opening_float: parseNum(openingFloat) },
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    setOpeningFloat('');
    setCloseResult(null);
    fetchData();
  };

  const handleCloseSession = async () => {
    if (!online || saving || !session) return;
    if (!countedCash) return toast.error('Masukkan jumlah uang fisik di laci');
    const counted = parseNum(countedCash);

    const doClose = async () => {
      setSaving(true);
      const { data, error } = await supabase.rpc('close_cash_session', {
        p: { session_id: session.id, counted_cash: counted },
      });
      setSaving(false);
      if (error) return toast.error(error.message);
      setCountedCash('');
      setCloseResult(data as CashSession);
      fetchData();
    };

    if (Platform.OS === 'web') {
      if (confirm('Tutup kasir sekarang? Sesi tidak dapat dibuka kembali.')) doClose();
    } else {
      Alert.alert('Tutup Kasir', 'Tutup kasir sekarang? Sesi tidak dapat dibuka kembali.', [
        { text: 'Batal' },
        { text: 'Tutup Kasir', style: 'destructive', onPress: doClose },
      ]);
    }
  };

  if (!me) {
    return <View style={styles.center}><Text style={styles.denied}>Profil kasir tidak ditemukan.</Text></View>;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingHorizontal: isDesktop ? 20 : 14, paddingTop: 16, paddingBottom: 60, maxWidth: 640, alignSelf: 'center', width: '100%' }}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>Tutup Kasir</Text>
          <Text style={styles.subtitle}>Kasir: {me}</Text>
        </View>
        <TouchableOpacity style={styles.refreshBtn} onPress={fetchData}>
          <Feather name="refresh-cw" size={18} color="#FFF" />
        </TouchableOpacity>
      </View>

      {loading ? <ActivityIndicator style={{ marginTop: 50 }} color="#DC2626" /> : (
        <>
          {/* Result of the just-closed shift */}
          {closeResult && (
            <View style={styles.resultCard}>
              <View style={styles.rowBetween}>
                <Text style={styles.resultTitle}>SESI DITUTUP</Text>
                <Feather name="check-circle" size={20} color="#059669" />
              </View>
              <View style={styles.resLine}>
                <Text style={styles.resLabel}>Kas Diharapkan</Text>
                <Text style={styles.resVal}>{formatRupiah(closeResult.expected_cash || 0)}</Text>
              </View>
              <View style={styles.resLine}>
                <Text style={styles.resLabel}>Kas Dihitung</Text>
                <Text style={styles.resVal}>{formatRupiah(closeResult.counted_cash || 0)}</Text>
              </View>
              <View style={[styles.resLine, styles.resLineTop]}>
                <Text style={styles.resLabelStrong}>Selisih</Text>
                <Text style={[styles.resVarVal, { color: (closeResult.variance || 0) === 0 ? '#059669' : (closeResult.variance || 0) > 0 ? '#2563EB' : '#DC2626' }]}>
                  {(closeResult.variance || 0) > 0 ? '+' : ''}{formatRupiah(closeResult.variance || 0)}
                </Text>
              </View>
            </View>
          )}

          {/* No open session -> BUKA KASIR */}
          {!session ? (
            <View style={styles.card}>
              <View style={styles.cardHead}>
                <Feather name="unlock" size={18} color="#DC2626" />
                <Text style={styles.cardTitle}>BUKA KASIR</Text>
              </View>
              <Text style={styles.hint}>Mulai shift dengan menghitung uang modal awal (kembalian) di dalam laci.</Text>

              <Text style={styles.label}>Modal Awal (Rp)</Text>
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                placeholder="0"
                value={openingFloat}
                onChangeText={setOpeningFloat}
              />
              <Text style={styles.preview}>Modal: <Text style={styles.previewStrong}>{formatRupiah(parseNum(openingFloat))}</Text></Text>

              <TouchableOpacity
                style={[styles.primaryBtn, (!online || saving) && styles.btnDisabled]}
                onPress={handleOpenSession}
                disabled={!online || saving}
              >
                {saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.btnText}>BUKA KASIR</Text>}
              </TouchableOpacity>
              {!online && <Text style={styles.offlineHint}>Tidak ada koneksi internet — buka kasir dinonaktifkan.</Text>}
            </View>
          ) : (
            <>
              {/* OPEN session -> live expected + TUTUP KASIR */}
              <View style={styles.heroCard}>
                <Text style={styles.heroLabel}>PERKIRAAN KAS DI LACI</Text>
                <Text style={styles.heroVal} numberOfLines={1} adjustsFontSizeToFit>{formatRupiah(expectedLive)}</Text>
                <Text style={styles.heroSub}>Shift dibuka {fmtDateTime(session.opened_at)}</Text>
              </View>

              <View style={styles.card}>
                <View style={styles.cardHead}>
                  <Feather name="activity" size={18} color="#DC2626" />
                  <Text style={styles.cardTitle}>RINCIAN SHIFT</Text>
                </View>
                <View style={styles.resLine}>
                  <Text style={styles.resLabel}>Modal Awal</Text>
                  <Text style={styles.resVal}>{formatRupiah(session.opening_float || 0)}</Text>
                </View>
                <View style={styles.resLine}>
                  <Text style={styles.resLabel}>Penjualan Tunai</Text>
                  <Text style={styles.resVal}>{formatRupiah(cashSales)}</Text>
                </View>
                <View style={[styles.resLine, styles.resLineTop]}>
                  <Text style={styles.resLabelStrong}>Perkiraan Total</Text>
                  <Text style={styles.resVarVal}>{formatRupiah(expectedLive)}</Text>
                </View>
                <Text style={styles.note}>Perkiraan ini dari penjualan tunai shift ini. Total final (termasuk pembayaran piutang & retur) dihitung saat kasir ditutup.</Text>
              </View>

              <View style={styles.card}>
                <View style={styles.cardHead}>
                  <Feather name="lock" size={18} color="#DC2626" />
                  <Text style={styles.cardTitle}>TUTUP KASIR</Text>
                </View>
                <Text style={styles.hint}>Hitung uang fisik di laci, lalu masukkan jumlahnya untuk menghitung selisih.</Text>

                <Text style={styles.label}>Uang Fisik Dihitung (Rp)</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  placeholder="0"
                  value={countedCash}
                  onChangeText={setCountedCash}
                />

                {countedCash !== '' && (
                  <View style={styles.varianceBox}>
                    <Text style={styles.resLabel}>Selisih (Counted - Perkiraan)</Text>
                    <Text style={[styles.varianceVal, { color: varianceLive === 0 ? '#059669' : varianceLive > 0 ? '#2563EB' : '#DC2626' }]}>
                      {varianceLive > 0 ? '+' : ''}{formatRupiah(varianceLive)}
                    </Text>
                  </View>
                )}

                <TouchableOpacity
                  style={[styles.primaryBtn, { backgroundColor: '#0F172A' }, (!online || saving) && styles.btnDisabled]}
                  onPress={handleCloseSession}
                  disabled={!online || saving}
                >
                  {saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.btnText}>TUTUP KASIR SEKARANG</Text>}
                </TouchableOpacity>
                {!online && <Text style={styles.offlineHint}>Tidak ada koneksi internet — tutup kasir dinonaktifkan.</Text>}
              </View>
            </>
          )}

          {/* Recent closed shifts */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>RIWAYAT SHIFT</Text>
            {recentClosed.length === 0 ? (
              <Text style={styles.empty}>Belum ada riwayat tutup kasir.</Text>
            ) : recentClosed.map((s) => {
              const v = s.variance || 0;
              const vColor = v === 0 ? '#059669' : v > 0 ? '#2563EB' : '#DC2626';
              return (
                <View key={s.id} style={styles.listRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.listName}>{fmtDateTime(s.closed_at)}</Text>
                    <Text style={styles.listSub}>Diharapkan {formatRupiah(s.expected_cash || 0)} • Dihitung {formatRupiah(s.counted_cash || 0)}</Text>
                  </View>
                  <Text style={[styles.listVal, { color: vColor }]}>{v > 0 ? '+' : ''}{formatRupiah(v)}</Text>
                </View>
              );
            })}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  denied: { color: '#94A3B8', fontWeight: '700' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 24, fontWeight: '900', color: '#111827' },
  subtitle: { fontSize: 13, color: '#64748B', fontWeight: '600', marginTop: 2 },
  refreshBtn: { width: 45, height: 45, backgroundColor: '#64748B', borderRadius: 12, justifyContent: 'center', alignItems: 'center' },

  heroCard: { backgroundColor: '#0F172A', borderRadius: 16, padding: 18, marginBottom: 16 },
  heroLabel: { fontSize: 9, fontWeight: '800', color: '#94A3B8', marginBottom: 6, letterSpacing: 1 },
  heroVal: { fontSize: 30, fontWeight: '900', color: '#FFF', marginTop: 2 },
  heroSub: { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 6, fontWeight: '600' },

  card: { backgroundColor: '#FFF', borderRadius: 16, padding: 18, marginBottom: 16, borderWidth: 1, borderColor: '#F1F5F9' },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  cardTitle: { fontSize: 11, fontWeight: '900', color: '#94A3B8', letterSpacing: 1, marginBottom: 12 },

  hint: { fontSize: 12, color: '#64748B', marginBottom: 14, lineHeight: 17 },
  label: { fontSize: 11, fontWeight: '800', color: '#94A3B8', marginBottom: 8, textTransform: 'uppercase' },
  input: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, padding: 14, fontSize: 18, fontWeight: '800', color: '#111827', marginBottom: 10 },
  preview: { fontSize: 13, color: '#64748B', marginBottom: 14 },
  previewStrong: { fontWeight: '900', color: '#111827' },

  primaryBtn: { backgroundColor: '#DC2626', padding: 16, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  btnDisabled: { opacity: 0.45 },
  btnText: { color: '#FFF', fontWeight: '900', fontSize: 14, letterSpacing: 0.5 },
  offlineHint: { fontSize: 11, color: '#B45309', textAlign: 'center', marginTop: 10, fontWeight: '600' },

  resLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  resLineTop: { borderTopWidth: 1, borderTopColor: '#F1F5F9', marginTop: 4, paddingTop: 12 },
  resLabel: { fontSize: 13, color: '#64748B', fontWeight: '600' },
  resLabelStrong: { fontSize: 14, color: '#1F2937', fontWeight: '800' },
  resVal: { fontSize: 14, fontWeight: '700', color: '#1F2937' },
  resVarVal: { fontSize: 16, fontWeight: '900', color: '#0F172A' },

  resultCard: { backgroundColor: '#F0FDF4', borderRadius: 16, padding: 18, marginBottom: 16, borderWidth: 1, borderColor: '#BBF7D0' },
  resultTitle: { fontSize: 11, fontWeight: '900', color: '#166534', letterSpacing: 1 },

  varianceBox: { backgroundColor: '#F8FAFC', borderRadius: 12, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: '#E2E8F0', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  varianceVal: { fontSize: 18, fontWeight: '900' },

  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  note: { fontSize: 10, color: '#94A3B8', fontStyle: 'italic', marginTop: 10, lineHeight: 14 },
  empty: { color: '#94A3B8', fontStyle: 'italic', paddingVertical: 8 },
  listRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F8FAFC', gap: 10 },
  listName: { fontSize: 14, fontWeight: '700', color: '#1F2937' },
  listSub: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  listVal: { fontSize: 14, fontWeight: '900' },
});
