import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Print from 'expo-print';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Keyboard, KeyboardAvoidingView,
  Modal, Platform, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity, useWindowDimensions, View, ViewStyle
} from 'react-native';
import { parseNum } from '../../lib/number';
import { generatePrintHtml } from '../../lib/printTemplates';
import { useProfile } from '../../lib/ProfileContext';
import { supabase } from '../../lib/supabase';

// --- TYPES ---
interface Profile {
  id: string;
  full_name: string;
  role: 'SUPERADMIN' | 'OWNER' | 'ADMIN' | 'STAFF'; // Updated to match your system roles
}

interface InventoryItem {
  id: number;
  item_name: string;
  quantity: number;
  price: number;
  allow_preorder?: boolean;
}

interface PaymentMethod {
  id: number;
  name: string;
}

interface SaleRow {
  _id: string;
  item: InventoryItem | null;
  query: string;
  qty: string;
  price: string;
  total: string;
}

interface Sale {
  id: number;
  total_amount: number;
  payment_method: string;
  customer_name: string;
  status: 'PAID' | 'PARTIAL' | 'UNPAID';
  down_payment: number;
  employee_name: string;
  created_at: string;
}

interface SaleItem {
  id?: number;
  sale_id: number;
  inventory_id: number;
  item_name: string;
  quantity: number;
  price_at_sale: number;
}

interface PrintSettings {
  id: number;
  shop_name: string;
  shop_address: string;
  shop_phone: string;
  thermal_footer: string;
  invoice_footer: string;
  do_footer: string;
}

// --- PURE HELPERS ---
const formatRupiah = (n: number) => 
  new Intl.NumberFormat('id-ID', { 
    style: 'currency', 
    currency: 'IDR', 
    minimumFractionDigits: 0 
  }).format(Math.round(n) || 0);

const generateId = () => Math.random().toString(36).substring(2, 15);

const MONO_STACK = Platform.select({
  ios: 'Courier New',
  android: 'monospace',
  default: 'monospace'
});

