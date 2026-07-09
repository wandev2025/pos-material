import { Feather, Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useProfile } from '../../lib/ProfileContext';
import { supabase } from '../../lib/supabase';
import { toast } from '../../lib/toast';

const MONTHS_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

const formatIDR = (n: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n || 0);

const formatShortNum = (val: number) => {
  if (val >= 1000000) return (val / 1000000).toFixed(1) + 'jt';
  if (val >= 1000) return (val / 1000).toFixed(0) + 'k';
  return val.toString();
};

interface SaleRow {
  id: number;
  total_amount: number;
  payment_method: string;
  customer_name: string;
  status: 'PAID' | 'PARTIAL' | 'UNPAID';
  down_payment: number;
  discount?: number;
  employee_name: string;
  created_at: string;
}

interface ExpenseRow {
  id: string;
  tanggal: string;
  jenis: string;
  judul: string;
  total_pengeluaran: number;
}

interface InventoryItem {
  item_name: string;
  quantity: number;
  min_stock: number;
}

export default function LaporanScreen() {
  const { profile } = useProfile();
  const { width } = useWindowDimensions();
  const isDesktop = width > 768;
  const isManager = profile?.role === 'SUPERADMIN' || profile?.role === 'OWNER';

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showPeriodPicker, setShowPeriodPicker] = useState(false);
  const [pickerYear, setPickerYear] = useState(new Date().getFullYear());
  const [showAllLowStock, setShowAllLowStock] = useState(false);

  const [sales, setSales] = useState<SaleRow[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [lowStock, setLowStock] = useState<InventoryItem[]>([]);
  const [items, setItems] = useState<{ item_name: string; quantity: number; price_at_sale: number }[]>([]);
  const [receivablesData, setReceivablesData] = useState<SaleRow[]>([]);
  const [workerStats, setWorkerStats] = useState<any[]>([]);

  const monthName = currentDate.toLocaleString('id-ID', { month: 'long', year: 'numeric' });

  const loadData = async () => {
    if (!isManager) return;
    setLoading(true);
    try {
      const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).toISOString();
      const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59).toISOString();

      const [salesRes, expRes, invRes, recvRes, attRes, workersRes] = await Promise.all([
        supabase.from('sales').select('*').gte('created_at', startOfMonth).lte('created_at', endOfMonth).order('created_at'),
        supabase.from('expenses').select('*').gte('tanggal', startOfMonth.split('T')[0]).lte('tanggal', endOfMonth.split('T')[0]),
        supabase.from('inventory').select('item_name, quantity, min_stock'),
        supabase.from('sales').select('*').neq('status', 'PAID').order('created_at', { ascending: false }),
        supabase.from('attendance').select('*').gte('tanggal', startOfMonth.split('T')[0]).lte('tanggal', endOfMonth.split('T')[0]),
        supabase.from('workers').select('*')
      ]);

      const salesRows = (salesRes.data as SaleRow[]) || [];
      setSales(salesRows);
      setExpenses((expRes.data as ExpenseRow[]) || []);
      setLowStock((invRes.data as any[] || []).filter(i => i.quantity <= i.min_stock));
      setReceivablesData((recvRes.data as SaleRow[]) || []);

      // Calculate Worker Stats
      const attData = attRes.data || [];
      const workerList = workersRes.data || [];
      const stats = workerList.map(w => {
          const days = attData.filter(a => a.worker_id === w.id).length;
          // Sum paid from expenses where title contains worker name and type is Gaji
          const paid = (expRes.data || [])
            .filter(e => e.jenis === 'Gaji' && e.judul.includes(w.name))
            .reduce((sum, e) => sum + (Number(e.total_pengeluaran) || 0), 0);
          return { name: w.name, days, paid };
      }).filter(s => s.days > 0 || s.paid > 0);
      setWorkerStats(stats);

      const ids = salesRows.map(s => s.id);
      if (ids.length) {
        const { data: itemsData } = await supabase.from('sale_items').select('item_name, quantity, price_at_sale').in('sale_id', ids);
        setItems((itemsData as any[]) || []);
      } else {
        setItems([]);
      }
    } catch (error) {
      toast.error("Gagal memuat data laporan");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { loadData(); }, [currentDate]);

  const summary = useMemo(() => {
    const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
    let totalRevenue = 0, totalCash = 0, totalCredit = 0, totalDigital = 0;

    const dailyCash: Record<number, number> = {};
    const dailyDigital: Record<number, number> = {};
    const dailyTempo: Record<number, number> = {};
    const dailyExp: Record<number, number> = {};

    sales.forEach(s => {
      const day = new Date(s.created_at).getDate();
      const amt = s.total_amount || 0;
      totalRevenue += amt;

      const method = (s.payment_method || 'Lainnya').toLowerCase();
      if (method.includes('cash') || method.includes('tunai')) {
        totalCash += amt;
        dailyCash[day] = (dailyCash[day] || 0) + amt;
      } else if (method.includes('tempo')) {
        totalCredit += amt;
        dailyTempo[day] = (dailyTempo[day] || 0) + amt;
      } else {
        totalDigital += amt;
        dailyDigital[day] = (dailyDigital[day] || 0) + amt;
      }
    });

    expenses.forEach(e => {
      const day = new Date(e.tanggal).getDate();
      dailyExp[day] = (dailyExp[day] || 0) + (Number(e.total_pengeluaran) || 0);
    });

    const cashPoints = [], digiPoints = [], tempoPoints = [], expPoints = [];
    for (let i = 1; i <= daysInMonth; i++) {
      cashPoints.push({ day: i, value: dailyCash[i] || 0 });
      digiPoints.push({ day: i, value: dailyDigital[i] || 0 });
      tempoPoints.push({ day: i, value: dailyTempo[i] || 0 });
      expPoints.push({ day: i, value: dailyExp[i] || 0 });
    }

    const productMap: Record<string, { qty: number; rev: number }> = {};
    items.forEach(it => {
      productMap[it.item_name] = productMap[it.item_name] || { qty: 0, rev: 0 };
      productMap[it.item_name].qty += it.quantity || 0;
      productMap[it.item_name].rev += (it.quantity || 0) * (it.price_at_sale || 0);
    });

    return {
      totalRevenue, totalCash, totalCredit, totalDigital,
      totalExp: expenses.reduce((a, b) => a + (Number(b.total_pengeluaran) || 0), 0),
      cashPoints, digiPoints, tempoPoints, expPoints,
      topProducts: Object.entries(productMap).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.rev - a.rev).slice(0, 5),
      piutangTotal: receivablesData.reduce((a, s) => a + ((s.total_amount || 0) - (s.down_payment || 0)), 0),
    };
  }, [sales, items, receivablesData, expenses, currentDate]);

  const renderMiniChart = (title: string, data: any[], color: string) => {
    const max = Math.max(...data.map(d => d.value), 1);
    return (
      <View style={styles.sectionCard}>
        <View style={styles.chartHeader}>
          <View style={[styles.dot, { backgroundColor: color, width: 8, height: 8 }]} />
          <Text style={styles.sectionTitle}> {title}</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.chartContainer}>
            {data.map((d, i) => (
              <View key={i} style={styles.barColumn}>
                {d.value > 0 && <Text style={[styles.barValText, { color }]}>{formatShortNum(d.value)}</Text>}
                <View style={[styles.bar, { height: Math.max((d.value / max) * 100, 2), backgroundColor: color }]} />
                <Text style={styles.barDayText}>{d.day}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
    );
  };

  if (!isManager) return <View style={styles.center}><Text>Akses Manajer Diperlukan</Text></View>;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.headerTitle}>Laporan Dashboard</Text>
            <Text style={styles.headerSubtitle}>{monthName}</Text>
          </View>
          <TouchableOpacity onPress={() => loadData()} style={styles.printCircle}>
            <Ionicons name="refresh" size={22} color="#DC2626" />
          </TouchableOpacity>
        </View>
        <View style={styles.monthNavigator}>
          <TouchableOpacity onPress={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))} style={styles.navBtn}><Ionicons name="chevron-back" size={22} color="#DC2626" /></TouchableOpacity>
          <TouchableOpacity style={styles.navLabelContainer} activeOpacity={0.7} onPress={() => { setPickerYear(currentDate.getFullYear()); setShowPeriodPicker(true); }}>
            <Feather name="calendar" size={14} color="#94A3B8" /><Text style={styles.navLabel}>{monthName}</Text><Feather name="chevron-down" size={14} color="#94A3B8" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))} style={styles.navBtn}><Ionicons name="chevron-forward" size={22} color="#DC2626" /></TouchableOpacity>
        </View>
      </View>

      <Modal visible={showPeriodPicker} transparent animationType="fade" onRequestClose={() => setShowPeriodPicker(false)}>
        <Pressable style={styles.pickerOverlay} onPress={() => setShowPeriodPicker(false)}>
          <Pressable style={styles.pickerCard}>
            <Text style={styles.pickerTitle}>Pilih Periode</Text>
            <View style={styles.pickerYearRow}>
              <TouchableOpacity onPress={() => setPickerYear(y => y - 1)}><Ionicons name="chevron-back" size={24} color="#DC2626" /></TouchableOpacity>
              <Text style={styles.pickerYearText}>{pickerYear}</Text>
              <TouchableOpacity onPress={() => setPickerYear(y => y + 1)}><Ionicons name="chevron-forward" size={24} color="#DC2626" /></TouchableOpacity>
            </View>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                {MONTHS_ID.map((m, idx) => (
                    <TouchableOpacity key={m} style={[styles.pickerMonthBtn, currentDate.getMonth() === idx && currentDate.getFullYear() === pickerYear && styles.pickerMonthBtnActive]} 
                    onPress={() => { setCurrentDate(new Date(pickerYear, idx, 1)); setShowPeriodPicker(false); }}>
                    <Text style={[styles.pickerMonthText, currentDate.getMonth() === idx && styles.pickerMonthTextActive]}>{m}</Text>
                    </TouchableOpacity>
                ))}
            </div>
          </Pressable>
        </Pressable>
      </Modal>

      <ScrollView contentContainerStyle={styles.scrollContent} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => {setRefreshing(true); loadData();}} />}>
        {loading ? (
          <ActivityIndicator color="#DC2626" style={{ marginTop: 40 }} />
        ) : (
          <Animated.View entering={FadeIn}>
            
            {/* INCOME SPLIT CARDS (3-WAY) */}
            <View style={styles.incomeSplitRow}>
              <LinearGradient colors={['#10B981', '#059669']} style={styles.incomeCard}>
                <Text style={styles.incomeLabel}>TUNAI</Text>
                <Text style={styles.incomeValue}>{formatShortNum(summary.totalCash)}</Text>
              </LinearGradient>
              <LinearGradient colors={['#3B82F6', '#2563EB']} style={styles.incomeCard}>
                <Text style={styles.incomeLabel}>DIGITAL</Text>
                <Text style={styles.incomeValue}>{formatShortNum(summary.totalDigital)}</Text>
              </LinearGradient>
              <LinearGradient colors={['#F59E0B', '#D97706']} style={styles.incomeCard}>
                <Text style={styles.incomeLabel}>TEMPO</Text>
                <Text style={styles.incomeValue}>{formatShortNum(summary.totalCredit)}</Text>
              </LinearGradient>
            </View>

            {/* TOTAL SPENDING BELOW INCOME */}
            <LinearGradient colors={['#F43F5E', '#BE123C']} style={styles.spendingFullCard}>
                <View style={styles.rowBetween}>
                    <Text style={styles.spendingLabel}>TOTAL PENGELUARAN OPERASIONAL</Text>
                    <Ionicons name="trending-down" size={20} color="white" />
                </View>
                <Text style={styles.spendingValue}>{formatIDR(summary.totalExp)}</Text>
            </LinearGradient>

            {/* CHARTS */}
            {renderMiniChart("Arus Kas Tunai", summary.cashPoints, '#10B981')}
            {renderMiniChart("Arus Kas Digital", summary.digiPoints, '#3B82F6')}
            {renderMiniChart("Penjualan Tempo", summary.tempoPoints, '#F59E0B')}
            {renderMiniChart("Biaya Operasional", summary.expPoints, '#F43F5E')}

            {/* WORKER PERFORMANCE (FROM ABSENSI) */}
            <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>AKTIVITAS & GAJI TUKANG</Text>
                <View style={{marginTop: 10}}>
                    {workerStats.map((w, idx) => (
                        <View key={idx} style={styles.workerRow}>
                            <View style={{flex: 1}}>
                                <Text style={styles.workerName}>{w.name}</Text>
                                <Text style={styles.workerSub}>{w.days} Hari Kerja</Text>
                            </View>
                            <Text style={styles.workerPaid}>{formatIDR(w.paid)}</Text>
                        </View>
                    ))}
                </View>
            </View>

            {/* BEST SELLERS */}
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>BARANG TERLARIS</Text>
              {summary.topProducts.map((p, i) => (
                <View key={i} style={styles.rankItem}>
                  <Text style={styles.rankNum}>{i+1}</Text>
                  <View style={{ flex: 1 }}><Text style={styles.rankName}>{p.name}</Text><Text style={styles.rankSub}>{p.qty} terjual</Text></View>
                  <Text style={styles.rankQty}>{formatShortNum(p.rev)}</Text>
                </View>
              ))}
            </View>

            {/* LOW STOCK WARNING (MOVED TO BOTTOM) */}
            {lowStock.length > 0 && (
              <View style={styles.newAlertCard}>
                  <View style={styles.alertHeaderRow}>
                    <Ionicons name="cube" size={20} color="#DC2626" />
                    <Text style={styles.alertMainTitle}>STOK KRITIS ({lowStock.length})</Text>
                    <TouchableOpacity onPress={() => setShowAllLowStock(!showAllLowStock)} style={styles.showAllBtn}>
                        <Text style={styles.showAllText}>{showAllLowStock ? 'TUTUP' : 'LIHAT SEMUA'}</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.alertDivider} />
                  {(showAllLowStock ? lowStock : lowStock.slice(0, 3)).map((item, idx) => (
                    <View key={idx} style={styles.alertItemRow}>
                      <Text style={styles.alertItemName} numberOfLines={1}>{item.item_name}</Text>
                      <View style={styles.alertQtyBox}><Text style={styles.alertQtyText}>{item.quantity} sisa</Text></View>
                    </View>
                  ))}
              </View>
            )}

          </Animated.View>
        )}
        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { padding: 20, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle: { fontSize: 22, fontWeight: '900', color: '#1E293B' },
  headerSubtitle: { fontSize: 13, color: '#94A3B8', fontWeight: '600' },
  printCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FEF2F2', justifyContent: 'center', alignItems: 'center' },
  monthNavigator: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 15, backgroundColor: '#F8FAFC', borderRadius: 12, padding: 4 },
  navBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  navLabelContainer: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  navLabel: { fontSize: 12, fontWeight: '900', color: '#1E293B' },
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  pickerCard: { backgroundColor: '#FFF', borderRadius: 20, padding: 20 },
  pickerTitle: { fontSize: 16, fontWeight: '900', textAlign: 'center', marginBottom: 20 },
  pickerYearRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 30, marginBottom: 20 },
  pickerYearText: { fontSize: 20, fontWeight: '900' },
  pickerMonthBtn: { padding: 12, borderRadius: 10, backgroundColor: '#F1F5F9', alignItems: 'center', marginBottom: 5 },
  pickerMonthBtnActive: { backgroundColor: '#DC2626' },
  pickerMonthText: { fontWeight: '700', color: '#475569', fontSize: 12 },
  pickerMonthTextActive: { color: '#FFF' },
  scrollContent: { padding: 15 },
  
  incomeSplitRow: { flexDirection: 'row', gap: 10, marginBottom: 15 },
  incomeCard: { flex: 1, padding: 15, borderRadius: 18 },
  incomeLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 8, fontWeight: '900' },
  incomeValue: { color: 'white', fontSize: 18, fontWeight: '900', marginTop: 2 },
  
  spendingFullCard: { padding: 20, borderRadius: 20, marginBottom: 20 },
  spendingLabel: { color: 'white', fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  spendingValue: { color: 'white', fontSize: 24, fontWeight: '900', marginTop: 5 },
  
  sectionCard: { backgroundColor: '#FFF', borderRadius: 20, padding: 18, marginBottom: 15, borderWidth: 1, borderColor: '#F1F5F9' },
  sectionTitle: { fontSize: 11, fontWeight: '900', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 1 },
  chartHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  chartContainer: { flexDirection: 'row', alignItems: 'flex-end', height: 120, paddingBottom: 5 },
  barColumn: { width: 35, alignItems: 'center' },
  barValText: { fontSize: 7, fontWeight: '900', marginBottom: 2 },
  bar: { width: 8, borderRadius: 3 },
  barDayText: { fontSize: 7, color: '#94A3B8', marginTop: 5, fontWeight: '800' },
  dot: { borderRadius: 4 },
  
  workerRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F8FAFC' },
  workerName: { fontSize: 13, fontWeight: '700', color: '#1E293B' },
  workerSub: { fontSize: 11, color: '#94A3B8' },
  workerPaid: { fontSize: 13, fontWeight: '800', color: '#16A34A' },
  
  rankItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  rankNum: { width: 22, height: 22, borderRadius: 6, backgroundColor: '#F1F5F9', color: '#94A3B8', textAlign: 'center', lineHeight: 22, fontSize: 10, fontWeight: '900', marginRight: 10 },
  rankName: { fontSize: 13, fontWeight: '700', color: '#334155' },
  rankSub: { fontSize: 10, color: '#94A3B8' },
  rankQty: { fontSize: 13, fontWeight: '900', color: '#1E293B' },

  newAlertCard: { backgroundColor: '#FFF', borderRadius: 20, padding: 18, borderTopWidth: 4, borderTopColor: '#DC2626', borderWidth: 1, borderColor: '#F1F5F9' },
  alertHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  alertMainTitle: { fontSize: 13, fontWeight: '900', color: '#991B1B', flex: 1 },
  showAllBtn: { backgroundColor: '#FEF2F2', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  showAllText: { fontSize: 9, fontWeight: '900', color: '#DC2626' },
  alertDivider: { height: 1, backgroundColor: '#F1F5F9', marginVertical: 12 },
  alertItemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  alertItemName: { fontSize: 12, fontWeight: '600', color: '#475569', flex: 1 },
  alertQtyBox: { backgroundColor: '#FEE2E2', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  alertQtyText: { color: '#DC2626', fontSize: 10, fontWeight: '900' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});