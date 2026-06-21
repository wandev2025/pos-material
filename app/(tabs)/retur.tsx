import { Feather } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { formatRupiah } from '../../lib/format';
import { parseNum } from '../../lib/number';
import { useOnline } from '../../lib/offline/OfflineContext';
import { useProfile } from '../../lib/ProfileContext';
import { supabase } from '../../lib/supabase';
import { toast } from '../../lib/toast';

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

// A sale is "credit" (settle via piutang) when it isn't fully paid or was a tempo sale.
const isCreditSale = (s: { status: string; payment_method?: string }) =>
  s.status !== 'PAID' || /tempo/i.test(s.payment_method || '');

// --- TYPES ---
interface SaleRow {
  id: number;
  total_amount: number;
  payment_method: string;
  customer_name: string;
  customer_id: number | null;
  status: 'PAID' | 'PARTIAL' | 'UNPAID';
  down_payment: number;
  amount_returned?: number;
  employee_name: string;
  created_at: string;
}
interface SaleItemRow {
  id: number;
  inventory_id: number;
  item_name: string;
  quantity: number;
  price_at_sale: number;
}
interface ReturnRow {
  id: number;
  sale_id: number;
  customer_id: number | null;
  refund_amount: number;
  refund_method: string;
  employee_name: string;
  note: string | null;
  created_at: string;
}
// One editable return line derived from a sale item.
interface ReturnLine extends SaleItemRow {
  returnQty: string;
}