export default function UnifiedPOSHub() {
  const { profile: rawProfile } = useProfile();
  // Using unknown as intermediary to satisfy the compiler's overlap check
  const profile = rawProfile as unknown as Profile;
  const { width } = useWindowDimensions();
  const isDesktop = width > 1100;

  // --- STATE ---
  const [activeTab, setActiveTab] = useState<'input' | 'history'>('input');
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<PrintSettings | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);

  // POS Input
  const [customerName, setCustomerName] = useState('Umum');
  const [selectedPayment, setSelectedPayment] = useState('');
  const [cashReceivedStr, setCashReceivedStr] = useState('');
  const [downPaymentStr, setDownPaymentStr] = useState('');
  const [rows, setRows] = useState<SaleRow[]>([{ _id: generateId(), item: null, query: '', qty: '1', price: '0', total: '0' }]);
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const [filteredInv, setFilteredInv] = useState<InventoryItem[]>([]);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Modal States
  const [printModal, setPrintModal] = useState(false);
  const [editModal, setEditModal] = useState(false);
  const [lastSale, setLastSale] = useState<Sale | null>(null);
  const [lastSaleItems, setLastSaleItems] = useState<SaleItem[]>([]);
  const [editingSale, setEditingSale] = useState<Sale | null>(null);

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (activeTab === 'history') loadHistory();
  }, [activeTab]);

  const loadInitialData = async () => {
    try {
      const [setRes, pmRes] = await Promise.all([
        supabase.from('print_settings').select('*').eq('id', 1).single(),
        supabase.from('payment_methods').select('*').order('name')
      ]);

      if (setRes.error) throw new Error("Gagal mengambil pengaturan cetak");
      if (pmRes.error) throw new Error("Gagal mengambil metode pembayaran");

      if (setRes.data) setSettings(setRes.data);
      if (pmRes.data) {
        setPaymentMethods(pmRes.data);
        if (pmRes.data.length > 0) setSelectedPayment(pmRes.data[0].name);
      }
    } catch (err: any) {
      Alert.alert("Data Error", err.message || "Error tidak diketahui");
    }
  };

  const loadHistory = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('sales').select('*').order('created_at', { ascending: false }).limit(50);
    if (error) Alert.alert("Error", "Gagal memuat riwayat transaksi");
    if (data) setSales(data as Sale[]);
    setLoading(false);
  };

  // --- CALCULATIONS ---
  const currentTotal = useMemo(() => 
    Math.round(rows.reduce((acc, row) => acc + parseNum(row.total), 0)), 
  [rows]);
  
  const cashReceived = Math.round(parseNum(cashReceivedStr));
  const downPayment = Math.round(parseNum(downPaymentStr));
  const changeAmount = cashReceived - currentTotal;
  const remainingBalance = Math.max(0, currentTotal - downPayment);
  const isTempo = selectedPayment.toLowerCase().includes('tempo');

  // --- POS ACTIONS ---
  const handleSearch = (text: string, rowId: string) => {
    setRows(prev => prev.map(r => r._id === rowId ? { ...r, query: text } : r));
    setActiveRowId(rowId);

    if (searchTimer.current) clearTimeout(searchTimer.current);
    const q = text.trim();
    if (!q) { setFilteredInv([]); return; }

    // Server-side search so a catalog of thousands stays fast (only matches are fetched).
    searchTimer.current = setTimeout(async () => {
      const { data } = await supabase
        .from('inventory')
        .select('*')
        .ilike('item_name', `%${q}%`)
        .order('item_name')
        .limit(25);
      setFilteredInv((data as InventoryItem[]) || []);
    }, 250);
  };

  const selectItem = (item: InventoryItem, rowId: string) => {
    const isDuplicate = rows.some(r => r.item?.id === item.id && r._id !== rowId);
    if (isDuplicate) return Alert.alert("Item Duplikat", "Barang sudah ada di daftar.");

    setRows(prev => {
      const newRows = prev.map(r => r._id === rowId ? { 
        ...r, item, query: item.item_name, price: item.price.toString(), total: item.price.toString() 
      } : r);
      if (newRows[newRows.length - 1]._id === rowId) {
        newRows.push({ _id: generateId(), item: null, query: '', qty: '1', price: '0', total: '0' });
      }
      return newRows;
    });
    setActiveRowId(null);
    Keyboard.dismiss();
  };

  const updateRow = (rowId: string, field: 'qty' | 'price', val: string) => {
    setRows(prev => prev.map(r => {
      if (r._id !== rowId) return r;
      const updated = { ...r, [field]: val };
      const rowTotal = Math.round(parseNum(updated.qty) * parseNum(updated.price));
      updated.total = rowTotal.toString();
      return updated;
    }));
  };

  const removeRow = (rowId: string) => {
    if (rows.length > 1) setRows(rows.filter(r => r._id !== rowId));
  };

  const stepQty = (rowId: string, delta: number) => {
    const row = rows.find(r => r._id === rowId);
    const next = Math.max(0, parseNum(row?.qty) + delta);
    updateRow(rowId, 'qty', String(next));
  };

  // --- CORE TRANSACTIONS ---
  const validateSale = (validRows: SaleRow[]) => {
    if (validRows.length === 0) {
      Alert.alert("Kosong", "Pilih barang terlebih dahulu.");
      return false;
    }
    const outOfStock = validRows.filter(r => !r.item?.allow_preorder && parseNum(r.qty) > (r.item?.quantity || 0));
    if (outOfStock.length > 0) {
      const names = outOfStock.map(r => `- ${r.item?.item_name} (Stok: ${r.item?.quantity})`).join('\n');
      Alert.alert("Stok Tidak Cukup", `Barang berikut melebihi stok:\n${names}`);
      return false;
    }
    if (!isTempo && cashReceived < currentTotal) {
      Alert.alert("Uang Kurang", `Pembayaran tunai minimal ${formatRupiah(currentTotal)}`);
      return false;
    }
    if (isTempo && (!customerName || customerName === 'Umum')) {
      Alert.alert("Validasi", "Nama pelanggan wajib diisi untuk transaksi Tempo.");
      return false;
    }
    return true;
  };

  const handleCheckout = async () => {
    const validRows = rows.filter(r => r.item && parseNum(r.qty) > 0);
    if (!validateSale(validRows)) return;

    setLoading(true);
    try {
      const salePayload = {
        total_amount: currentTotal,
        payment_method: selectedPayment,
        customer_name: customerName,
        status: isTempo ? (remainingBalance === 0 ? 'PAID' : 'PARTIAL') : 'PAID',
        down_payment: isTempo ? downPayment : currentTotal,
        employee_name: profile?.full_name || 'Staff'
      };

      const itemsToSave = validRows.map(r => ({
        inventory_id: r.item!.id,
        item_name: r.item!.item_name,
        quantity: parseNum(r.qty),
        price_at_sale: Math.round(parseNum(r.price))
      }));

      // Atomic: inserts the sale + items and decrements stock in one transaction.
      const { data: sale, error } = await supabase.rpc('create_sale', {
        p_sale: salePayload,
        p_items: itemsToSave
      });
      if (error) throw error;

      setLastSale(sale as Sale);
      setLastSaleItems(itemsToSave.map(it => ({ ...it, sale_id: (sale as Sale).id })));
      setPrintModal(true);
      resetPOS();
      loadInitialData();
    } catch (e: any) {
      Alert.alert("Transaksi Gagal", e.message);
    } finally {
      setLoading(false);
    }
  };

  const resetPOS = () => {
    setRows([{ _id: generateId(), item: null, query: '', qty: '1', price: '0', total: '0' }]);
    setCustomerName('Umum'); 
    setCashReceivedStr(''); 
    setDownPaymentStr('');
  };

  // --- HISTORY ACTIONS (OWNER/ADMIN ONLY) ---
  const handleEditSale = async (sale: Sale) => {
    setLoading(true);
    const { data: items, error } = await supabase.from('sale_items').select('*').eq('sale_id', sale.id);
    if (error) {
      Alert.alert("Error", "Gagal memuat detail item.");
      setLoading(false);
      return;
    }

    setEditingSale(sale);
    setCustomerName(sale.customer_name);
    setSelectedPayment(sale.payment_method);
    setDownPaymentStr(sale.down_payment.toString());

    // Pull only the inventory rows referenced by this sale (no full-catalog load).
    const ids = (items as SaleItem[]).map(it => it.inventory_id);
    const { data: invData } = await supabase.from('inventory').select('*').in('id', ids);
    const invMap = new Map((invData as InventoryItem[] || []).map(i => [i.id, i]));

    const mappedRows: SaleRow[] = (items as SaleItem[]).map(it => {
      const inv = invMap.get(it.inventory_id) || null;
      return {
        _id: generateId(),
        item: inv,
        query: it.item_name,
        qty: it.quantity.toString(),
        price: it.price_at_sale.toString(),
        total: (it.quantity * it.price_at_sale).toString()
      };
    });
    mappedRows.push({ _id: generateId(), item: null, query: '', qty: '1', price: '0', total: '0' });
    
    setRows(mappedRows);
    setEditModal(true);
    setLoading(false);
  };

  const handleUpdateSale = async () => {
    if (!editingSale) return;
    const validRows = rows.filter(r => r.item && parseNum(r.qty) > 0);
    
    setLoading(true);
    try {
      const salePayload = {
        total_amount: currentTotal,
        payment_method: selectedPayment,
        customer_name: customerName,
        status: isTempo ? (remainingBalance === 0 ? 'PAID' : 'PARTIAL') : 'PAID',
        down_payment: isTempo ? downPayment : currentTotal
      };

      const newItems = validRows.map(r => ({
        inventory_id: r.item!.id,
        item_name: r.item!.item_name,
        quantity: parseNum(r.qty),
        price_at_sale: Math.round(parseNum(r.price))
      }));

      // Atomic: restores old stock, swaps items, re-decrements — single transaction.
      const { error } = await supabase.rpc('update_sale', {
        p_sale_id: editingSale.id,
        p_sale: salePayload,
        p_items: newItems
      });
      if (error) throw error;

      Alert.alert("Berhasil", "Transaksi telah diperbarui.");
      setEditModal(false);
      resetPOS();
      loadHistory();
      loadInitialData();
    } catch (e: any) {
      Alert.alert("Gagal Update", e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSale = (sale: Sale) => {
    Alert.alert(
      "Hapus Transaksi",
      "Data stok akan dikembalikan dan transaksi dihapus permanen. Lanjutkan?",
      [
        { text: "Batal", style: "cancel" },
        { 
          text: "Hapus", 
          style: "destructive",
          onPress: async () => {
            setLoading(true);
            try {
              // Atomic: restocks the items and removes the sale in one transaction.
              const { error } = await supabase.rpc('delete_sale', { p_sale_id: sale.id });
              if (error) throw error;
              loadHistory();
              loadInitialData();
            } catch (e: any) {
              Alert.alert("Error", e.message);
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  const executePrint = async (type: 'THERMAL' | 'FAKTUR' | 'DO') => {
    if (!lastSale || !settings) return;
    const html = generatePrintHtml(type, settings, lastSale, lastSaleItems);
    if (Platform.OS === 'web') {
      const win = window.open('', '_blank');
      win?.document.write(html);
      win?.document.close();
    } else {
      await Print.printAsync({ html });
    }
  };

  // --- SUB-COMPONENTS ---
  const renderInputTable = () => (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>DETAIL PESANAN</Text>
      <View style={styles.tableHead}>
        <Text style={[styles.th, { flex: 2.6 }]}>BARANG</Text>
        <Text style={[styles.th, { flex: 0.8, textAlign: 'center' }]}>STOK</Text>
        <Text style={[styles.th, { flex: 1.8, textAlign: 'center' }]}>QTY</Text>
        <Text style={[styles.th, { flex: 1.3, textAlign: 'center' }]}>HARGA</Text>
        <Text style={[styles.th, { flex: 1.5, textAlign: 'right', paddingRight: 10 }]}>TOTAL</Text>
        <View style={{ width: 30 }} />
      </View>

      {rows.map((row) => (
        <View key={row._id} style={[styles.tableRow, { zIndex: activeRowId === row._id ? 100 : 1 }]}>
          <View style={{ flex: 2.6 }}>
            <TextInput
              style={styles.cellInput}
              placeholder="Cari item..."
              value={row.query} 
              onChangeText={t => handleSearch(t, row._id)} 
              onFocus={() => setActiveRowId(row._id)}
            />
            {activeRowId === row._id && filteredInv.length > 0 && (
              <View style={styles.suggestBox}>
                <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled style={{maxHeight: 200}}>
                  {filteredInv.map(item => (
                    <TouchableOpacity key={item.id} style={styles.suggestItem} onPress={() => selectItem(item, row._id)}>
                      <Text style={{ fontWeight: 'bold', color: '#0F172A' }}>{item.item_name}</Text>
                      <Text style={[styles.mono, { fontSize: 11, color: '#64748B' }]}>{formatRupiah(item.price)} • Stok: {item.quantity}{item.allow_preorder ? ' • Pre-order' : ''}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>
          <Text style={[styles.mono, styles.cellText, { flex: 0.8 }]}>{row.item?.quantity ?? '-'}</Text>
          <View style={styles.qtyStepper}>
            <TouchableOpacity style={styles.stepBtn} onPress={() => stepQty(row._id, -1)}>
              <Ionicons name="remove" size={16} color="#0F172A" />
            </TouchableOpacity>
            <TextInput style={[styles.mono, styles.qtyInput]} keyboardType="numeric" value={row.qty} onChangeText={t => updateRow(row._id, 'qty', t)} />
            <TouchableOpacity style={styles.stepBtn} onPress={() => stepQty(row._id, 1)}>
              <Ionicons name="add" size={16} color="#0F172A" />
            </TouchableOpacity>
          </View>
          <TextInput style={[styles.mono, styles.cellInput, { flex: 1.3 }]} keyboardType="numeric" value={row.price} onChangeText={t => updateRow(row._id, 'price', t)} />
          <Text style={[styles.mono, styles.cellTotal, { flex: 1.5 }]}>{formatRupiah(parseNum(row.total))}</Text>
          <TouchableOpacity onPress={() => removeRow(row._id)} style={styles.removeBtn}>
            <Ionicons name="trash-outline" size={18} color="#94A3B8" />
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );

  const renderCheckout = () => (
    <View style={styles.receiptCard as ViewStyle}>
      <Text style={styles.sectionTitle}>PEMBAYARAN</Text>
      
      <View style={styles.mb15}>
        <Text style={styles.label}>Nama Pelanggan</Text>
        <TextInput style={styles.input} value={customerName} onChangeText={setCustomerName} placeholder="Umum" />
      </View>

      <View style={styles.mb15}>
        <Text style={styles.label}>Metode Bayar</Text>
        {paymentMethods.length > 0 ? (
          <View style={styles.payWrap}>
            {paymentMethods.map(m => {
              const active = selectedPayment === m.name;
              return (
                <TouchableOpacity key={m.id} onPress={() => setSelectedPayment(m.name)} style={[styles.payChip, active && styles.payChipActive]}>
                  <Text style={[styles.payChipText, active && styles.payChipTextActive]}>{m.name}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          <Text style={styles.emptyText}>Memuat metode...</Text>
        )}
      </View>

      <View style={styles.receiptDivider} />

      <View style={styles.rowBetween}>
        <Text style={styles.totalLabel}>TOTAL</Text>
        <Text style={[styles.mono, styles.grandTotalText]}>{formatRupiah(currentTotal)}</Text>
      </View>

      <View style={{ marginTop: 15 }}>
        {isTempo ? (
          <View>
            <Text style={styles.label}>Uang Muka (DP)</Text>
            <TextInput style={[styles.mono, styles.input]} keyboardType="numeric" value={downPaymentStr} onChangeText={setDownPaymentStr} />
            <View style={[styles.rowBetween, { marginTop: 10 }]}>
              <Text style={styles.label}>Sisa Hutang</Text>
              <Text style={[styles.mono, styles.subTotal, { color: '#B45309' }]}>{formatRupiah(remainingBalance)}</Text>
            </View>
          </View>
        ) : (
          <View>
            <Text style={styles.label}>Uang Diterima</Text>
            <View style={styles.row}>
              <TextInput style={[styles.mono, styles.input, { flex: 1, marginBottom: 0 }]} keyboardType="numeric" value={cashReceivedStr} onChangeText={setCashReceivedStr} />
              <TouchableOpacity style={styles.pasBtn} onPress={() => setCashReceivedStr(currentTotal.toString())}>
                <Text style={styles.pasText}>PAS</Text>
              </TouchableOpacity>
            </View>
            <View style={[styles.rowBetween, { marginTop: 10 }]}>
              <Text style={styles.label}>Kembalian</Text>
              <Text style={[styles.mono, styles.subTotal, { color: changeAmount < 0 ? '#DC2626' : '#16A34A' }]}>{formatRupiah(changeAmount)}</Text>
            </View>
          </View>
        )}
      </View>

      <TouchableOpacity onPress={handleCheckout} disabled={loading} style={{ marginTop: 25 }}>
        <LinearGradient colors={['#DC2626', '#991B1B']} style={styles.payBtn}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.payBtnText}>PROSES TRANSAKSI</Text>}
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.tabToggle}>
          <TouchableOpacity style={[styles.tabBtn, activeTab === 'input' && styles.tabBtnActive]} onPress={() => setActiveTab('input')}>
            <Text style={[styles.tabText, activeTab === 'input' && styles.tabTextActive]}>KASIR</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tabBtn, activeTab === 'history' && styles.tabBtnActive]} onPress={() => setActiveTab('history')}>
            <Text style={[styles.tabText, activeTab === 'history' && styles.tabTextActive]}>RIWAYAT</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {activeTab === 'input' ? (
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={isDesktop ? styles.desktopLayout : styles.mobileLayout}>
            <View style={isDesktop ? { flex: 2 } : { width: '100%' }}>
              {renderInputTable()}
            </View>
            <View style={isDesktop ? { flex: 1, marginLeft: 20 } : { width: '100%' }}>
              {renderCheckout()}
            </View>
          </KeyboardAvoidingView>
        ) : (
          <View style={styles.historyContainer}>
            <Text style={styles.sectionTitle}>TRANSAKSI TERBARU</Text>
            {sales.map((item) => (
              <View key={item.id} style={styles.historyCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.hName}>{item.customer_name}</Text>
                  <Text style={styles.hDate}>{new Date(item.created_at).toLocaleString('id-ID')}</Text>
                  <View style={styles.hMeta}>
                    <Text style={[styles.badge, 
                      item.status === 'PAID' ? styles.badgePaid : 
                      item.status === 'PARTIAL' ? styles.badgePartial : styles.badgeUnpaid]}>
                      {item.status}
                    </Text>
                    <Text style={styles.hPm}>{item.payment_method}</Text>
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.mono, styles.hPrice]}>{formatRupiah(item.total_amount)}</Text>
                  <View style={styles.hActions}>
                    {profile?.role !== 'STAFF' && (
                      <>
                        <TouchableOpacity style={styles.iconBtn} onPress={() => handleEditSale(item)}>
                          <Ionicons name="create-outline" size={18} color="#0F172A" />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.iconBtn} onPress={() => handleDeleteSale(item)}>
                          <Ionicons name="trash-outline" size={18} color="#DC2626" />
                        </TouchableOpacity>
                      </>
                    )}
                    <TouchableOpacity 
                      style={styles.reprintBtn} 
                      onPress={async () => {
                          setLastSale(item);
                          const {data} = await supabase.from('sale_items').select('*').eq('sale_id', item.id);
                          setLastSaleItems(data as SaleItem[] || []);
                          setPrintModal(true);
                      }}
                    >
                      <Ionicons name="print-outline" size={18} color="#16A34A" />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <Modal visible={editModal} animationType="slide">
        <View style={[styles.container, { paddingTop: 50 }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Edit Transaksi #{editingSale?.id}</Text>
            <TouchableOpacity onPress={() => { setEditModal(false); resetPOS(); }}>
              <Ionicons name="close" size={28} color="#0F172A" />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.scrollContent}>
            {renderInputTable()}
            {renderCheckout()}
            <TouchableOpacity style={[styles.payBtn, { backgroundColor: '#0F172A', marginBottom: 40 }]} onPress={handleUpdateSale}>
              <Text style={styles.payBtnText}>SIMPAN PERUBAHAN</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={printModal} transparent animationType="fade">
        <View style={styles.overlay}><View style={styles.modalCard}>
          <Ionicons name="checkmark-circle" size={64} color="#16A34A" />
          <Text style={styles.modalTitle}>Berhasil!</Text>
          <TouchableOpacity style={[styles.pOption, {backgroundColor: '#DC2626'}]} onPress={() => executePrint('THERMAL')}>
            <Ionicons name="print" size={20} color="#FFF" style={{marginRight:10}} />
            <Text style={styles.pOptionText}>STRUK THERMAL</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.pOption, {backgroundColor: '#0F172A'}]} onPress={() => executePrint('FAKTUR')}>
            <Ionicons name="document-text" size={20} color="#FFF" style={{marginRight:10}} />
            <Text style={styles.pOptionText}>FAKTUR A5</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.pOption, {backgroundColor: '#16A34A'}]} onPress={() => executePrint('DO')}>
            <Ionicons name="bus" size={20} color="#FFF" style={{marginRight:10}} />
            <Text style={styles.pOptionText}>SURAT JALAN</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setPrintModal(false)} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>SELESAI</Text>
          </TouchableOpacity>
        </View></View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  mono: { fontFamily: MONO_STACK },
  container: { flex: 1, backgroundColor: '#FEF2F2' },
  header: { backgroundColor: '#FFF', padding: 15, borderBottomWidth: 1, borderBottomColor: '#FEE2E2' },
  tabToggle: { flexDirection: 'row', backgroundColor: '#FEF2F2', borderRadius: 12, padding: 4 },
  tabBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  tabBtnActive: { backgroundColor: '#0F172A' },
  tabText: { fontWeight: 'bold', color: '#94A3B8', fontSize: 13 },
  tabTextActive: { color: '#FFF' },
  scrollContent: { padding: 15 },
  desktopLayout: { flexDirection: 'row', alignItems: 'flex-start' },
  mobileLayout: { flexDirection: 'column' },
  card: { backgroundColor: '#FFF', borderRadius: 16, padding: 20, marginBottom: 15, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 3 },
  sectionTitle: { fontSize: 11, fontWeight: '900', color: '#94A3B8', marginBottom: 15, letterSpacing: 1.2, textTransform: 'uppercase' },
  label: { fontSize: 11, fontWeight: '700', color: '#64748B', marginBottom: 6 },
  input: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, padding: 12, fontSize: 14, color: '#0F172A' },
  mb15: { marginBottom: 15 },
  row: { flexDirection: 'row' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  emptyText: { paddingLeft: 10, fontSize: 12, color: '#94A3B8' },
  payWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  payChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0' },
  payChipActive: { backgroundColor: '#0F172A', borderColor: '#0F172A' },
  payChipText: { fontSize: 13, fontWeight: '700', color: '#475569' },
  payChipTextActive: { color: '#FFF' },
  tableHead: { flexDirection: 'row', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F1F5F9', marginBottom: 10 },
  th: { fontSize: 10, fontWeight: '800', color: '#94A3B8' },
  tableRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  cellInput: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 6, padding: 8, fontSize: 13, textAlign: 'center' },
  cellText: { fontSize: 13, textAlign: 'center', color: '#0F172A' },
  cellTotal: { fontSize: 13, fontWeight: '700', color: '#0F172A', textAlign: 'right' },
  removeBtn: { width: 30, alignItems: 'center' },
  qtyStepper: { flex: 1.8, flexDirection: 'row', alignItems: 'center' },
  stepBtn: { width: 26, height: 32, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 6, justifyContent: 'center', alignItems: 'center' },
  qtyInput: { flex: 1, backgroundColor: '#F8FAFC', borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#E2E8F0', paddingVertical: 8, fontSize: 13, textAlign: 'center', marginHorizontal: 2, color: '#0F172A' },
  suggestBox: { position: 'absolute', top: 42, left: 0, right: 0, backgroundColor: '#FFF', borderRadius: 8, elevation: 10, zIndex: 1000, borderWidth: 1, borderColor: '#E2E8F0' },
  suggestItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  receiptCard: { 
    backgroundColor: '#FFF', 
    padding: 25, 
    borderRadius: 2, 
    borderTopWidth: 2, 
    borderTopColor: '#0F172A', 
    borderStyle: 'dashed', // Applying style to all borders but only showing Top via Width
    shadowOpacity: 0.1, 
    shadowRadius: 10, 
    elevation: 5 
  },
  receiptDivider: { height: 1, backgroundColor: '#F1F5F9', marginVertical: 20 },
  totalLabel: { fontSize: 14, fontWeight: '900', color: '#0F172A' },
  grandTotalText: { fontSize: 28, fontWeight: '900', color: '#DC2626' },
  subTotal: { fontSize: 18, fontWeight: '700' },
  pasBtn: { backgroundColor: '#0F172A', borderRadius: 8, paddingHorizontal: 15, justifyContent: 'center', marginLeft: 8 },
  pasText: { color: '#FFF', fontWeight: 'bold', fontSize: 11 },
  payBtn: { paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  payBtnText: { color: '#FFF', fontWeight: '900', fontSize: 15, letterSpacing: 1 },
  historyContainer: { width: '100%' },
  historyCard: { backgroundColor: '#FFF', padding: 18, borderRadius: 12, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: '#FEE2E2' },
  hName: { fontWeight: '800', fontSize: 15, color: '#0F172A' },
  hDate: { fontSize: 10, color: '#94A3B8', marginTop: 2 },
  hPrice: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  hMeta: { flexDirection: 'row', gap: 6, marginTop: 8, alignItems: 'center' },
  hPm: { fontSize: 9, fontWeight: '700', color: '#64748B', backgroundColor: '#F1F5F9', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  badge: { fontSize: 9, fontWeight: '900', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  badgePaid: { backgroundColor: '#DCFCE7', color: '#166534' },
  badgePartial: { backgroundColor: '#FEF3C7', color: '#B45309' },
  badgeUnpaid: { backgroundColor: '#FEE2E2', color: '#991B1B' },
  hActions: { flexDirection: 'row', gap: 12, marginTop: 10 },
  iconBtn: { padding: 4 },
  reprintBtn: { padding: 4 },
  overlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.8)', justifyContent: 'center', alignItems: 'center' },
  modalCard: { backgroundColor: '#FFF', width: '85%', maxWidth: 400, borderRadius: 24, padding: 30, alignItems: 'center' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: '900', color: '#0F172A', marginVertical: 10 },
  pOption: { width: '100%', padding: 16, borderRadius: 12, marginBottom: 10, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
  pOptionText: { color: '#FFF', fontWeight: '800', fontSize: 12, letterSpacing: 0.5 },
  closeBtn: { marginTop: 15, padding: 10 },
  closeBtnText: { color: '#94A3B8', fontWeight: '800', letterSpacing: 1.2, fontSize: 12 }
});