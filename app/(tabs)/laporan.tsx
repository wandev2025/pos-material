import { Feather } from '@expo/vector-icons';
import * as Print from 'expo-print';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Platform, ScrollView,
  StyleSheet, Text, TouchableOpacity, useWindowDimensions, View
} from 'react-native';
import { useProfile } from '../../lib/ProfileContext';
import { supabase } from '../../lib/supabase';

const formatRupiah = (n: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(Math.round(n) || 0);

type Preset = 'today' | '7d' | '30d' | 'month';
const PRESETS: { key: Preset; label: string }[] = [
  { key: 'today', label: 'Hari Ini' },
  { key: '7d', label: '7 Hari' },
  { key: '30d', label: '30 Hari' },
  { key: 'month', label: 'Bulan Ini' },
];

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

const localKey = (dt: Date) =>
  `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;

function rangeFor(preset: Preset) {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  if (preset === '7d') start.setDate(start.getDate() - 6);
  else if (preset === '30d') start.setDate(start.getDate() - 29);
  else if (preset === 'month') start.setDate(1);
  return { start, end };
}

export default function LaporanScreen() {
  const { profile } = useProfile();
  const { width } = useWindowDimensions();
  const isDesktop = width > 768;
  const isManager = profile?.role === 'SUPERADMIN' || profile?.role === 'OWNER';

  const [preset, setPreset] = useState<Preset>('30d');
  const [loading, setLoading] = useState(true);
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [items, setItems] = useState<{ item_name: string; quantity: number; price_at_sale: number }[]>([]);
  const [receivables, setReceivables] = useState<SaleRow[]>([]);

  const load = async () => {
    setLoading(true);
    const { start, end } = rangeFor(preset);
    const startISO = start.toISOString();
    const endISO = end.toISOString();

    const salesRes = await supabase.from('sales').select('*')
      .gte('created_at', startISO).lte('created_at', endISO).order('created_at');
    const saleRows = (salesRes.data as SaleRow[]) || [];
    setSales(saleRows);

    const ids = saleRows.map((s) => s.id);
    if (ids.length) {
      const itemsRes = await supabase.from('sale_items')
        .select('item_name, quantity, price_at_sale').in('sale_id', ids);
      setItems((itemsRes.data as any[]) || []);
    } else {
      setItems([]);
    }

    // Receivables are "as of now" — outstanding credit regardless of the date filter.
    const recvRes = await supabase.from('sales').select('*')
      .neq('status', 'PAID').order('created_at', { ascending: false });
    setReceivables((recvRes.data as SaleRow[]) || []);

    setLoading(false);
  };

  useEffect(() => { if (isManager) load(); /* eslint-disable-next-line */ }, [preset, isManager]);

  // --- DERIVED METRICS ---
  const summary = useMemo(() => {
    const revenue = sales.reduce((a, s) => a + (s.total_amount || 0), 0);
    const discount = sales.reduce((a, s) => a + (s.discount || 0), 0);
    return { count: sales.length, revenue, avg: sales.length ? revenue / sales.length : 0, discount };
  }, [sales]);

  const daily = useMemo(() => {
    const bucket: Record<string, number> = {};
    sales.forEach((s) => {
      const k = localKey(new Date(s.created_at));
      bucket[k] = (bucket[k] || 0) + (s.total_amount || 0);
    });
    const { start, end } = rangeFor(preset);
    const out: { label: string; total: number }[] = [];
    for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      out.push({ label: String(d.getDate()), total: bucket[localKey(d)] || 0 });
    }
    return out;
  }, [sales, preset]);

  const maxRev = useMemo(() => Math.max(1, ...daily.map((d) => d.total)), [daily]);

  const byGroup = (key: 'payment_method' | 'employee_name') => {
    const m: Record<string, { total: number; count: number }> = {};
    sales.forEach((s) => {
      const g = (s as any)[key] || '—';
      m[g] = m[g] || { total: 0, count: 0 };
      m[g].total += s.total_amount || 0;
      m[g].count += 1;
    });
    return Object.entries(m).map(([label, v]) => ({ label, ...v })).sort((a, b) => b.total - a.total);
  };
  const byPayment = useMemo(() => byGroup('payment_method'), [sales]);
  const byCashier = useMemo(() => byGroup('employee_name'), [sales]);

  const topItems = useMemo(() => {
    const m: Record<string, { qty: number; revenue: number }> = {};
    items.forEach((it) => {
      m[it.item_name] = m[it.item_name] || { qty: 0, revenue: 0 };
      m[it.item_name].qty += it.quantity || 0;
      m[it.item_name].revenue += (it.quantity || 0) * (it.price_at_sale || 0);
    });
    return Object.entries(m).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.revenue - a.revenue).slice(0, 10);
  }, [items]);

  const piutang = useMemo(() => {
    const m: Record<string, number> = {};
    receivables.forEach((s) => {
      const owed = (s.total_amount || 0) - (s.down_payment || 0);
      if (owed > 0) m[s.customer_name || '—'] = (m[s.customer_name || '—'] || 0) + owed;
    });
    const rows = Object.entries(m).map(([name, owed]) => ({ name, owed })).sort((a, b) => b.owed - a.owed);
    return { rows, total: rows.reduce((a, r) => a + r.owed, 0) };
  }, [receivables]);

  const printReport = async () => {
    const presetLabel = PRESETS.find((p) => p.key === preset)?.label || '';
    const row = (l: string, r: string) => `<tr><td>${l}</td><td style="text-align:right">${r}</td></tr>`;
    const html = `
      <html><head><meta charset="utf-8"><style>
        body{font-family:Arial,sans-serif;color:#1E293B;padding:24px}
        h1{font-size:20px;margin:0} h2{font-size:14px;margin:24px 0 8px;border-bottom:1px solid #CBD5E1;padding-bottom:4px}
        table{width:100%;border-collapse:collapse} td,th{padding:6px 4px;font-size:12px;border-bottom:1px solid #E2E8F0;text-align:left}
        .muted{color:#64748B;font-size:12px}
      </style></head><body>
        <h1>Laporan Penjualan</h1>
        <div class="muted">${presetLabel} • dicetak ${new Date().toLocaleString('id-ID')}</div>
        <h2>Ringkasan</h2>
        <table>
          ${row('Total Penjualan', formatRupiah(summary.revenue))}
          ${row('Jumlah Transaksi', String(summary.count))}
          ${row('Rata-rata / Transaksi', formatRupiah(summary.avg))}
        </table>
        <h2>Metode Bayar</h2>
        <table>${byPayment.map((p) => row(`${p.label} (${p.count})`, formatRupiah(p.total))).join('')}</table>
        <h2>Per Kasir</h2>
        <table>${byCashier.map((c) => row(`${c.label} (${c.count})`, formatRupiah(c.total))).join('')}</table>
        <h2>Barang Terlaris</h2>
        <table><tr><th>Barang</th><th>Qty</th><th style="text-align:right">Omzet</th></tr>
          ${topItems.map((t) => `<tr><td>${t.name}</td><td>${t.qty}</td><td style="text-align:right">${formatRupiah(t.revenue)}</td></tr>`).join('')}
        </table>
        <h2>Piutang (Total ${formatRupiah(piutang.total)})</h2>
        <table>${piutang.rows.map((r) => row(r.name, formatRupiah(r.owed))).join('')}</table>
      </body></html>`;
    if (Platform.OS === 'web') {
      const win = window.open('', '_blank');
      win?.document.write(html);
      win?.document.close();
    } else {
      await Print.printAsync({ html });
    }
  };

  if (!isManager) {
    return <View style={styles.center}><Text style={styles.denied}>Akses Manajer Diperlukan</Text></View>;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingHorizontal: isDesktop ? 20 : 14, paddingTop: 16, paddingBottom: 60 }}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Laporan</Text>
        <TouchableOpacity style={styles.printBtn} onPress={printReport}>
          <Feather name="printer" size={15} color="#FFF" />
          <Text style={styles.printBtnText}>Cetak</Text>
        </TouchableOpacity>
      </View>

      {/* Date presets */}
      <View style={styles.presetRow}>
        {PRESETS.map((p) => {
          const active = preset === p.key;
          return (
            <TouchableOpacity key={p.key} onPress={() => setPreset(p.key)} style={[styles.preset, active && styles.presetActive]}>
              <Text style={[styles.presetText, active && styles.presetTextActive]}>{p.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading ? <ActivityIndicator style={{ marginTop: 50 }} color="#DC2626" /> : (
        <>
          {/* Summary: OMZET hero on top, the pair below */}
          <View style={styles.heroCard}>
            <Text style={styles.summaryLabelLight}>OMZET</Text>
            <Text style={styles.heroVal} numberOfLines={1} adjustsFontSizeToFit>{formatRupiah(summary.revenue)}</Text>
            <Text style={styles.heroSub}>Total diskon diberikan: {formatRupiah(summary.discount)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>TRANSAKSI</Text>
              <Text style={styles.summaryVal} numberOfLines={1} adjustsFontSizeToFit>{summary.count}</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>RATA-RATA</Text>
              <Text style={styles.summaryVal} numberOfLines={1} adjustsFontSizeToFit>{formatRupiah(summary.avg)}</Text>
            </View>
          </View>

          {/* Revenue chart */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>OMZET HARIAN</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.chartRow}>
                {daily.map((d, i) => {
                  const h = Math.max(4, (d.total / maxRev) * 120);
                  return (
                    <View key={i} style={styles.barCol}>
                      <Text style={styles.barVal}>{d.total > 0 ? `${Math.round(d.total / 1000)}k` : ''}</Text>
                      <View style={[styles.bar, { height: h }]} />
                      <Text style={styles.barLabel}>{d.label}</Text>
                    </View>
                  );
                })}
              </View>
            </ScrollView>
          </View>

          {/* Top items */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>BARANG TERLARIS</Text>
            {topItems.length === 0 ? <Text style={styles.empty}>Belum ada penjualan.</Text> :
              topItems.map((t, i) => (
                <View key={t.name} style={styles.listRow}>
                  <Text style={styles.rank}>{i + 1}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.listName}>{t.name}</Text>
                    <Text style={styles.listSub}>{t.qty} terjual</Text>
                  </View>
                  <Text style={styles.listVal}>{formatRupiah(t.revenue)}</Text>
                </View>
              ))}
          </View>

          {/* Payment + cashier */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>METODE BAYAR</Text>
            {byPayment.map((p) => (
              <View key={p.label} style={styles.listRow}>
                <View style={{ flex: 1 }}><Text style={styles.listName}>{p.label}</Text><Text style={styles.listSub}>{p.count} transaksi</Text></View>
                <Text style={styles.listVal}>{formatRupiah(p.total)}</Text>
              </View>
            ))}
            <Text style={[styles.cardTitle, { marginTop: 20 }]}>PER KASIR</Text>
            {byCashier.map((c) => (
              <View key={c.label} style={styles.listRow}>
                <View style={{ flex: 1 }}><Text style={styles.listName}>{c.label}</Text><Text style={styles.listSub}>{c.count} transaksi</Text></View>
                <Text style={styles.listVal}>{formatRupiah(c.total)}</Text>
              </View>
            ))}
          </View>

          {/* Receivables */}
          <View style={[styles.card, { borderColor: '#FED7AA', borderWidth: 1 }]}>
            <View style={styles.rowBetween}>
              <Text style={styles.cardTitle}>PIUTANG (TEMPO)</Text>
              <Text style={styles.piutangTotal}>{formatRupiah(piutang.total)}</Text>
            </View>
            {piutang.rows.length === 0 ? <Text style={styles.empty}>Tidak ada piutang. 🎉</Text> :
              piutang.rows.map((r) => (
                <View key={r.name} style={styles.listRow}>
                  <Text style={[styles.listName, { flex: 1 }]}>{r.name}</Text>
                  <Text style={[styles.listVal, { color: '#B45309' }]}>{formatRupiah(r.owed)}</Text>
                </View>
              ))}
            <Text style={styles.note}>Piutang dihitung dari semua transaksi belum lunas (di luar filter tanggal).</Text>
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
  printBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#0F172A', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10 },
  printBtnText: { color: '#FFF', fontWeight: '800', fontSize: 12 },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  preset: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E5E7EB' },
  presetActive: { backgroundColor: '#DC2626', borderColor: '#DC2626' },
  presetText: { fontSize: 12, fontWeight: '700', color: '#64748B' },
  presetTextActive: { color: '#FFF' },
  heroCard: { backgroundColor: '#0F172A', borderRadius: 16, padding: 18, marginBottom: 10 },
  heroVal: { fontSize: 30, fontWeight: '900', color: '#FFF', marginTop: 2 },
  heroSub: { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 6, fontWeight: '600' },
  summaryRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  summaryCard: { flex: 1, backgroundColor: '#FFF', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#E5E7EB' },
  summaryLabel: { fontSize: 9, fontWeight: '800', color: '#94A3B8', marginBottom: 6 },
  summaryVal: { fontSize: 18, fontWeight: '900', color: '#0F172A' },
  summaryLabelLight: { fontSize: 9, fontWeight: '800', color: '#94A3B8', marginBottom: 6 },
  card: { backgroundColor: '#FFF', borderRadius: 16, padding: 18, marginBottom: 16, borderWidth: 1, borderColor: '#F1F5F9' },
  cardTitle: { fontSize: 11, fontWeight: '900', color: '#94A3B8', letterSpacing: 1, marginBottom: 12 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chartRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingTop: 10 },
  barCol: { alignItems: 'center', width: 28 },
  bar: { width: 16, backgroundColor: '#DC2626', borderRadius: 4 },
  barVal: { fontSize: 8, color: '#94A3B8', marginBottom: 3, height: 12 },
  barLabel: { fontSize: 9, color: '#94A3B8', marginTop: 4 },
  listRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F8FAFC', gap: 10 },
  rank: { width: 20, fontWeight: '900', color: '#CBD5E1', fontSize: 13 },
  listName: { fontSize: 14, fontWeight: '700', color: '#1F2937' },
  listSub: { fontSize: 11, color: '#94A3B8', marginTop: 1 },
  listVal: { fontSize: 14, fontWeight: '800', color: '#0F172A' },
  piutangTotal: { fontSize: 16, fontWeight: '900', color: '#B45309' },
  empty: { color: '#94A3B8', fontStyle: 'italic', paddingVertical: 8 },
  note: { fontSize: 10, color: '#94A3B8', fontStyle: 'italic', marginTop: 10 },
});
