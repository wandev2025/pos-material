import { Feather } from '@expo/vector-icons';
import * as Print from 'expo-print';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View
} from 'react-native';
import { formatRupiah } from '../../lib/format';
import { parseNum } from '../../lib/number';
import { useOnline } from '../../lib/offline/OfflineContext';
import { printHtmlViaIframe } from '../../lib/printing';
import { useProfile } from '../../lib/ProfileContext';
import { supabase } from '../../lib/supabase';
import { toast } from '../../lib/toast';

// --- TYPES ---
interface Customer {
  id: number;
  name: string;
  phone?: string | null;
  address?: string | null;
  created_at?: string;
}
interface CreditSale {
  id: number;
  customer_id: number;
  customer_name?: string;
  total_amount: number;
  down_payment: number;
  amount_returned?: number;
  status: 'PAID' | 'PARTIAL' | 'UNPAID';
  payment_method?: string;
  created_at: string;
}
interface CustomerPayment {
  id: number;
  customer_id: number;
  sale_id?: number | null;
  amount: number;
  method?: string;
  note?: string | null;
  employee_name?: string;
  created_at: string;
}
interface PaymentMethod {
  id: number;
  name: string;
}

export default function PelangganScreen() {
  const { profile } = useProfile();
  const { width } = useWindowDimensions();
  const isDesktop = width > 900;
  const isManager = profile?.role === 'SUPERADMIN' || profile?.role === 'OWNER';
  const online = useOnline();

  // --- STATE ---
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [creditSales, setCreditSales] = useState<CreditSale[]>([]);
  const [payments, setPayments] = useState<CustomerPayment[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [search, setSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  // Modal visibility
  const [customerModal, setCustomerModal] = useState(false);
  const [payModal, setPayModal] = useState(false);
  const [ledgerModal, setLedgerModal] = useState(false); // mobile ledger view

  // Customer form
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formAddress, setFormAddress] = useState('');

  // Payment form
  const [payAmountStr, setPayAmountStr] = useState('');
  const [payMethod, setPayMethod] = useState('');
  const [payNotaId, setPayNotaId] = useState<number | null>(null);
  const [payNote, setPayNote] = useState('');

  // --- DATA ---
  const load = async () => {
    setLoading(true);
    try {
      const [custRes, salesRes, payRes, pmRes] = await Promise.all([
        supabase.from('customers').select('*').order('name'),
        supabase.from('sales').select('*').not('customer_id', 'is', null).in('status', ['PARTIAL', 'UNPAID']),
        supabase.from('customer_payments').select('*').order('created_at', { ascending: false }),
        supabase.from('payment_methods').select('*').order('name'),
      ]);

      const custData = (custRes.data as Customer[]) || [];
      setCustomers(custData);
      setCreditSales((salesRes.data as CreditSale[]) || []);
      setPayments((payRes.data as CustomerPayment[]) || []);
      setPaymentMethods((pmRes.data as PaymentMethod[]) || []);

      // Keep the open ledger pointing at the freshest customer row.
      setSelectedCustomer(prev => (prev ? custData.find(c => c.id === prev.id) || prev : null));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (isManager) load(); /* eslint-disable-next-line */ }, [isManager]);

  // --- DERIVED: receivables ledger ---
  // One pass builds every customer's ledger; the list totals and the selected
  // ledger both read from it, so the piutang formula lives in exactly one place.
  // per-nota outstanding = total_amount - down_payment - amount_returned - sum(payments for that sale_id)
  // net = max(0, sum(per-nota outstanding) - sum(general payments without a sale_id))
  type Ledger = { notaRows: { sale: CreditSale; paidForSale: number; outstanding: number }[]; pays: CustomerPayment[]; net: number };
  const ledgers = useMemo(() => {
    const paysByCustomer = new Map<number, CustomerPayment[]>();
    const paidBySale = new Map<number, number>();
    payments.forEach(p => {
      const list = paysByCustomer.get(p.customer_id);
      if (list) list.push(p); else paysByCustomer.set(p.customer_id, [p]);
      if (p.sale_id) paidBySale.set(p.sale_id, (paidBySale.get(p.sale_id) || 0) + (p.amount || 0));
    });
    const notasByCustomer = new Map<number, CreditSale[]>();
    creditSales.forEach(s => {
      const list = notasByCustomer.get(s.customer_id);
      if (list) list.push(s); else notasByCustomer.set(s.customer_id, [s]);
    });
    const map = new Map<number, Ledger>();
    customers.forEach(c => {
      const notas = (notasByCustomer.get(c.id) ?? []).slice()
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      const pays = paysByCustomer.get(c.id) ?? [];
      let total = 0;
      const notaRows = notas.map(s => {
        const paidForSale = paidBySale.get(s.id) || 0;
        const outstanding = (s.total_amount || 0) - (s.down_payment || 0) - (s.amount_returned || 0) - paidForSale;
        total += outstanding;
        return { sale: s, paidForSale, outstanding };
      });
      const generalPaid = pays.filter(p => !p.sale_id).reduce((a, p) => a + (p.amount || 0), 0);
      map.set(c.id, { notaRows, pays, net: Math.max(0, total - generalPaid) });
    });
    return map;
  }, [customers, creditSales, payments]);

  const outstandingMap = useMemo(() => {
    const m = new Map<number, number>();
    ledgers.forEach((l, id) => m.set(id, l.net));
    return m;
  }, [ledgers]);

  const totalPiutang = useMemo(
    () => Array.from(outstandingMap.values()).reduce((a, b) => a + b, 0),
    [outstandingMap]
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return customers.filter(c =>
      c.name.toLowerCase().includes(q) || (c.phone || '').toLowerCase().includes(q)
    );
  }, [customers, search]);

  const selectedLedger: Ledger | null = selectedCustomer ? ledgers.get(selectedCustomer.id) ?? null : null;

  // --- ACTIONS ---
  const openCustomer = (c: Customer) => {
    setSelectedCustomer(c);
    if (!isDesktop) setLedgerModal(true);
  };

  const openAddCustomer = () => {
    setEditingCustomer(null);
    setFormName(''); setFormPhone(''); setFormAddress('');
    setCustomerModal(true);
  };

  const openEditCustomer = (c: Customer) => {
    setEditingCustomer(c);
    setFormName(c.name); setFormPhone(c.phone ?? ''); setFormAddress(c.address ?? '');
    setCustomerModal(true);
  };

  const handleSaveCustomer = async () => {
    if (!formName.trim()) return toast.error('Nama pelanggan wajib diisi.');
    setSaving(true);
    const payload = {
      name: formName.trim(),
      phone: formPhone.trim() || null,
      address: formAddress.trim() || null,
    };
    let error;
    if (editingCustomer) {
      ({ error } = await supabase.from('customers').update(payload).eq('id', editingCustomer.id));
    } else {
      ({ error } = await supabase.from('customers').insert([payload]));
    }
    setSaving(false);
    if (error) return toast.error(error.message);
    setCustomerModal(false);
    load();
  };

  const openPayModal = () => {
    if (!selectedCustomer) return;
    setPayAmountStr('');
    setPayMethod(paymentMethods[0]?.name || 'Tunai');
    setPayNotaId(null);
    setPayNote('');
    setPayModal(true);
  };

  const handleRecordPayment = async () => {
    if (!selectedCustomer) return;
    const amount = Math.round(parseNum(payAmountStr));
    if (amount <= 0) return toast.error('Nominal pembayaran harus lebih dari 0.');
    if (!payMethod) return toast.error('Pilih metode pembayaran.');

    setSaving(true);
    const p_payment = {
      customer_id: selectedCustomer.id,
      sale_id: payNotaId, // null => general payment (not tied to a nota)
      amount,
      method: payMethod,
      note: payNote.trim() || null,
      employee_name: profile?.full_name || 'Staff',
    };
    const { error } = await supabase.rpc('record_customer_payment', { p_payment });
    setSaving(false);
    if (error) return toast.error(error.message);
    setPayModal(false);
    load();
  };

  // Print the statement: the shared hidden-iframe printer on web (robust, never
  // popup-blocked), expo-print on native.
  const printStatementHtml = (html: string) => {
    if (Platform.OS === 'web') {
      printHtmlViaIframe(html).catch(() => {});
    } else {
      Print.printAsync({ html }).catch(() => {});
    }
  };

  const handlePrintStatement = () => {
    if (!selectedCustomer || !selectedLedger) return;
    const { notaRows, pays, net } = selectedLedger;
    const notaTable = notaRows.length
      ? notaRows.map(n => `
        <tr>
          <td>${new Date(n.sale.created_at).toLocaleDateString('id-ID')}</td>
          <td>#${n.sale.id}</td>
          <td>${n.sale.payment_method || '-'}</td>
          <td style="text-align:right">${formatRupiah(n.sale.total_amount)}</td>
          <td style="text-align:right">${formatRupiah((n.sale.down_payment || 0) + n.paidForSale)}</td>
          <td style="text-align:right">${formatRupiah(n.outstanding)}</td>
        </tr>`).join('')
      : '<tr><td colspan="6" style="text-align:center;color:#94A3B8">Tidak ada nota tertunggak</td></tr>';
    const payTable = pays.length
      ? pays.map(p => `
        <tr>
          <td>${new Date(p.created_at).toLocaleDateString('id-ID')}</td>
          <td>${p.method || '-'}</td>
          <td>${p.sale_id ? '#' + p.sale_id : 'Umum'}</td>
          <td>${p.note || ''}</td>
          <td style="text-align:right">${formatRupiah(p.amount)}</td>
        </tr>`).join('')
      : '<tr><td colspan="5" style="text-align:center;color:#94A3B8">Belum ada pembayaran</td></tr>';

    const html = `
      <html><head><meta charset="utf-8"><style>
        body{font-family:Arial,sans-serif;color:#1E293B;padding:24px}
        h1{font-size:20px;margin:0} h2{font-size:13px;margin:22px 0 8px;border-bottom:1px solid #CBD5E1;padding-bottom:4px;color:#475569}
        table{width:100%;border-collapse:collapse}
        td,th{padding:6px 4px;font-size:12px;border-bottom:1px solid #E2E8F0;text-align:left}
        th{color:#94A3B8;font-size:10px;text-transform:uppercase}
        .muted{color:#64748B;font-size:12px}
        .net{margin-top:18px;padding:14px;background:#FEF2F2;border-radius:8px;display:flex;justify-content:space-between;align-items:center}
        .net b{font-size:20px;color:#B91C1C}
      </style></head><body>
        <h1>Statement Piutang</h1>
        <div class="muted">${selectedCustomer.name}${selectedCustomer.phone ? ' • ' + selectedCustomer.phone : ''}</div>
        ${selectedCustomer.address ? `<div class="muted">${selectedCustomer.address}</div>` : ''}
        <div class="muted">Dicetak ${new Date().toLocaleString('id-ID')}</div>
        <h2>Nota Belum Lunas</h2>
        <table>
          <tr><th>Tanggal</th><th>Nota</th><th>Metode</th><th style="text-align:right">Total</th><th style="text-align:right">Dibayar</th><th style="text-align:right">Sisa</th></tr>
          ${notaTable}
        </table>
        <h2>Riwayat Pembayaran</h2>
        <table>
          <tr><th>Tanggal</th><th>Metode</th><th>Nota</th><th>Catatan</th><th style="text-align:right">Jumlah</th></tr>
          ${payTable}
        </table>
        <div class="net"><span>TOTAL PIUTANG</span><b>${formatRupiah(net)}</b></div>
      </body></html>`;
    printStatementHtml(html);
  };

  // --- LEDGER (shared by desktop right-pane + mobile modal) ---
  const renderLedger = () => {
    if (!selectedCustomer || !selectedLedger) {
      return (
        <View style={styles.ledgerEmpty}>
          <Feather name="users" size={40} color="#CBD5E1" />
          <Text style={styles.ledgerEmptyText}>Pilih pelanggan untuk melihat buku piutang.</Text>
        </View>
      );
    }
    const { notaRows, pays, net } = selectedLedger;
    return (
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {/* Customer header */}
        <View style={styles.ledgerHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.ledgerName}>{selectedCustomer.name}</Text>
            {!!selectedCustomer.phone && <Text style={styles.ledgerMeta}><Feather name="phone" size={11} color="#94A3B8" /> {selectedCustomer.phone}</Text>}
            {!!selectedCustomer.address && <Text style={styles.ledgerMeta}><Feather name="map-pin" size={11} color="#94A3B8" /> {selectedCustomer.address}</Text>}
          </View>
          <TouchableOpacity style={styles.iconBtn} onPress={() => openEditCustomer(selectedCustomer)}>
            <Feather name="edit-2" size={16} color="#64748B" />
          </TouchableOpacity>
        </View>

        {/* Net outstanding hero */}
        <View style={styles.netCard}>
          <Text style={styles.netLabel}>SISA PIUTANG (NET)</Text>
          <Text style={styles.netVal} numberOfLines={1} adjustsFontSizeToFit>{formatRupiah(net)}</Text>
        </View>

        {/* Actions */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.primaryBtn, { flex: 1 }, !online && styles.btnDisabled]}
            onPress={openPayModal}
            disabled={!online}
          >
            <Feather name="dollar-sign" size={16} color="#FFF" />
            <Text style={styles.primaryBtnText}>CATAT PEMBAYARAN</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.darkBtn} onPress={handlePrintStatement}>
            <Feather name="printer" size={16} color="#FFF" />
            <Text style={styles.primaryBtnText}>STATEMENT</Text>
          </TouchableOpacity>
        </View>
        {!online && <Text style={styles.offlineHint}>Tidak ada koneksi — pencatatan pembayaran dinonaktifkan.</Text>}

        {/* Credit notas */}
        <Text style={styles.sectionTitle}>NOTA BELUM LUNAS</Text>
        {notaRows.length === 0 ? (
          <Text style={styles.emptyInline}>Tidak ada nota tertunggak.</Text>
        ) : (
          notaRows.map(n => (
            <View key={n.sale.id} style={styles.notaCard}>
              <View style={{ flex: 1 }}>
                <View style={styles.notaTopRow}>
                  <Text style={styles.notaId}>Nota #{n.sale.id}</Text>
                  <Text style={[styles.badge, n.sale.status === 'PARTIAL' ? styles.badgePartial : styles.badgeUnpaid]}>{n.sale.status}</Text>
                </View>
                <Text style={styles.notaDate}>{new Date(n.sale.created_at).toLocaleString('id-ID')}{n.sale.payment_method ? ` • ${n.sale.payment_method}` : ''}</Text>
                <Text style={styles.notaSub}>Total {formatRupiah(n.sale.total_amount)} • Dibayar {formatRupiah((n.sale.down_payment || 0) + n.paidForSale)}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.notaOutLabel}>SISA</Text>
                <Text style={styles.notaOut}>{formatRupiah(n.outstanding)}</Text>
              </View>
            </View>
          ))
        )}

        {/* Payment history */}
        <Text style={[styles.sectionTitle, { marginTop: 22 }]}>RIWAYAT PEMBAYARAN</Text>
        {pays.length === 0 ? (
          <Text style={styles.emptyInline}>Belum ada pembayaran tercatat.</Text>
        ) : (
          pays.map(p => (
            <View key={p.id} style={styles.payRow}>
              <View style={styles.payIcon}>
                <Feather name="arrow-down-left" size={16} color="#16A34A" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.payMethod}>{p.method || '—'}{p.sale_id ? ` • Nota #${p.sale_id}` : ' • Umum'}</Text>
                <Text style={styles.payDate}>{new Date(p.created_at).toLocaleString('id-ID')}{p.note ? ` • ${p.note}` : ''}</Text>
              </View>
              <Text style={styles.payAmt}>{formatRupiah(p.amount)}</Text>
            </View>
          ))
        )}
      </ScrollView>
    );
  };

  // --- CUSTOMER LIST ITEM ---
  const renderCustomerItem = ({ item }: { item: Customer }) => {
    const owed = outstandingMap.get(item.id) || 0;
    const active = selectedCustomer?.id === item.id && isDesktop;
    return (
      <TouchableOpacity style={[styles.custCard, active && styles.custCardActive]} onPress={() => openCustomer(item)}>
        <View style={styles.custAvatar}>
          <Text style={styles.custInitial}>{(item.name || '?').charAt(0).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.custName} numberOfLines={1}>{item.name}</Text>
          {!!item.phone && <Text style={styles.custPhone} numberOfLines={1}>{item.phone}</Text>}
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          {owed > 0 ? (
            <>
              <Text style={styles.custOwedLabel}>PIUTANG</Text>
              <Text style={styles.custOwed}>{formatRupiah(owed)}</Text>
            </>
          ) : (
            <Text style={styles.custLunas}>LUNAS</Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  // --- GUARD ---
  if (!isManager) {
    return <View style={styles.center}><Text style={styles.denied}>Akses Owner Diperlukan</Text></View>;
  }

  const listPane = (
    <View style={[styles.listPane, isDesktop && styles.listPaneDesktop]}>
      <View style={styles.summaryBar}>
        <Text style={styles.summaryLabel}>TOTAL PIUTANG</Text>
        <Text style={styles.summaryVal}>{formatRupiah(totalPiutang)}</Text>
      </View>
      <View style={styles.header}>
        <View style={styles.searchBar}>
          <Feather name="search" size={18} color="#94A3B8" />
          <TextInput placeholder="Cari pelanggan..." style={styles.searchInput} value={search} onChangeText={setSearch} />
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={openAddCustomer}>
          <Feather name="plus" size={20} color="#FFF" />
        </TouchableOpacity>
      </View>
      {loading ? (
        <ActivityIndicator style={{ marginTop: 50 }} color="#DC2626" />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(c) => c.id.toString()}
          renderItem={renderCustomerItem}
          contentContainerStyle={{ padding: isDesktop ? 16 : 14, paddingBottom: 100 }}
          ListEmptyComponent={<Text style={styles.emptyInline}>Belum ada pelanggan.</Text>}
        />
      )}
    </View>
  );

  return (
    <View style={[styles.container, isDesktop && styles.row]}>
      {listPane}

      {/* Desktop: ledger as the right pane */}
      {isDesktop && <View style={styles.detailPane}>{renderLedger()}</View>}

      {/* Mobile: ledger as a full-screen modal */}
      <Modal visible={ledgerModal && !isDesktop} animationType="slide" onRequestClose={() => setLedgerModal(false)}>
        <View style={[styles.container, { paddingTop: 50 }]}>
          <View style={styles.modalHeaderBar}>
            <TouchableOpacity onPress={() => setLedgerModal(false)}>
              <Feather name="arrow-left" size={24} color="#0F172A" />
            </TouchableOpacity>
            <Text style={styles.modalHeaderTitle}>Buku Piutang</Text>
            <View style={{ width: 24 }} />
          </View>
          <View style={{ flex: 1, padding: 16 }}>{renderLedger()}</View>
        </View>
      </Modal>

      {/* MODAL: Add / Edit customer */}
      <Modal visible={customerModal} transparent animationType="fade">
        <View style={[styles.modalOverlay, !isDesktop && styles.modalOverlayMobile]}>
          <KeyboardAvoidingView behavior="padding" style={[styles.modalContent, isDesktop && { width: 480 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingCustomer ? 'Edit Pelanggan' : 'Pelanggan Baru'}</Text>
              <TouchableOpacity onPress={() => setCustomerModal(false)}><Feather name="x" size={24} /></TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.label}>Nama Pelanggan</Text>
              <TextInput style={styles.input} value={formName} onChangeText={setFormName} placeholder="Contoh: Toko Maju Jaya" />
              <Text style={styles.label}>No. Telepon / WA</Text>
              <TextInput style={styles.input} value={formPhone} onChangeText={setFormPhone} placeholder="08xxxx" keyboardType="phone-pad" />
              <Text style={styles.label}>Alamat</Text>
              <TextInput style={[styles.input, { height: 80, textAlignVertical: 'top' }]} value={formAddress} onChangeText={setFormAddress} placeholder="Alamat pelanggan" multiline />
              <TouchableOpacity
                style={[styles.primaryBtn, { marginTop: 6 }, (!online || saving) && styles.btnDisabled]}
                onPress={handleSaveCustomer}
                disabled={!online || saving}
              >
                {saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.primaryBtnText}>{editingCustomer ? 'SIMPAN PERUBAHAN' : 'SIMPAN PELANGGAN'}</Text>}
              </TouchableOpacity>
              {!online && <Text style={styles.offlineHint}>Tidak ada koneksi — penyimpanan dinonaktifkan sementara.</Text>}
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* MODAL: Record payment */}
      <Modal visible={payModal} transparent animationType="fade">
        <View style={[styles.modalOverlay, !isDesktop && styles.modalOverlayMobile]}>
          <KeyboardAvoidingView behavior="padding" style={[styles.modalContent, isDesktop && { width: 520 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Catat Pembayaran</Text>
              <TouchableOpacity onPress={() => setPayModal(false)}><Feather name="x" size={24} /></TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.payCustomer}>{selectedCustomer?.name}</Text>
              <Text style={styles.payCustomerSub}>Sisa piutang: {formatRupiah(selectedLedger?.net || 0)}</Text>

              <Text style={[styles.label, { marginTop: 16 }]}>Alokasi ke Nota</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                <TouchableOpacity onPress={() => setPayNotaId(null)} style={[styles.chip, payNotaId === null && styles.chipActive]}>
                  <Text style={payNotaId === null ? styles.chipTextActive : styles.chipText}>Umum</Text>
                </TouchableOpacity>
                {selectedLedger?.notaRows.map(n => {
                  const active = payNotaId === n.sale.id;
                  return (
                    <TouchableOpacity
                      key={n.sale.id}
                      onPress={() => { setPayNotaId(n.sale.id); setPayAmountStr(String(Math.max(0, Math.round(n.outstanding)))); }}
                      style={[styles.chip, active && styles.chipActive]}
                    >
                      <Text style={active ? styles.chipTextActive : styles.chipText}>#{n.sale.id} • {formatRupiah(n.outstanding)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <Text style={styles.label}>Nominal Pembayaran</Text>
              <TextInput style={styles.input} value={payAmountStr} onChangeText={setPayAmountStr} keyboardType="numeric" placeholder="0" />

              <Text style={styles.label}>Metode Pembayaran</Text>
              <View style={styles.payWrap}>
                {paymentMethods.length === 0 ? (
                  <Text style={styles.emptyInline}>Belum ada metode bayar (atur di Setup).</Text>
                ) : (
                  paymentMethods.map(m => {
                    const active = payMethod === m.name;
                    return (
                      <TouchableOpacity key={m.id} onPress={() => setPayMethod(m.name)} style={[styles.payChip, active && styles.payChipActive]}>
                        <Text style={[styles.payChipText, active && styles.payChipTextActive]}>{m.name}</Text>
                      </TouchableOpacity>
                    );
                  })
                )}
              </View>

              <Text style={[styles.label, { marginTop: 16 }]}>Catatan (opsional)</Text>
              <TextInput style={styles.input} value={payNote} onChangeText={setPayNote} placeholder="Catatan pembayaran" />

              <TouchableOpacity
                style={[styles.primaryBtn, { marginTop: 6 }, (!online || saving) && styles.btnDisabled]}
                onPress={handleRecordPayment}
                disabled={!online || saving}
              >
                {saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.primaryBtnText}>SIMPAN PEMBAYARAN</Text>}
              </TouchableOpacity>
              {!online && <Text style={styles.offlineHint}>Tidak ada koneksi — pencatatan dinonaktifkan sementara.</Text>}
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  row: { flexDirection: 'row' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  denied: { color: '#94A3B8', fontWeight: '700' },

  // List pane
  listPane: { flex: 1, backgroundColor: '#F8FAFC' },
  listPaneDesktop: { maxWidth: 380, borderRightWidth: 1, borderRightColor: '#E2E8F0' },
  summaryBar: { backgroundColor: '#0F172A', paddingHorizontal: 20, paddingVertical: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryLabel: { fontSize: 10, fontWeight: '800', color: '#94A3B8', letterSpacing: 1 },
  summaryVal: { fontSize: 16, fontWeight: '900', color: '#FFF' },
  header: { padding: 16, backgroundColor: '#FFF', flexDirection: 'row', gap: 10, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  searchBar: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#F1F5F9', borderRadius: 12, paddingHorizontal: 15, height: 45 },
  searchInput: { flex: 1, marginLeft: 10, fontSize: 14, outlineStyle: 'none' } as any,
  addBtn: { width: 45, height: 45, backgroundColor: '#DC2626', borderRadius: 12, justifyContent: 'center', alignItems: 'center' },

  custCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', padding: 14, borderRadius: 16, marginBottom: 10, borderWidth: 1, borderColor: '#E2E8F0', gap: 12 },
  custCardActive: { borderColor: '#DC2626', backgroundColor: '#FEF2F2' },
  custAvatar: { width: 42, height: 42, borderRadius: 12, backgroundColor: '#FEE2E2', justifyContent: 'center', alignItems: 'center' },
  custInitial: { fontSize: 18, fontWeight: '900', color: '#DC2626' },
  custName: { fontSize: 15, fontWeight: '700', color: '#1F2937' },
  custPhone: { fontSize: 12, color: '#94A3B8', marginTop: 1 },
  custOwedLabel: { fontSize: 8, fontWeight: '900', color: '#94A3B8', letterSpacing: 0.5 },
  custOwed: { fontSize: 14, fontWeight: '900', color: '#B45309' },
  custLunas: { fontSize: 10, fontWeight: '900', color: '#16A34A', backgroundColor: '#DCFCE7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },

  // Detail pane
  detailPane: { flex: 1.4, padding: 24 },
  ledgerEmpty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40, gap: 12 },
  ledgerEmptyText: { color: '#94A3B8', fontWeight: '600', textAlign: 'center' },
  ledgerHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 16 },
  ledgerName: { fontSize: 22, fontWeight: '900', color: '#0F172A' },
  ledgerMeta: { fontSize: 12, color: '#64748B', marginTop: 4 },
  iconBtn: { width: 38, height: 38, borderRadius: 10, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center' },

  netCard: { backgroundColor: '#DC2626', borderRadius: 16, padding: 18, marginBottom: 14 },
  netLabel: { fontSize: 10, fontWeight: '800', color: 'rgba(255,255,255,0.7)', letterSpacing: 1 },
  netVal: { fontSize: 30, fontWeight: '900', color: '#FFF', marginTop: 4 },

  actionRow: { flexDirection: 'row', gap: 10, marginBottom: 6 },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#DC2626', paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12 },
  primaryBtnText: { color: '#FFF', fontWeight: '900', fontSize: 12, letterSpacing: 0.5 },
  darkBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#0F172A', paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12 },
  btnDisabled: { opacity: 0.45 },
  offlineHint: { fontSize: 11, color: '#B45309', marginTop: 8, fontWeight: '600' },

  sectionTitle: { fontSize: 11, fontWeight: '900', color: '#94A3B8', letterSpacing: 1, marginTop: 20, marginBottom: 12 },
  emptyInline: { color: '#94A3B8', fontStyle: 'italic', paddingVertical: 8 },

  notaCard: { flexDirection: 'row', backgroundColor: '#FFF', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#FED7AA', gap: 10 },
  notaTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  notaId: { fontSize: 14, fontWeight: '800', color: '#0F172A' },
  notaDate: { fontSize: 11, color: '#94A3B8', marginTop: 3 },
  notaSub: { fontSize: 11, color: '#64748B', marginTop: 4 },
  notaOutLabel: { fontSize: 8, fontWeight: '900', color: '#94A3B8' },
  notaOut: { fontSize: 16, fontWeight: '900', color: '#B45309' },
  badge: { fontSize: 9, fontWeight: '900', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  badgePartial: { backgroundColor: '#FEF3C7', color: '#B45309' },
  badgeUnpaid: { backgroundColor: '#FEE2E2', color: '#991B1B' },

  payRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#F1F5F9', gap: 12 },
  payIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#DCFCE7', justifyContent: 'center', alignItems: 'center' },
  payMethod: { fontSize: 13, fontWeight: '700', color: '#1F2937' },
  payDate: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  payAmt: { fontSize: 14, fontWeight: '900', color: '#16A34A' },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalOverlayMobile: { padding: 0, justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFF', borderRadius: 24, padding: 26, width: '100%', maxHeight: '92%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  modalTitle: { fontSize: 18, fontWeight: '900', color: '#0F172A' },
  modalHeaderBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  modalHeaderTitle: { fontSize: 16, fontWeight: '900', color: '#0F172A' },

  label: { fontSize: 11, fontWeight: '800', color: '#94A3B8', marginBottom: 8, textTransform: 'uppercase' },
  input: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, padding: 13, fontSize: 15, color: '#0F172A', marginBottom: 16 },

  payCustomer: { fontSize: 18, fontWeight: '900', color: '#0F172A' },
  payCustomerSub: { fontSize: 13, color: '#B45309', fontWeight: '700', marginTop: 2 },
  payWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  payChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0' },
  payChipActive: { backgroundColor: '#0F172A', borderColor: '#0F172A' },
  payChipText: { fontSize: 13, fontWeight: '700', color: '#475569' },
  payChipTextActive: { color: '#FFF' },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F1F5F9', marginRight: 8, borderWidth: 1, borderColor: '#E2E8F0' },
  chipActive: { backgroundColor: '#DC2626', borderColor: '#DC2626' },
  chipText: { fontSize: 12, color: '#475569', fontWeight: '600' },
  chipTextActive: { color: '#FFF', fontWeight: '700' },
});
