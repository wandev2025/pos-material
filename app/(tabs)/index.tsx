import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { formatRupiah } from '../../lib/format';
import { useProfile } from '../../lib/ProfileContext';
import { supabase } from '../../lib/supabase';

type UrgentItem = { item_name: string; quantity: number; min_stock: number; unit?: string };
type RecentSale = { id: number; customer_name: string; total_amount: number; created_at: string; status: string };
type TopItem = { name: string; qty: number };
type DayBar = { label: string; total: number };
type CashSession = { id: number; opening_float: number; opened_at: string } | null;

interface DashData {
  count: number;
  omzet: number;
  laba: number;
  cashToday: number;
  piutang: number;
  hutang: number;
  lowCount: number;
  outCount: number;
  urgent: UrgentItem[];
  recent: RecentSale[];
  chart: DayBar[];
  topItems: TopItem[];
  session: CashSession;
}

const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

export default function Dashboard() {
  const { profile } = useProfile();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width > 768;
  const isManager = profile?.role === 'OWNER' || profile?.role === 'SUPERADMIN';
  const me = profile?.full_name || '';

  const [now, setNow] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [d, setD] = useState<DashData | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [isManager, me]);

  const load = async () => {
    setLoading(true);
    try {
      const today = startOfToday();
      const week = new Date(today); week.setDate(week.getDate() - 6);
      const todayISO = today.toISOString();
      const weekISO = week.toISOString();

      // One round-trip; manager-only financial queries are appended conditionally.
      const base = [
        supabase.from('sales').select('id, total_amount, payment_method, down_payment, status, customer_name, created_at').gte('created_at', weekISO).order('created_at', { ascending: false }),
        supabase.from('inventory').select('item_name, quantity, min_stock, metrics(unit_name)'),
        supabase.from('cash_sessions').select('id, opening_float, opened_at').eq('employee_name', me).eq('status', 'OPEN').order('opened_at', { ascending: false }).limit(1),
      ];
      const mgr = isManager ? [
        supabase.from('sale_items').select('item_name, quantity, inventory(cost), sales!inner(created_at)').gte('sales.created_at', todayISO),
        supabase.from('sales').select('total_amount, down_payment, amount_returned').in('status', ['PARTIAL', 'UNPAID']).not('customer_id', 'is', null),
        supabase.from('customer_payments').select('amount'),
        supabase.from('purchases').select('total_amount, paid_amount'),
      ] : [];
      const [salesRes, invRes, sessRes, itemsRes, creditRes, paysRes, purchRes] = await Promise.all([...base, ...mgr]);
      const sales = (salesRes?.data as any[]) || [];
      const inv = (invRes?.data as any[]) || [];
      const session = ((sessRes?.data as any[]) || [])[0] || null;
      const items = (itemsRes?.data as any[]) || [];      // empty for staff (query not run)
      const credit = (creditRes?.data as any[]) || [];
      const pays = (paysRes?.data as any[]) || [];
      const purch = (purchRes?.data as any[]) || [];

      // 7-day chart buckets + a date→index map for O(1) lookup.
      const chart: DayBar[] = [];
      const idxByDay = new Map<string, number>();
      for (let k = 0; k < 7; k++) {
        const dt = new Date(today); dt.setDate(dt.getDate() - (6 - k));
        idxByDay.set(dt.toDateString(), k);
        chart.push({ label: dt.toLocaleDateString('id-ID', { weekday: 'short' }), total: 0 });
      }

      // One pass over the week's sales: today's KPIs + chart buckets.
      let omzet = 0, count = 0, cashToday = 0;
      sales.forEach(s => {
        const t = s.total_amount || 0;
        const created = new Date(s.created_at);
        if (created >= today) {
          omzet += t; count += 1;
          const received = s.status === 'PAID' ? t : (s.down_payment || 0);
          if (/tunai|cash/i.test(s.payment_method || '')) cashToday += received;
        }
        const bi = idxByDay.get(created.toDateString());
        if (bi !== undefined) chart[bi].total += t;
      });
      const recent: RecentSale[] = sales.slice(0, 5);

      // Profit ≈ net revenue today − COGS (current inventory cost × qty sold); top items, one pass.
      const costOf = (it: any) => { const c = it.inventory; return (Array.isArray(c) ? c[0]?.cost : c?.cost) || 0; };
      const topMap = new Map<string, number>();
      let cogs = 0;
      items.forEach(it => {
        const qty = it.quantity || 0;
        cogs += costOf(it) * qty;
        topMap.set(it.item_name, (topMap.get(it.item_name) || 0) + qty);
      });
      const laba = omzet - cogs;
      const topItems: TopItem[] = Array.from(topMap.entries()).map(([name, qty]) => ({ name, qty })).sort((a, b) => b.qty - a.qty).slice(0, 5);

      // Receivables / payables
      const piutangGross = credit.reduce((a, s) => a + ((s.total_amount || 0) - (s.down_payment || 0) - (s.amount_returned || 0)), 0);
      const paid = pays.reduce((a, p) => a + (p.amount || 0), 0);
      const piutang = Math.max(0, piutangGross - paid);
      const hutang = purch.reduce((a, p) => a + Math.max(0, (p.total_amount || 0) - (p.paid_amount || 0)), 0);

      // Stock — single pass for low/out + the urgent list.
      const low: any[] = [];
      let outCount = 0;
      inv.forEach(i => { const q = i.quantity ?? 0; if (q <= (i.min_stock ?? 0)) low.push(i); if (q <= 0) outCount++; });
      const urgent: UrgentItem[] = low
        .sort((a, b) => (a.quantity - a.min_stock) - (b.quantity - b.min_stock))
        .slice(0, 5)
        .map(i => ({ item_name: i.item_name, quantity: i.quantity, min_stock: i.min_stock, unit: i.metrics?.unit_name }));

      setD({ count, omzet, laba, cashToday, piutang, hutang, lowCount: low.length, outCount, urgent, recent, chart, topItems, session });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const clock = useMemo(() => now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }), [now]);
  const expectedCash = d?.session ? (d.session.opening_float || 0) + (d.cashToday || 0) : 0;
  const go = (path: string) => router.push(path as any);

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, !isDesktop && styles.contentMobile]}>
      {/* HEADER */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.welcome}>Selamat datang,</Text>
          <Text style={styles.name} numberOfLines={1}>{me || 'Admin'}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <View style={styles.roleChip}><Text style={styles.roleChipText}>{profile?.role || 'OWNER'}</Text></View>
          <Text style={styles.time}>{clock}</Text>
        </View>
      </View>

      {loading ? <ActivityIndicator color="#DC2626" style={{ marginTop: 60 }} /> : (
        <View style={[styles.grid, isDesktop && styles.gridDesktop]}>

          {/* QUICK ACTIONS */}
          <Animated.View entering={FadeInDown.duration(240).delay(40)} style={[styles.card, styles.full]}>
            <Text style={styles.cardTitle}>AKSI CEPAT</Text>
            <View style={styles.actions}>
              <Action icon="shopping-cart" label="Kasir" onPress={() => go('/(tabs)/pos')} />
              <Action icon="dollar-sign" label="Tutup Kasir" onPress={() => go('/(tabs)/kasir')} />
              {isManager && <Action icon="truck" label="Stok Masuk" onPress={() => go('/(tabs)/pembelian')} />}
              {isManager && <Action icon="user-check" label="Piutang" onPress={() => go('/(tabs)/pelanggan')} />}
            </View>
          </Animated.View>

          {/* TODAY KPI */}
          <Animated.View entering={FadeInDown.duration(240).delay(80)} style={[styles.card, isDesktop ? styles.half : styles.full]}>
            <Text style={styles.cardTitle}>HARI INI</Text>
            {isManager ? (
              <View style={styles.kpiWrap}>
                <Kpi label="OMZET" value={formatRupiah(d?.omzet || 0)} big />
                <Kpi label="LABA (EST.)" value={formatRupiah(d?.laba || 0)} color={(d?.laba || 0) >= 0 ? '#16A34A' : '#DC2626'} big />
                <Kpi label="NOTA" value={String(d?.count || 0)} />
                <Kpi label="RATA-RATA" value={formatRupiah(d?.count ? Math.round((d?.omzet || 0) / d.count) : 0)} />
              </View>
            ) : (
              <View style={styles.kpiWrap}>
                <Kpi label="NOTA HARI INI" value={String(d?.count || 0)} big />
                <Kpi label="UANG TUNAI" value={formatRupiah(d?.cashToday || 0)} />
              </View>
            )}
          </Animated.View>

          {/* MONEY: PIUTANG / HUTANG (manager) */}
          {isManager && (
            <Animated.View entering={FadeInDown.duration(240).delay(120)} style={[styles.card, isDesktop ? styles.half : styles.full]}>
              <Text style={styles.cardTitle}>ARUS PIUTANG & HUTANG</Text>
              <View style={styles.moneyRow}>
                <MoneyBox bg="#FEF2F2" label="PIUTANG (DITERIMA)" value={formatRupiah(d?.piutang || 0)} color="#B45309" hint="Pelanggan berhutang →" onPress={() => go('/(tabs)/pelanggan')} />
                <MoneyBox bg="#F8FAFC" label="HUTANG SUPPLIER" value={formatRupiah(d?.hutang || 0)} color="#DC2626" hint="Harus dibayar →" onPress={() => go('/(tabs)/pembelian')} />
              </View>
            </Animated.View>
          )}

          {/* STOK MINIM (all roles) */}
          <Animated.View entering={FadeInDown.duration(240).delay(160)} style={[styles.card, isDesktop ? styles.half : styles.full]}>
            <TouchableOpacity onPress={() => go('/(tabs)/inventory')}>
              <View style={styles.rowBetween}>
                <Text style={styles.cardTitle}>STOK MINIM</Text>
                <Text style={[styles.countPill, (d?.lowCount || 0) > 0 && { backgroundColor: '#FEE2E2', color: '#DC2626' }]}>{d?.lowCount || 0}{(d?.outCount || 0) > 0 ? ` • ${d?.outCount} habis` : ''}</Text>
              </View>
              {(!d || d.urgent.length === 0) ? (
                <Text style={styles.empty}>Semua stok aman. 👍</Text>
              ) : d.urgent.map((it, i) => (
                <View key={i} style={styles.urgentRow}>
                  <Feather name="alert-triangle" size={14} color={it.quantity <= 0 ? '#DC2626' : '#B45309'} />
                  <Text style={styles.urgentName} numberOfLines={1}>{it.item_name}</Text>
                  <Text style={[styles.urgentQty, { color: it.quantity <= 0 ? '#DC2626' : '#B45309' }]}>{it.quantity} {it.unit || ''} / min {it.min_stock}</Text>
                </View>
              ))}
              {isManager && d && d.urgent.length > 0 && <Text style={styles.linkText}>Lihat & restok →</Text>}
            </TouchableOpacity>
          </Animated.View>

          {/* CASH SESSION (all roles) */}
          <Animated.View entering={FadeInDown.duration(240).delay(200)} style={[styles.card, isDesktop ? styles.half : styles.full]}>
            <TouchableOpacity onPress={() => go('/(tabs)/kasir')}>
              <Text style={styles.cardTitle}>STATUS KASIR</Text>
              {d?.session ? (
                <>
                  <View style={[styles.statusDot, { backgroundColor: '#16A34A' }]} />
                  <Text style={styles.sessOpen}>Shift dibuka {new Date(d.session.opened_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</Text>
                  <Text style={styles.sessExpected}>Perkiraan kas: <Text style={{ fontWeight: '900', color: '#0F172A' }}>{formatRupiah(expectedCash)}</Text></Text>
                  <Text style={styles.linkText}>Tutup kasir →</Text>
                </>
              ) : (
                <>
                  <View style={[styles.statusDot, { backgroundColor: '#94A3B8' }]} />
                  <Text style={styles.sessClosed}>Belum ada shift terbuka.</Text>
                  <Text style={styles.linkText}>Buka kasir →</Text>
                </>
              )}
            </TouchableOpacity>
          </Animated.View>

          {/* 7-DAY OMZET CHART (manager) */}
          {isManager && d && (
            <Animated.View entering={FadeInDown.duration(240).delay(240)} style={[styles.card, isDesktop ? styles.half : styles.full]}>
              <Text style={styles.cardTitle}>OMZET 7 HARI</Text>
              <Chart bars={d.chart} height={isDesktop ? 200 : 90} />
            </Animated.View>
          )}

          {/* RECENT TRANSACTIONS (manager) */}
          {isManager && (
            <Animated.View entering={FadeInDown.duration(240).delay(280)} style={[styles.card, isDesktop ? styles.half : styles.full]}>
              <Text style={styles.cardTitle}>TRANSAKSI TERBARU</Text>
              {(!d || d.recent.length === 0) ? <Text style={styles.empty}>Belum ada transaksi.</Text> : d.recent.map(s => (
                <View key={s.id} style={styles.recentRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.recentName} numberOfLines={1}>{s.customer_name || 'Umum'}</Text>
                    <Text style={styles.recentTime}>{new Date(s.created_at).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</Text>
                  </View>
                  <Text style={styles.recentAmt}>{formatRupiah(s.total_amount)}</Text>
                </View>
              ))}
            </Animated.View>
          )}

          {/* TOP ITEMS (manager) */}
          {isManager && d && d.topItems.length > 0 && (
            <Animated.View entering={FadeInDown.duration(240).delay(320)} style={[styles.card, isDesktop ? styles.half : styles.full]}>
              <Text style={styles.cardTitle}>TERLARIS HARI INI</Text>
              {d.topItems.map((t, i) => (
                <View key={i} style={styles.topRow}>
                  <Text style={styles.topRank}>{i + 1}</Text>
                  <Text style={styles.topName} numberOfLines={1}>{t.name}</Text>
                  <Text style={styles.topQty}>{t.qty}x</Text>
                </View>
              ))}
            </Animated.View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

function Action({ icon, label, onPress }: { icon: any; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.action} onPress={onPress}>
      <View style={styles.actionIcon}><Feather name={icon} size={20} color="#DC2626" /></View>
      <Text style={styles.actionLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function Kpi({ label, value, big, color }: { label: string; value: string; big?: boolean; color?: string }) {
  return (
    <View style={styles.kpi}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={[styles.kpiVal, big && styles.kpiValBig, color ? { color } : null]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    </View>
  );
}

function MoneyBox({ bg, label, value, color, hint, onPress }: { bg: string; label: string; value: string; color: string; hint: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.moneyBox, { backgroundColor: bg }]} onPress={onPress}>
      <Text style={styles.moneyLabel}>{label}</Text>
      <Text style={[styles.moneyVal, { color }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={styles.moneyHint}>{hint}</Text>
    </TouchableOpacity>
  );
}

function Chart({ bars, height = 90 }: { bars: DayBar[]; height?: number }) {
  const max = Math.max(1, ...bars.map(b => b.total));
  return (
    <View style={[styles.chart, { height: height + 20 }]}>
      {bars.map((b, i) => (
        <View key={i} style={styles.chartCol}>
          <View style={[styles.chartTrack, { height }]}>
            <View style={[styles.chartBar, { height: `${Math.round((b.total / max) * 100)}%` }]} />
          </View>
          <Text style={styles.chartLabel}>{b.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  content: { padding: 40 },
  contentMobile: { paddingHorizontal: 14, paddingTop: 20, paddingBottom: 120 },

  header: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 20 },
  welcome: { fontSize: 15, color: '#6B7280' },
  name: { fontSize: 30, fontWeight: '900', color: '#111827' },
  roleChip: { backgroundColor: '#DC2626', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  roleChipText: { color: '#FFF', fontWeight: '800', fontSize: 10, letterSpacing: 0.5 },
  time: { fontSize: 12, color: '#9CA3AF', marginTop: 6 },

  grid: { gap: 14 },
  gridDesktop: { flexDirection: 'row', flexWrap: 'wrap' },
  card: { backgroundColor: '#FFF', borderRadius: 20, padding: 20, borderWidth: 1, borderColor: '#E5E7EB' },
  full: { width: '100%' },
  half: { width: '48.5%' },
  cardTitle: { fontSize: 11, fontWeight: '900', color: '#94A3B8', letterSpacing: 1, marginBottom: 14 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  empty: { color: '#94A3B8', fontStyle: 'italic', paddingVertical: 6 },
  linkText: { color: '#DC2626', fontWeight: '800', fontSize: 12, marginTop: 12 },

  // Quick actions
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  action: { flexGrow: 1, flexBasis: '22%', minWidth: 80, alignItems: 'center', backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 14, paddingVertical: 14, gap: 8 },
  actionIcon: { width: 42, height: 42, borderRadius: 12, backgroundColor: '#FEF2F2', justifyContent: 'center', alignItems: 'center' },
  actionLabel: { fontSize: 11, fontWeight: '700', color: '#1F2937' },

  // KPI
  kpiWrap: { flexDirection: 'row', flexWrap: 'wrap' },
  kpi: { width: '50%', paddingVertical: 8 },
  kpiLabel: { fontSize: 9, fontWeight: '800', color: '#94A3B8', letterSpacing: 0.5, marginBottom: 3 },
  kpiVal: { fontSize: 16, fontWeight: '800', color: '#1F2937' },
  kpiValBig: { fontSize: 22, fontWeight: '900' },

  // Money
  moneyRow: { flexDirection: 'row', gap: 10 },
  moneyBox: { flex: 1, borderRadius: 14, padding: 14 },
  moneyLabel: { fontSize: 9, fontWeight: '800', color: '#94A3B8', letterSpacing: 0.5 },
  moneyVal: { fontSize: 18, fontWeight: '900', marginTop: 4 },
  moneyHint: { fontSize: 10, color: '#94A3B8', marginTop: 6 },

  // Stok minim
  countPill: { fontSize: 11, fontWeight: '900', color: '#16A34A', backgroundColor: '#DCFCE7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, overflow: 'hidden' },
  urgentRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  urgentName: { flex: 1, fontSize: 13, fontWeight: '600', color: '#1F2937' },
  urgentQty: { fontSize: 11, fontWeight: '800' },

  // Cash session
  statusDot: { width: 10, height: 10, borderRadius: 5, marginBottom: 8 },
  sessOpen: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  sessExpected: { fontSize: 13, color: '#64748B', marginTop: 4 },
  sessClosed: { fontSize: 14, color: '#64748B' },

  // Chart
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  chartCol: { flex: 1, alignItems: 'center' },
  chartTrack: { width: '100%', backgroundColor: '#F1F5F9', borderRadius: 6, justifyContent: 'flex-end', overflow: 'hidden' },
  chartBar: { width: '100%', backgroundColor: '#DC2626', borderRadius: 6 },
  chartLabel: { fontSize: 9, color: '#94A3B8', marginTop: 5, fontWeight: '700' },

  // Recent
  recentRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  recentName: { fontSize: 13, fontWeight: '700', color: '#1F2937' },
  recentTime: { fontSize: 11, color: '#94A3B8', marginTop: 1 },
  recentAmt: { fontSize: 13, fontWeight: '800', color: '#0F172A' },

  // Top items
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  topRank: { width: 20, height: 20, borderRadius: 6, backgroundColor: '#FEF2F2', color: '#DC2626', fontWeight: '900', fontSize: 11, textAlign: 'center', lineHeight: 20, overflow: 'hidden' },
  topName: { flex: 1, fontSize: 13, fontWeight: '600', color: '#1F2937' },
  topQty: { fontSize: 13, fontWeight: '800', color: '#0F172A' },
});