export default function ReturScreen() {
  const { profile } = useProfile();
  const { width } = useWindowDimensions();
  const isDesktop = width > 768;
  const isManager = profile?.role === 'SUPERADMIN' || profile?.role === 'OWNER';
  const online = useOnline();

  // --- STATE ---
  const [loading, setLoading] = useState(true);
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [returns, setReturns] = useState<ReturnRow[]>([]);
  const [search, setSearch] = useState('');

  // Return modal
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedSale, setSelectedSale] = useState<SaleRow | null>(null);
  const [lines, setLines] = useState<ReturnLine[]>([]);
  const [note, setNote] = useState('');
  const [loadingItems, setLoadingItems] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [{ data: salesData }, { data: returnsData }] = await Promise.all([
        supabase.from('sales').select('*').order('created_at', { ascending: false }).limit(50),
        supabase.from('returns').select('*').order('created_at', { ascending: false }).limit(30),
      ]);
      if (salesData) setSales(salesData as SaleRow[]);
      if (returnsData) setReturns(returnsData as ReturnRow[]);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (isManager) fetchData();
  }, [isManager]);

  // --- OPEN RETURN MODAL: load the sale's items ---
  const handleOpenReturn = async (sale: SaleRow) => {
    setSelectedSale(sale);
    setNote('');
    setLines([]);
    setModalVisible(true);
    setLoadingItems(true);
    const { data } = await supabase.from('sale_items').select('*').eq('sale_id', sale.id);
    setLines(((data as SaleItemRow[]) || []).map(it => ({ ...it, returnQty: '' })));
    setLoadingItems(false);
  };

  // Clamp the return qty for a line to [0, sold qty].
  const setLineQty = (idx: number, raw: string) => {
    setLines(prev => {
      const next = [...prev];
      const sold = next[idx].quantity;
      let q = parseNum(raw);
      if (q < 0) q = 0;
      if (q > sold) q = sold;
      next[idx].returnQty = raw === '' ? '' : String(q);
      return next;
    });
  };

  const refundTotal = useMemo(
    () => lines.reduce((a, l) => a + parseNum(l.returnQty) * (l.price_at_sale || 0), 0),
    [lines]
  );

  // --- SUBMIT RETURN ---
  const handleSubmit = async () => {
    if (!selectedSale) return;
    const itemsToReturn = lines
      .filter(l => parseNum(l.returnQty) > 0)
      .map(l => ({
        inventory_id: l.inventory_id,
        item_name: l.item_name,
        quantity: parseNum(l.returnQty),
        price_at_sale: l.price_at_sale,
      }));

    if (itemsToReturn.length === 0) {
      return toast.error('Pilih minimal satu barang dan jumlah yang diretur.');
    }

    setSubmitting(true);
    const { data, error } = await supabase.rpc('create_return', {
      p_return: {
        sale_id: selectedSale.id,
        customer_id: selectedSale.customer_id,
        employee_name: profile?.full_name,
        note,
      },
      p_items: itemsToReturn,
    });
    setSubmitting(false);

    if (error) {
      return toast.error(error.message);
    }

    const result = data as ReturnRow;
    const isCash = result?.refund_method === 'CASH';
    const title = 'Retur Berhasil';
    const msg = isCash
      ? `Dana tunai dikembalikan: ${formatRupiah(result.refund_amount)}`
      : `Piutang pelanggan dikurangi: ${formatRupiah(result?.refund_amount ?? refundTotal)}`;

    toast.success(title, msg);

    setModalVisible(false);
    fetchData();
  };

  const filteredSales = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sales;
    return sales.filter(s => String(s.id).includes(q) || (s.customer_name || '').toLowerCase().includes(q));
  }, [sales, search]);

  if (!isManager) {
    return (
      <View style={styles.center}>
        <Text style={styles.denied}>Akses Owner Diperlukan</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <View style={styles.searchBar}>
          <Feather name="search" size={18} color="#94A3B8" />
          <TextInput
            placeholder="Cari nota (No. / pelanggan)..."
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
          />
        </View>
        <TouchableOpacity style={styles.refreshBtn} onPress={fetchData}>
          <Feather name="refresh-cw" size={18} color="#FFF" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 50 }} color="#DC2626" />
      ) : (
        <ScrollView contentContainerStyle={{ padding: isDesktop ? 30 : 14, paddingBottom: 60 }}>
          <View style={[isDesktop && styles.columns]}>
            {/* PICK A SALE TO RETURN */}
            <View style={[styles.card, isDesktop && styles.colCard]}>
              <Text style={styles.cardTitle}>PILIH NOTA UNTUK RETUR</Text>
              {filteredSales.length === 0 ? (
                <Text style={styles.empty}>Tidak ada nota ditemukan.</Text>
              ) : (
                filteredSales.map(s => {
                  const returned = s.amount_returned || 0;
                  const isCredit = isCreditSale(s);
                  return (
                    <TouchableOpacity key={s.id} style={styles.saleRow} onPress={() => handleOpenReturn(s)}>
                      <View style={[styles.iconCircle, isCredit && { backgroundColor: '#FEF3C7' }]}>
                        <Feather name="rotate-ccw" size={18} color={isCredit ? '#B45309' : '#64748B'} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.saleName}>{s.customer_name || 'Tanpa Nama'}</Text>
                        <Text style={styles.saleSub}>
                          #{s.id} • {fmtDate(s.created_at)}
                        </Text>
                        <View style={styles.badgeRow}>
                          <Text style={[styles.tag, isCredit ? styles.tagCredit : styles.tagCash]}>
                            {isCredit ? 'KREDIT/TEMPO' : 'TUNAI'}
                          </Text>
                          {returned > 0 && (
                            <Text style={[styles.tag, styles.tagReturned]}>DIRETUR {formatRupiah(returned)}</Text>
                          )}
                        </View>
                      </View>
                      <Text style={styles.salePrice}>{formatRupiah(s.total_amount)}</Text>
                    </TouchableOpacity>
                  );
                })
              )}
            </View>

            {/* RECENT RETURNS */}
            <View style={[styles.card, isDesktop && styles.colCard]}>
              <Text style={styles.cardTitle}>RETUR TERAKHIR</Text>
              {returns.length === 0 ? (
                <Text style={styles.empty}>Belum ada retur.</Text>
              ) : (
                returns.map(r => {
                  const isCash = r.refund_method === 'CASH';
                  return (
                    <View key={r.id} style={styles.returnRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.saleName}>Nota #{r.sale_id}</Text>
                        <Text style={styles.saleSub}>
                          {fmtDate(r.created_at)} • {r.employee_name || '—'}
                        </Text>
                        {!!r.note && <Text style={styles.noteText}>{r.note}</Text>}
                        <Text
                          style={[
                            styles.tag,
                            isCash ? styles.tagCash : styles.tagCredit,
                            { alignSelf: 'flex-start', marginTop: 6 },
                          ]}
                        >
                          {isCash ? 'REFUND TUNAI' : 'POTONG PIUTANG'}
                        </Text>
                      </View>
                      <Text style={[styles.salePrice, { color: '#DC2626' }]}>-{formatRupiah(r.refund_amount)}</Text>
                    </View>
                  );
                })
              )}
            </View>
          </View>
        </ScrollView>
      )}

      {/* MODAL: PROCESS RETURN */}
      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={[styles.modalOverlay, !isDesktop && styles.modalOverlayMobile]}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={[styles.modalContent, isDesktop && { width: 620 }]}
          >
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Proses Retur</Text>
                {selectedSale && (
                  <Text style={styles.modalSub}>
                    Nota #{selectedSale.id} • {selectedSale.customer_name || 'Tanpa Nama'}
                  </Text>
                )}
              </View>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Feather name="x" size={24} />
              </TouchableOpacity>
            </View>

            {loadingItems ? (
              <ActivityIndicator color="#DC2626" style={{ marginVertical: 30 }} />
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.label}>Pilih Barang & Jumlah Retur</Text>
                {lines.length === 0 ? (
                  <Text style={styles.empty}>Nota ini tidak memiliki barang.</Text>
                ) : (
                  lines.map((l, idx) => (
                    <View key={l.id} style={styles.lineCard}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.lineName}>{l.item_name}</Text>
                        <Text style={styles.lineSub}>
                          Terjual {l.quantity} • {formatRupiah(l.price_at_sale)}
                        </Text>
                      </View>
                      <View style={styles.qtyRow}>
                        <TouchableOpacity
                          style={styles.stepBtn}
                          onPress={() => setLineQty(idx, String(parseNum(l.returnQty) - 1))}
                        >
                          <Feather name="minus" size={16} color="#DC2626" />
                        </TouchableOpacity>
                        <TextInput
                          style={styles.qtyInput}
                          placeholder="0"
                          keyboardType="numeric"
                          value={l.returnQty}
                          onChangeText={v => setLineQty(idx, v)}
                        />
                        <TouchableOpacity
                          style={styles.stepBtn}
                          onPress={() => setLineQty(idx, String(parseNum(l.returnQty) + 1))}
                        >
                          <Feather name="plus" size={16} color="#16A34A" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))
                )}

                <Text style={[styles.label, { marginTop: 8 }]}>Catatan (opsional)</Text>
                <TextInput
                  style={styles.input}
                  value={note}
                  onChangeText={setNote}
                  placeholder="Alasan retur / kondisi barang"
                />

                <View style={styles.refundBox}>
                  <Text style={styles.refundLabel}>TOTAL REFUND</Text>
                  <Text style={styles.refundVal}>{formatRupiah(refundTotal)}</Text>
                  {selectedSale && (
                    <Text style={styles.refundHint}>
                      {isCreditSale(selectedSale)
                        ? 'Nota kredit: refund akan mengurangi piutang pelanggan.'
                        : 'Nota tunai: dana dikembalikan tunai.'}
                    </Text>
                  )}
                </View>

                <TouchableOpacity
                  style={[styles.primaryBtn, (!online || submitting || refundTotal <= 0) && styles.btnDisabled]}
                  onPress={handleSubmit}
                  disabled={!online || submitting || refundTotal <= 0}
                >
                  {submitting ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <Text style={styles.btnText}>PROSES RETUR & RESTOK</Text>
                  )}
                </TouchableOpacity>
                {!online && <Text style={styles.offlineHint}>Tidak dapat menyimpan saat offline.</Text>}
              </ScrollView>
            )}
          </KeyboardAvoidingView>
        </View>
      </Modal>
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
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingHorizontal: 15,
    height: 45,
  },
  searchInput: { flex: 1, marginLeft: 10, fontSize: 14, outlineStyle: 'none' } as any,
  refreshBtn: {
    width: 45,
    height: 45,
    backgroundColor: '#64748B',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },

  columns: { flexDirection: 'row', gap: 20, alignItems: 'flex-start' },
  colCard: { flex: 1 },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  cardTitle: { fontSize: 11, fontWeight: '900', color: '#94A3B8', letterSpacing: 1, marginBottom: 12 },
  empty: { color: '#94A3B8', fontStyle: 'italic', paddingVertical: 8 },

  saleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
    gap: 12,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#F9FAFB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  saleName: { fontSize: 14, fontWeight: '700', color: '#1F2937' },
  saleSub: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  salePrice: { fontSize: 14, fontWeight: '800', color: '#0F172A' },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  tag: {
    fontSize: 9,
    fontWeight: '900',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: 'hidden',
  },
  tagCash: { color: '#166534', backgroundColor: '#F0FDF4' },
  tagCredit: { color: '#B45309', backgroundColor: '#FEF3C7' },
  tagReturned: { color: '#DC2626', backgroundColor: '#FEF2F2' },

  returnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
    gap: 10,
  },
  noteText: { fontSize: 11, color: '#64748B', marginTop: 2, fontStyle: 'italic' },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalOverlayMobile: { padding: 0 },
  modalContent: { backgroundColor: '#FFF', borderRadius: 28, padding: 30, width: '100%', maxHeight: '95%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: '900', color: '#111827' },
  modalSub: { fontSize: 12, color: '#64748B', marginTop: 4, fontWeight: '600' },

  label: { fontSize: 11, fontWeight: '800', color: '#94A3B8', marginBottom: 8, textTransform: 'uppercase' },
  input: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 12,
    fontSize: 15,
    color: '#111827',
    marginBottom: 15,
  },

  lineCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    gap: 10,
  },
  lineName: { fontSize: 14, fontWeight: '700', color: '#1F2937' },
  lineSub: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  qtyInput: {
    width: 54,
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingVertical: 8,
    fontSize: 16,
    textAlign: 'center',
    color: '#111827',
    fontWeight: '800',
  },

  refundBox: { backgroundColor: '#0F172A', borderRadius: 16, padding: 16, marginTop: 6, marginBottom: 18 },
  refundLabel: { fontSize: 9, fontWeight: '800', color: '#94A3B8', marginBottom: 6 },
  refundVal: { fontSize: 26, fontWeight: '900', color: '#FFF' },
  refundHint: { fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 6, fontWeight: '600' },

  primaryBtn: {
    backgroundColor: '#DC2626',
    padding: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: { backgroundColor: '#CBD5E1' },
  btnText: { color: '#FFF', fontWeight: '900', fontSize: 14, letterSpacing: 0.5 },
  offlineHint: { color: '#DC2626', fontSize: 12, fontWeight: '600', textAlign: 'center', marginTop: 10 },
});
