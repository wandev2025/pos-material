import { Feather } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import CommandPalette from '../../components/CommandPalette';
import { formatRupiah } from '../../lib/format';
import { parseNum } from '../../lib/number';
import { useOnline } from '../../lib/offline/OfflineContext';
import { useProfile } from '../../lib/ProfileContext';
import { atLeast } from '../../lib/roles';
import { supabase } from '../../lib/supabase';
import { toast } from '../../lib/toast';

// --- HELPERS ---
const generateId = () => Math.random().toString(36).substring(2, 12);

// Purchase status is derived from how much has been paid vs the total.
const computeStatus = (total: number, paid: number): 'PAID' | 'PARTIAL' | 'UNPAID' => {
  if (total > 0 && paid >= total) return 'PAID';
  if (paid > 0) return 'PARTIAL';
  return 'UNPAID';
};

// --- TYPES ---
interface Supplier {
  id: number;
  name: string;
  phone?: string;
  address?: string;
}
interface Metric {
  id: number;
  unit_name: string;
}
interface InventoryItem {
  id: number;
  item_name: string;
  quantity: number;
  price: number;
  cost?: number;
  category?: string | null;
}
interface PurchaseRow {
  _id: string;
  item: InventoryItem | null;
  query: string;
  qty: string;
  cost: string;
  total: string;
}
interface Purchase {
  id: number;
  supplier_id: number | null;
  supplier_name: string;
  invoice_no: string;
  total_amount: number;
  paid_amount: number;
  status: 'PAID' | 'PARTIAL' | 'UNPAID';
  note: string;
  employee_name: string;
  created_at: string;
}

const emptyRow = (): PurchaseRow => ({ _id: generateId(), item: null, query: '', qty: '1', cost: '0', total: '0' });

export default function PembelianScreen() {
  const { profile } = useProfile();
  const { width } = useWindowDimensions();
  const isDesktop = width > 900;
  const isManager = atLeast(profile?.role, 'ADMIN'); // ADMIN+ may use purchasing
  const online = useOnline();

  // --- DATA STATE ---
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [metrics, setMetrics] = useState<Metric[]>([]);

  // --- NEW ITEM (inline create from a purchase row) ---
  const [newItemFor, setNewItemFor] = useState<string | null>(null);
  const [niName, setNiName] = useState('');
  const [niUnit, setNiUnit] = useState('');
  const [niPrice, setNiPrice] = useState('');

  // --- SUPPLIER FORM ---
  const [supplierQuery, setSupplierQuery] = useState('');
  const [supplierId, setSupplierId] = useState<number | null>(null);
  const [showSupplierList, setShowSupplierList] = useState(false);
  const [supplierPaletteOpen, setSupplierPaletteOpen] = useState(false);
  const [itemPaletteRow, setItemPaletteRow] = useState<string | null>(null);
  const [allItems, setAllItems] = useState<InventoryItem[]>([]);
  const [allItemsLoading, setAllItemsLoading] = useState(false);

  // --- PURCHASE FORM ---
  const [rows, setRows] = useState<PurchaseRow[]>([emptyRow()]);
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const [itemResults, setItemResults] = useState<InventoryItem[]>([]);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [invoiceNo, setInvoiceNo] = useState('');
  const [paidStr, setPaidStr] = useState('');
  const [note, setNote] = useState('');

  // --- LOAD ---
  const loadData = async () => {
    setLoading(true);
    try {
      const [supRes, purRes, metRes] = await Promise.all([
        supabase.from('suppliers').select('*').order('name'),
        supabase.from('purchases').select('*').order('created_at', { ascending: false }).limit(50),
        supabase.from('metrics').select('*').order('unit_name'),
      ]);
      if (supRes.data) setSuppliers(supRes.data as Supplier[]);
      if (purRes.data) setPurchases(purRes.data as Purchase[]);
      if (metRes.data) setMetrics(metRes.data as Metric[]);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (isManager) loadData();
  }, [isManager]);

  // --- SUPPLIER PICKER (client-side filter over the loaded list; free text allowed) ---
  const supplierMatches = useMemo(() => {
    const q = supplierQuery.trim().toLowerCase();
    if (!q) return suppliers.slice(0, 8);
    return suppliers.filter(s => s.name.toLowerCase().includes(q)).slice(0, 8);
  }, [supplierQuery, suppliers]);

  const onSupplierChange = (text: string) => {
    setSupplierQuery(text);
    setSupplierId(null); // typing a free-text name detaches any selected supplier
    setShowSupplierList(true);
  };

  const selectSupplier = (s: Supplier) => {
    setSupplierQuery(s.name);
    setSupplierId(s.id);
    setShowSupplierList(false);
  };

  // --- ITEM ROWS ---
  const handleItemSearch = (text: string, rowId: string) => {
    setRows(prev => prev.map(r => (r._id === rowId ? { ...r, query: text, item: null } : r)));
    setActiveRowId(rowId);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const q = text.trim();
    if (!q) {
      setItemResults([]);
      return;
    }
    // Server-side search so a large catalog stays fast.
    searchTimer.current = setTimeout(async () => {
      const { data } = await supabase
        .from('inventory')
        .select('id, item_name, quantity, price, cost')
        .ilike('item_name', `%${q}%`)
        .order('item_name')
        .limit(25);
      setItemResults((data as InventoryItem[]) || []);
    }, 250);
  };

  const selectInvItem = (item: InventoryItem, rowId: string) => {
    const duplicate = rows.some(r => r.item?.id === item.id && r._id !== rowId);
    if (duplicate) return toast.error('Barang sudah ada di daftar.');
    setRows(prev => {
      const next = prev.map(r => {
        if (r._id !== rowId) return r;
        const cost = (item.cost ?? 0).toString();
        const total = Math.max(0, Math.round(parseNum(r.qty) * parseNum(cost))).toString();
        return { ...r, item, query: item.item_name, cost, total };
      });
      // Auto-append a fresh row when the last one gets filled.
      if (next[next.length - 1]._id === rowId) next.push(emptyRow());
      return next;
    });
    setActiveRowId(null);
    setItemResults([]);
  };

  // Inline-create an inventory item that isn't catalogued yet, then attach it to
  // the row so the purchase can receive it in one flow (qty + cost set on submit).
  const openNewItem = (rowId: string) => {
    const q = (rows.find(r => r._id === rowId)?.query || '').trim();
    setNewItemFor(rowId);
    setNiName(q);
    setNiUnit(metrics[0]?.id ? String(metrics[0].id) : '');
    setNiPrice('');
    setActiveRowId(null);
    setItemResults([]);
  };

  // --- ITEM PALETTE (shared command-palette picker for the purchase rows) ---
  const loadAllItems = async () => {
    setAllItemsLoading(true);
    const { data } = await supabase
      .from('inventory')
      .select('id, item_name, quantity, price, cost, category')
      .order('item_name');
    setAllItems((data as InventoryItem[]) || []);
    setAllItemsLoading(false);
  };

  const openItemPalette = (rowId: string) => {
    setItemPaletteRow(rowId);
    if (allItems.length === 0) loadAllItems();
  };

  const startNewItemFromPalette = (name: string) => {
    if (!itemPaletteRow) return;
    setNewItemFor(itemPaletteRow);
    setNiName(name);
    setNiUnit(metrics[0]?.id ? String(metrics[0].id) : '');
    setNiPrice('');
    setItemPaletteRow(null);
  };

  const handleCreateItem = async () => {
    if (!newItemFor) return;
    if (!niName.trim()) return toast.error('Nama barang wajib diisi.');
    if (!niUnit) return toast.error('Pilih satuan barang.');
    setSaving(true);
    const { data, error } = await supabase
      .from('inventory')
      .insert([
        {
          item_name: niName.trim(),
          metric_id: parseInt(niUnit),
          price: Math.round(parseNum(niPrice)),
          min_stock: 5,
          quantity: 0,
          allow_preorder: false,
        },
      ])
      .select('id, item_name, quantity, price, cost')
      .single();
    setSaving(false);
    if (error) return toast.error(error.message);
    const rowId = newItemFor;
    setNewItemFor(null);
    selectInvItem(data as InventoryItem, rowId); // attaches to the row + appends a fresh one
  };

  const updateRow = (rowId: string, field: 'qty' | 'cost', val: string) => {
    setRows(prev =>
      prev.map(r => {
        if (r._id !== rowId) return r;
        const updated = { ...r, [field]: val };
        updated.total = Math.max(0, Math.round(parseNum(updated.qty) * parseNum(updated.cost))).toString();
        return updated;
      })
    );
  };

  const removeRow = (rowId: string) => {
    if (rows.length > 1) setRows(prev => prev.filter(r => r._id !== rowId));
    else setRows([emptyRow()]);
  };

  // --- TOTALS ---
  const total = useMemo(() => Math.round(rows.reduce((a, r) => a + parseNum(r.total), 0)), [rows]);
  const paid = Math.round(parseNum(paidStr));
  const outstanding = Math.max(0, total - paid);
  const status = computeStatus(total, paid);

  const resetForm = () => {
    setRows([emptyRow()]);
    setSupplierQuery('');
    setSupplierId(null);
    setInvoiceNo('');
    setPaidStr('');
    setNote('');
    setItemResults([]);
    setActiveRowId(null);
  };

  // --- SUBMIT ---
  const handleSubmit = async () => {
    if (!online) return;
    const validRows = rows.filter(r => r.item && parseNum(r.qty) > 0);
    if (validRows.length === 0) return toast.error('Pilih minimal satu barang yang diterima.');
    if (!supplierQuery.trim()) return toast.error('Nama supplier wajib diisi.');

    setSaving(true);
    try {
      // Resolve the supplier: use the picked id, otherwise create a new supplier
      // from the free-text name so the supplier list (and hutang) stays trackable.
      let resolvedId = supplierId;
      if (!resolvedId) {
        const { data: newSup, error: supErr } = await supabase
          .from('suppliers')
          .insert([{ name: supplierQuery.trim() }])
          .select()
          .single();
        if (supErr) throw supErr;
        resolvedId = (newSup as Supplier).id;
      }

      const p_purchase = {
        supplier_id: resolvedId,
        supplier_name: supplierQuery.trim(),
        invoice_no: invoiceNo.trim(),
        total_amount: total,
        paid_amount: paid,
        status,
        note: note.trim(),
        employee_name: profile?.full_name || 'Owner',
      };
      const p_items = validRows.map(r => ({
        inventory_id: r.item!.id,
        item_name: r.item!.item_name,
        quantity: parseNum(r.qty),
        cost: Math.round(parseNum(r.cost)),
      }));

      // Atomic: inserts the purchase + items, raises inventory.quantity and
      // updates the moving-average inventory.cost, records the payable.
      const { error } = await supabase.rpc('create_purchase', { p_purchase, p_items });
      if (error) throw error;

      resetForm();
      loadData();
      toast.success('Stok masuk berhasil dicatat.');
    } catch (e: any) {
      toast.error(e.message || 'Terjadi kesalahan.');
    } finally {
      setSaving(false);
    }
  };

  // --- GUARD ---
  if (!isManager) {
    return (
      <View style={styles.center}>
        <Text style={styles.denied}>Akses Owner Diperlukan</Text>
      </View>
    );
  }

  const statusColor = (s: string) =>
    s === 'PAID'
      ? { bg: '#F0FDF4', fg: '#166534' }
      : s === 'PARTIAL'
        ? { bg: '#FFFBEB', fg: '#B45309' }
        : { bg: '#FEF2F2', fg: '#DC2626' };

  // The item-search results dropdown — identical for the desktop row and the
  // mobile card, so render it from one place.
  const renderItemDropdown = (rowId: string) => {
    if (activeRowId !== rowId) return null;
    const q = (rows.find(r => r._id === rowId)?.query || '').trim();
    if (!q) return null;
    return (
      <View style={styles.dropdown}>
        <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled style={{ maxHeight: 220 }}>
          {itemResults.map(it => (
            <TouchableOpacity key={it.id} style={styles.dropdownItem} onPress={() => selectInvItem(it, rowId)}>
              <Text style={styles.dropdownName}>{it.item_name}</Text>
              <Text style={styles.dropdownSub}>
                Stok: {it.quantity} • HPP: {formatRupiah(it.cost ?? 0)}
              </Text>
            </TouchableOpacity>
          ))}
          {/* Item not in the catalog yet → create it inline, then receive it here. */}
          <TouchableOpacity style={styles.dropdownCreate} onPress={() => openNewItem(rowId)}>
            <Feather name="plus-circle" size={15} color="#16A34A" />
            <Text style={styles.dropdownCreateText} numberOfLines={1}>
              Buat barang baru: "{q}"
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  };

  // --- FORM (left column / top) ---
  const renderForm = () => (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>STOK MASUK / PEMBELIAN</Text>
      <Text style={styles.cardHint}>
        Catat barang yang diterima dari supplier. Stok naik & hutang supplier tercatat otomatis.
      </Text>

      {/* SUPPLIER PICKER */}
      <Text style={styles.label}>Supplier</Text>
      <TouchableOpacity style={styles.inputIconWrap} onPress={() => setSupplierPaletteOpen(true)} activeOpacity={0.8}>
        <Feather name="truck" size={16} color="#94A3B8" />
        <Text
          style={[styles.inputFlex, { paddingVertical: 12, color: supplierQuery ? '#0F172A' : '#94A3B8' }]}
          numberOfLines={1}
        >
          {supplierQuery || 'Cari atau ketik nama supplier baru...'}
        </Text>
        {supplierId != null && <Feather name="check-circle" size={16} color="#16A34A" />}
      </TouchableOpacity>
      <CommandPalette<Supplier>
        visible={supplierPaletteOpen}
        onClose={() => setSupplierPaletteOpen(false)}
        items={suppliers}
        isDesktop={isDesktop}
        placeholder="Cari atau ketik nama supplier baru..."
        emptyText="Belum ada supplier."
        keyExtractor={s => s.id}
        getLabel={s => s.name}
        getSubtitle={s => s.phone || ''}
        onSelect={selectSupplier}
        allowCreate
        onCreate={name => {
          setSupplierQuery(name.trim());
          setSupplierId(null);
        }}
        createLabel={t => `Tambah supplier "${t}"`}
      />
      <CommandPalette<InventoryItem>
        visible={itemPaletteRow !== null}
        onClose={() => setItemPaletteRow(null)}
        items={allItems}
        loading={allItemsLoading}
        isDesktop={isDesktop}
        placeholder="Cari item atau ketik barang baru..."
        emptyText="Tidak ada barang."
        keyExtractor={i => i.id}
        getLabel={i => i.item_name}
        getSubtitle={i => `${formatRupiah(i.price)} • Stok: ${i.quantity}`}
        getGroup={i => i.category || 'Lainnya'}
        onSelect={i => {
          if (itemPaletteRow) selectInvItem(i, itemPaletteRow);
        }}
        allowCreate
        onCreate={startNewItemFromPalette}
        createLabel={t => `Tambah barang baru "${t}"`}
      />

      {/* ITEM TABLE */}
      <Text style={[styles.label, { marginTop: 8 }]}>Barang Diterima</Text>
      {isDesktop && (
        <View style={styles.tableHead}>
          <Text style={[styles.th, { flex: 2.6 }]}>BARANG</Text>
          <Text style={[styles.th, { flex: 0.9, textAlign: 'center' }]}>QTY</Text>
          <Text style={[styles.th, { flex: 1.3, textAlign: 'center' }]}>HARGA BELI</Text>
          <Text style={[styles.th, { flex: 1.3, textAlign: 'right' }]}>SUBTOTAL</Text>
          <View style={{ width: 30 }} />
        </View>
      )}

      {rows.map(row =>
        isDesktop ? (
          <View key={row._id} style={[styles.tableRow, { zIndex: activeRowId === row._id ? 100 : 1 }]}>
            <TouchableOpacity
              style={[styles.cellInput, { flex: 2.6, justifyContent: 'center' }]}
              onPress={() => openItemPalette(row._id)}
            >
              <Text style={{ color: row.item ? '#0F172A' : '#94A3B8', fontWeight: '600' }} numberOfLines={1}>
                {row.item?.item_name || 'Pilih barang...'}
              </Text>
            </TouchableOpacity>
            <TextInput
              style={[styles.cellInput, { flex: 0.9, textAlign: 'center' }]}
              keyboardType="numeric"
              value={row.qty}
              onChangeText={t => updateRow(row._id, 'qty', t)}
            />
            <TextInput
              style={[styles.cellInput, { flex: 1.3, textAlign: 'center' }]}
              keyboardType="numeric"
              value={row.cost}
              onChangeText={t => updateRow(row._id, 'cost', t)}
              placeholder="0"
            />
            <Text style={[styles.cellTotal, { flex: 1.3 }]}>{formatRupiah(parseNum(row.total))}</Text>
            <TouchableOpacity onPress={() => removeRow(row._id)} style={styles.removeBtn}>
              <Feather name="trash-2" size={16} color="#94A3B8" />
            </TouchableOpacity>
          </View>
        ) : (
          <View key={row._id} style={[styles.mCard, { zIndex: activeRowId === row._id ? 100 : 1 }]}>
            <TouchableOpacity
              style={[styles.input, { justifyContent: 'center' }]}
              onPress={() => openItemPalette(row._id)}
            >
              <Text style={{ color: row.item ? '#0F172A' : '#94A3B8', fontWeight: '600' }} numberOfLines={1}>
                {row.item?.item_name || 'Pilih barang...'}
              </Text>
            </TouchableOpacity>
            <View style={styles.mRow}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={styles.mLabel}>QTY</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={row.qty}
                  onChangeText={t => updateRow(row._id, 'qty', t)}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.mLabel}>HARGA BELI</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={row.cost}
                  onChangeText={t => updateRow(row._id, 'cost', t)}
                  placeholder="0"
                />
              </View>
            </View>
            <View style={styles.mFooter}>
              <Text style={styles.mTotal}>{formatRupiah(parseNum(row.total))}</Text>
              <TouchableOpacity onPress={() => removeRow(row._id)} style={styles.mTrash}>
                <Feather name="trash-2" size={18} color="#DC2626" />
              </TouchableOpacity>
            </View>
          </View>
        )
      )}

      {/* INVOICE / PAYMENT / NOTE */}
      <View style={[styles.row, { marginTop: 14 }]}>
        <View style={{ flex: 1, marginRight: 10 }}>
          <Text style={styles.label}>No. Nota / Faktur</Text>
          <TextInput style={styles.input} value={invoiceNo} onChangeText={setInvoiceNo} placeholder="opsional" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Dibayar (Rp)</Text>
          <TextInput
            style={styles.input}
            keyboardType="numeric"
            value={paidStr}
            onChangeText={setPaidStr}
            placeholder="0"
          />
        </View>
      </View>
      <Text style={styles.label}>Catatan</Text>
      <TextInput style={styles.input} value={note} onChangeText={setNote} placeholder="opsional" />

      {/* SUMMARY */}
      <View style={styles.summaryBox}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Total Pembelian</Text>
          <Text style={styles.summaryVal}>{formatRupiah(total)}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Dibayar</Text>
          <Text style={styles.summaryVal}>{formatRupiah(paid)}</Text>
        </View>
        <View style={[styles.summaryRow, { marginTop: 4 }]}>
          <Text style={[styles.summaryLabel, { fontWeight: '900', color: '#0F172A' }]}>Sisa Hutang</Text>
          <Text style={[styles.summaryVal, { color: outstanding > 0 ? '#DC2626' : '#16A34A', fontSize: 18 }]}>
            {formatRupiah(outstanding)}
          </Text>
        </View>
        <View
          style={[
            styles.statusPill,
            { backgroundColor: statusColor(status).bg, alignSelf: 'flex-start', marginTop: 8 },
          ]}
        >
          <Text style={[styles.statusText, { color: statusColor(status).fg }]}>{status}</Text>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.primaryBtn, (!online || saving) && styles.btnDisabled]}
        onPress={handleSubmit}
        disabled={!online || saving}
      >
        {saving ? (
          <ActivityIndicator color="#FFF" />
        ) : (
          <Text style={styles.btnText}>{online ? 'SIMPAN STOK MASUK' : 'OFFLINE — TIDAK BISA MENYIMPAN'}</Text>
        )}
      </TouchableOpacity>
      {!online && (
        <Text style={styles.offlineHint}>Tidak ada koneksi internet — penyimpanan dinonaktifkan sementara.</Text>
      )}
    </View>
  );

  // --- RECENT PURCHASES (right column / bottom) ---
  const renderRecent = () => (
    <View style={styles.card}>
      <View style={styles.rowBetween}>
        <Text style={styles.cardTitle}>PEMBELIAN TERAKHIR</Text>
        <TouchableOpacity onPress={loadData}>
          <Feather name="refresh-cw" size={16} color="#64748B" />
        </TouchableOpacity>
      </View>
      {loading ? (
        <ActivityIndicator color="#DC2626" style={{ marginTop: 20 }} />
      ) : purchases.length === 0 ? (
        <Text style={styles.empty}>Belum ada pembelian.</Text>
      ) : (
        purchases.map(p => {
          const owed = Math.max(0, (p.total_amount || 0) - (p.paid_amount || 0));
          const st = p.status || computeStatus(p.total_amount || 0, p.paid_amount || 0);
          const c = statusColor(st);
          return (
            <View key={p.id} style={styles.purchaseCard}>
              <View style={styles.rowBetween}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.purchaseSupplier} numberOfLines={1}>
                    {p.supplier_name || 'Supplier'}
                  </Text>
                  <Text style={styles.purchaseMeta}>
                    {!!p.invoice_no && `#${p.invoice_no} • `}
                    {new Date(p.created_at).toLocaleDateString('id-ID')}
                  </Text>
                </View>
                <View style={[styles.statusPill, { backgroundColor: c.bg }]}>
                  <Text style={[styles.statusText, { color: c.fg }]}>{st}</Text>
                </View>
              </View>
              <View style={styles.purchaseFooter}>
                <View>
                  <Text style={styles.pfLabel}>Total</Text>
                  <Text style={styles.pfVal}>{formatRupiah(p.total_amount)}</Text>
                </View>
                <View>
                  <Text style={styles.pfLabel}>Dibayar</Text>
                  <Text style={styles.pfVal}>{formatRupiah(p.paid_amount)}</Text>
                </View>
                <View>
                  <Text style={styles.pfLabel}>Sisa Hutang</Text>
                  <Text style={[styles.pfVal, { color: owed > 0 ? '#DC2626' : '#16A34A' }]}>{formatRupiah(owed)}</Text>
                </View>
              </View>
            </View>
          );
        })
      )}
    </View>
  );

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ padding: isDesktop ? 24 : 14, paddingBottom: 60 }}
        keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={() => {
          setActiveRowId(null);
          setShowSupplierList(false);
        }}
      >
        <Text style={styles.pageTitle}>Pembelian</Text>
        {isDesktop ? (
          <View style={styles.twoCol}>
            <View style={{ flex: 1.5 }}>{renderForm()}</View>
            <View style={{ flex: 1 }}>{renderRecent()}</View>
          </View>
        ) : (
          <>
            {renderForm()}
            {renderRecent()}
          </>
        )}
      </ScrollView>

      {/* Inline "create new item" modal (from a purchase row that found no match) */}
      <Modal visible={newItemFor !== null} transparent animationType="fade" onRequestClose={() => setNewItemFor(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>Barang Baru</Text>
              <TouchableOpacity onPress={() => setNewItemFor(null)}>
                <Feather name="x" size={22} color="#0F172A" />
              </TouchableOpacity>
            </View>
            <Text style={styles.label}>Nama Barang</Text>
            <TextInput style={styles.input} value={niName} onChangeText={setNiName} placeholder="Nama barang" />
            <Text style={styles.label}>Satuan</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              {metrics.map(m => {
                const active = niUnit === String(m.id);
                return (
                  <TouchableOpacity
                    key={m.id}
                    onPress={() => setNiUnit(String(m.id))}
                    style={[styles.unitChip, active && styles.unitChipActive]}
                  >
                    <Text style={active ? styles.unitChipTextActive : styles.unitChipText}>{m.unit_name}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <Text style={styles.label}>Harga Jual (Rp) — opsional</Text>
            <TextInput
              style={styles.input}
              value={niPrice}
              onChangeText={setNiPrice}
              keyboardType="numeric"
              placeholder="0"
            />
            <Text style={styles.modalHint}>
              Stok & harga modal (HPP) terisi dari pembelian ini. Harga jual bisa diatur nanti di Stok Barang.
            </Text>
            <TouchableOpacity
              style={[styles.primaryBtn, saving && styles.btnDisabled]}
              onPress={handleCreateItem}
              disabled={saving}
            >
              {saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.btnText}>BUAT & PILIH</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  denied: { color: '#94A3B8', fontWeight: '700' },
  pageTitle: { fontSize: 24, fontWeight: '900', color: '#111827', marginBottom: 16 },
  twoCol: { flexDirection: 'row', gap: 16, alignItems: 'flex-start' },

  card: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  cardTitle: { fontSize: 13, fontWeight: '900', color: '#0F172A', letterSpacing: 0.5 },
  cardHint: { fontSize: 12, color: '#94A3B8', marginTop: 4, marginBottom: 16 },

  label: { fontSize: 11, fontWeight: '800', color: '#94A3B8', marginBottom: 8, textTransform: 'uppercase' },
  input: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 12,
    fontSize: 15,
    color: '#111827',
    marginBottom: 12,
  },
  inputIconWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  inputFlex: { flex: 1, paddingVertical: 12, fontSize: 15, color: '#111827', outlineStyle: 'none' } as any,
  row: { flexDirection: 'row' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },

  // Item table (desktop)
  tableHead: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  th: { fontSize: 10, fontWeight: '900', color: '#94A3B8', letterSpacing: 0.5 },
  tableRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  cellInput: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
  },
  cellTotal: { fontSize: 14, fontWeight: '800', color: '#0F172A', textAlign: 'right' },
  removeBtn: { width: 30, alignItems: 'center', justifyContent: 'center' },

  // Item card (mobile)
  mCard: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },
  mRow: { flexDirection: 'row' },
  mLabel: { fontSize: 10, fontWeight: '800', color: '#94A3B8', marginBottom: 6 },
  mFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 },
  mTotal: { fontSize: 16, fontWeight: '900', color: '#0F172A' },
  mTrash: { padding: 6 },

  // Dropdown
  dropdown: {
    position: 'absolute',
    top: 46,
    left: 0,
    right: 0,
    backgroundColor: '#FFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    zIndex: 1000,
    elevation: 10,
  },
  dropdownItem: { paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  dropdownName: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  dropdownSub: { fontSize: 11, color: '#64748B', marginTop: 2 },
  dropdownCreate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: '#F0FDF4',
    borderTopWidth: 1,
    borderTopColor: '#DCFCE7',
  },
  dropdownCreateText: { fontSize: 13, fontWeight: '800', color: '#166534', flex: 1 },

  // New-item modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: { backgroundColor: '#FFF', borderRadius: 20, padding: 22, width: '100%', maxWidth: 460 },
  modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '900', color: '#0F172A' },
  modalHint: { fontSize: 11, color: '#94A3B8', marginTop: -4, marginBottom: 14, lineHeight: 16 },
  unitChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  unitChipActive: { backgroundColor: '#DC2626', borderColor: '#DC2626' },
  unitChipText: { fontSize: 12, color: '#475569', fontWeight: '600' },
  unitChipTextActive: { fontSize: 12, color: '#FFF', fontWeight: '700' },

  // Summary
  summaryBox: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    padding: 16,
    marginTop: 8,
    marginBottom: 16,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  summaryLabel: { fontSize: 13, color: '#64748B', fontWeight: '600' },
  summaryVal: { fontSize: 15, fontWeight: '800', color: '#0F172A' },

  primaryBtn: {
    backgroundColor: '#DC2626',
    padding: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: { backgroundColor: '#94A3B8' },
  btnText: { color: '#FFF', fontWeight: '900', fontSize: 14, letterSpacing: 0.5 },
  offlineHint: { fontSize: 11, color: '#B45309', textAlign: 'center', marginTop: 10, fontWeight: '600' },

  // Recent purchases
  empty: { color: '#94A3B8', fontStyle: 'italic', paddingVertical: 12 },
  purchaseCard: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    padding: 14,
    marginTop: 12,
  },
  purchaseSupplier: { fontSize: 15, fontWeight: '800', color: '#0F172A' },
  purchaseMeta: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  purchaseFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  pfLabel: { fontSize: 10, fontWeight: '800', color: '#94A3B8', marginBottom: 2 },
  pfVal: { fontSize: 14, fontWeight: '800', color: '#0F172A' },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
});
