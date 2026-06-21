import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { createElement, useEffect, useMemo, useRef, useState } from 'react';
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
  type ViewStyle,
} from 'react-native';
import Animated, {
  FadeInDown,
  FadeOutUp,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import CommandPalette from '../../components/CommandPalette';
import PressableScale from '../../components/PressableScale';
import { DeliveryOrderPreview, InvoicePreview, ThermalPreview } from '../../components/PrintPreviews';
import { confirm } from '../../lib/confirm';
import { parseNum } from '../../lib/number';
import { useOnline } from '../../lib/offline/OfflineContext';
import { useProfile } from '../../lib/ProfileContext';
import type { DocType, PrintConfig } from '../../lib/printing';
import { DEFAULT_PRINT_CONFIG, generatePrintHtml, printDocument } from '../../lib/printing';
import { supabase } from '../../lib/supabase';
import { toast } from '../../lib/toast';

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
  category?: string | null;
}

interface PaymentMethod {
  id: number;
  name: string;
}

interface Customer {
  id: number;
  name: string;
  phone?: string | null;
  address?: string | null;
}

interface SaleRow {
  _id: string;
  item: InventoryItem | null;
  query: string;
  qty: string;
  price: string;
  discount: string;
  total: string;
}

interface Sale {
  id: number;
  total_amount: number;
  payment_method: string;
  customer_name: string;
  customer_id?: number | null;
  status: 'PAID' | 'PARTIAL' | 'UNPAID';
  down_payment: number;
  discount?: number;
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
  discount?: number;
}

interface PrintSettings {
  id: number;
  shop_name: string;
  shop_address: string;
  shop_phone: string;
  thermal_footer: string;
  invoice_footer: string;
  do_footer: string;
  print_config?: PrintConfig;
}

// --- PURE HELPERS ---
const formatRupiah = (n: number) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(Math.round(n) || 0);

const generateId = () => Math.random().toString(36).substring(2, 15);

const MONO_STACK = Platform.select({
  ios: 'Courier New',
  android: 'monospace',
  default: 'monospace',
});

export default function UnifiedPOSHub() {
  const { profile: rawProfile } = useProfile();
  // Using unknown as intermediary to satisfy the compiler's overlap check
  const profile = rawProfile as unknown as Profile;
  const { width } = useWindowDimensions();
  const isDesktop = width > 1100;
  const online = useOnline();

  // --- STATE ---
  const [activeTab, setActiveTab] = useState<'input' | 'history'>('input');
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<PrintSettings | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);

  // POS Input
  const [customerName, setCustomerName] = useState('Umum');
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [showCustomerSuggest, setShowCustomerSuggest] = useState(false);
  const customerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedPayment, setSelectedPayment] = useState('');
  const [cashReceivedStr, setCashReceivedStr] = useState('');
  const [downPaymentStr, setDownPaymentStr] = useState('');
  const [discountStr, setDiscountStr] = useState('');
  const [discountRows, setDiscountRows] = useState<string[]>([]); // cart rows whose per-line discount input is revealed
  const [showDiscount, setShowDiscount] = useState(false);
  const [rows, setRows] = useState<SaleRow[]>([]);
  const [popularItems, setPopularItems] = useState<InventoryItem[]>([]);
  // Command-palette item picker (opens with the "/" key on desktop)
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteAll, setPaletteAll] = useState<InventoryItem[]>([]);
  const [paletteLoading, setPaletteLoading] = useState(false);

  // Modal States
  const [printModal, setPrintModal] = useState(false);
  const [editModal, setEditModal] = useState(false);
  const [lastSale, setLastSale] = useState<Sale | null>(null);
  const [lastSaleItems, setLastSaleItems] = useState<SaleItem[]>([]);
  const [editingSale, setEditingSale] = useState<Sale | null>(null);
  const [previewType, setPreviewType] = useState<DocType | null>(null);

  // Riwayat (history) filters + row expansion
  const [histStatus, setHistStatus] = useState<'ALL' | 'PAID' | 'PARTIAL' | 'UNPAID'>('ALL');
  const [histPreset, setHistPreset] = useState<'today' | '7d' | '30d' | 'all'>('all');
  const [histSearch, setHistSearch] = useState('');
  const [histLimit, setHistLimit] = useState(50);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [expandedItems, setExpandedItems] = useState<Record<number, SaleItem[]>>({});
  const histTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadInitialData();
    loadPopular();
  }, []);

  // Lazy-load the full catalog the first time the palette opens.
  useEffect(() => {
    if (paletteOpen && paletteAll.length === 0) loadPaletteCatalog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paletteOpen]);

  // Desktop power-user: "/" opens the picker, Esc closes it.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA';
      if (e.key === '/' && !typing && !paletteOpen) {
        e.preventDefault();
        openPalette();
      } else if (e.key === 'Escape' && paletteOpen) setPaletteOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paletteOpen, paletteAll.length]);

  useEffect(() => {
    if (activeTab === 'history') loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, histStatus, histPreset, histLimit]);

  // Debounced reload when the search text changes.
  useEffect(() => {
    if (activeTab !== 'history') return;
    if (histTimer.current) clearTimeout(histTimer.current);
    histTimer.current = setTimeout(() => loadHistory(), 300);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [histSearch]);

  const loadInitialData = async () => {
    try {
      const [setRes, pmRes] = await Promise.all([
        supabase.from('print_settings').select('*').eq('id', 1).single(),
        supabase.from('payment_methods').select('*').order('name'),
      ]);

      if (setRes.error) throw new Error('Gagal mengambil pengaturan cetak');
      if (pmRes.error) throw new Error('Gagal mengambil metode pembayaran');

      if (setRes.data) setSettings(setRes.data);
      if (pmRes.data) {
        setPaymentMethods(pmRes.data);
        if (pmRes.data.length > 0) setSelectedPayment(pmRes.data[0].name);
      }
    } catch (err: any) {
      toast.error(err.message || 'Error tidak diketahui');
    }
  };

  const loadHistory = async () => {
    setLoading(true);
    let q = supabase.from('sales').select('*').order('created_at', { ascending: false });
    if (histPreset !== 'all') {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      if (histPreset === '7d') start.setDate(start.getDate() - 6);
      else if (histPreset === '30d') start.setDate(start.getDate() - 29);
      q = q.gte('created_at', start.toISOString());
    }
    if (histStatus !== 'ALL') q = q.eq('status', histStatus);
    const term = histSearch.trim();
    if (term) q = q.ilike('customer_name', `%${term}%`);
    const { data, error } = await q.limit(histLimit);
    if (error) toast.error('Gagal memuat riwayat transaksi');
    if (data) setSales(data as Sale[]);
    setLoading(false);
  };

  // Expand a transaction to reveal its line items (fetched once, then cached).
  const toggleExpand = async (sale: Sale) => {
    if (expandedId === sale.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(sale.id);
    if (!expandedItems[sale.id]) {
      const { data } = await supabase.from('sale_items').select('*').eq('sale_id', sale.id);
      setExpandedItems(prev => ({ ...prev, [sale.id]: (data as SaleItem[]) || [] }));
    }
  };

  const histRemaining = (s: Sale) =>
    s.status !== 'PAID'
      ? Math.max(0, (s.total_amount || 0) - (s.down_payment || 0) - ((s as any).amount_returned || 0))
      : 0;

  const histSummary = useMemo(
    () => ({
      count: sales.length,
      total: sales.reduce((a, s) => a + (s.total_amount || 0), 0),
      piutang: sales.reduce((a, s) => a + histRemaining(s), 0),
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }),
    [sales]
  );

  // --- CALCULATIONS ---
  const subtotal = useMemo(() => Math.round(rows.reduce((acc, row) => acc + parseNum(row.total), 0)), [rows]);
  const txDiscount = Math.min(subtotal, Math.round(parseNum(discountStr)));
  const currentTotal = Math.max(0, subtotal - txDiscount);

  // Subtle pulse on the grand total whenever it changes.
  const totalScale = useSharedValue(1);
  const totalAnim = useAnimatedStyle(() => ({ transform: [{ scale: totalScale.value }] }));
  const firstTotalRef = useRef(true);
  useEffect(() => {
    if (firstTotalRef.current) {
      firstTotalRef.current = false;
      return;
    }
    totalScale.value = withSequence(withTiming(1.07, { duration: 110 }), withTiming(1, { duration: 170 }));
  }, [currentTotal]);

  const cashReceived = Math.round(parseNum(cashReceivedStr));
  const downPayment = Math.round(parseNum(downPaymentStr));
  const changeAmount = cashReceived - currentTotal;
  const remainingBalance = Math.max(0, currentTotal - downPayment);
  const isTempo = selectedPayment.toLowerCase().includes('tempo');
  const isCash =
    !isTempo && (selectedPayment.toLowerCase().includes('tunai') || selectedPayment.toLowerCase().includes('cash'));
  const isElectronic = !isTempo && !isCash; // QRIS / Transfer / Debit, etc.

  // Reason the checkout is blocked (null = OK) → drives the disabled button + hint.
  const cartHasItems = rows.some(r => r.item && parseNum(r.qty) > 0);
  const checkoutBlock =
    !cartHasItems || currentTotal <= 0
      ? 'Belum ada barang di keranjang'
      : isTempo && !selectedCustomerId
        ? 'Pilih pelanggan untuk Tempo'
        : isCash && cashReceived < currentTotal
          ? 'Uang diterima kurang'
          : null;
  const checkoutBlocked = loading || !online || !!checkoutBlock;

  // --- POS ACTIONS ---
  // Tapping a product adds a line; tapping one already in the cart bumps its qty.
  const addItemToCart = (item: InventoryItem) => {
    setRows(prev => {
      const exists = prev.some(r => r.item?.id === item.id);
      if (exists) {
        return prev.map(r => {
          if (r.item?.id !== item.id) return r;
          const qty = parseNum(r.qty) + 1;
          const total = Math.max(0, Math.round(qty * parseNum(r.price) - parseNum(r.discount)));
          return { ...r, qty: String(qty), total: String(total) };
        });
      }
      return [
        ...prev,
        {
          _id: generateId(),
          item,
          query: item.item_name,
          qty: '1',
          price: item.price.toString(),
          discount: '0',
          total: Math.max(0, Math.round(item.price)).toString(),
        },
      ];
    });
  };

  // Decrement a cart line straight from the palette; removes it at zero.
  const decrementItem = (item: InventoryItem) => {
    setRows(prev =>
      prev.flatMap(r => {
        if (r.item?.id !== item.id) return [r];
        const qty = parseNum(r.qty) - 1;
        if (qty < 1) return [];
        const total = Math.max(0, Math.round(qty * parseNum(r.price) - parseNum(r.discount)));
        return [{ ...r, qty: String(qty), total: String(total) }];
      })
    );
  };

  // Favorites = the most-frequently-sold items, shown when the search is empty.
  const loadPopular = async () => {
    const { data } = await supabase
      .from('sale_items')
      .select('inventory_id')
      .order('id', { ascending: false })
      .limit(300);
    const tally = new Map<number, number>();
    (data as { inventory_id: number }[] | null)?.forEach(r => {
      if (r.inventory_id) tally.set(r.inventory_id, (tally.get(r.inventory_id) || 0) + 1);
    });
    const topIds = [...tally.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([id]) => id);
    if (topIds.length === 0) {
      const { data: inv } = await supabase.from('inventory').select('*').order('item_name').limit(12);
      setPopularItems((inv as InventoryItem[]) || []);
      return;
    }
    const { data: inv } = await supabase.from('inventory').select('*').in('id', topIds);
    const invMap = new Map(((inv as InventoryItem[]) || []).map(i => [i.id, i]));
    setPopularItems(topIds.map(id => invMap.get(id)).filter(Boolean) as InventoryItem[]);
  };

  // --- COMMAND-PALETTE ITEM PICKER ---
  const loadPaletteCatalog = async () => {
    setPaletteLoading(true);
    const { data } = await supabase
      .from('inventory')
      .select('id,item_name,quantity,price,allow_preorder,category')
      .order('item_name');
    setPaletteAll((data as InventoryItem[]) || []);
    setPaletteLoading(false);
  };

  const openPalette = () => {
    setPaletteOpen(true);
    if (paletteAll.length === 0) loadPaletteCatalog();
  };

  const updateRow = (rowId: string, field: 'qty' | 'discount', val: string) => {
    setRows(prev =>
      prev.map(r => {
        if (r._id !== rowId) return r;
        const updated = { ...r, [field]: val };
        const rowTotal = Math.max(
          0,
          Math.round(parseNum(updated.qty) * parseNum(updated.price) - parseNum(updated.discount))
        );
        updated.total = rowTotal.toString();
        return updated;
      })
    );
  };

  const removeRow = (rowId: string) => {
    setRows(prev => prev.filter(r => r._id !== rowId));
  };

  const stepQty = (rowId: string, delta: number) => {
    const row = rows.find(r => r._id === rowId);
    const next = Math.max(0, parseNum(row?.qty) + delta);
    updateRow(rowId, 'qty', String(next));
  };

  // --- CUSTOMER PICKER (links a sale to a customer for the piutang ledger) ---
  const handleCustomerSearch = (text: string) => {
    setCustomerName(text);
    // Editing the name detaches any prior link until a row is re-picked.
    setSelectedCustomerId(null);
    setShowCustomerSuggest(true);

    if (customerTimer.current) clearTimeout(customerTimer.current);
    const q = text.trim();
    if (!q || q.toLowerCase() === 'umum') {
      setCustomerResults([]);
      return;
    }

    // Server-side search keeps a large customer base fast (only matches fetched).
    customerTimer.current = setTimeout(async () => {
      const { data } = await supabase
        .from('customers')
        .select('*')
        .or(`name.ilike.%${q}%,phone.ilike.%${q}%`)
        .order('name')
        .limit(8);
      setCustomerResults((data as Customer[]) || []);
    }, 250);
  };

  const selectCustomer = (c: Customer) => {
    setSelectedCustomerId(c.id);
    setCustomerName(c.name);
    setCustomerResults([]);
    setShowCustomerSuggest(false);
  };

  const selectUmum = () => {
    setSelectedCustomerId(null);
    setCustomerName('Umum');
    setCustomerResults([]);
    setShowCustomerSuggest(false);
  };

  // Quick-create: persist a new customer by name so this sale can join the ledger.
  const quickCreateCustomer = async () => {
    const name = customerName.trim();
    if (!name || name.toLowerCase() === 'umum') return;
    try {
      const { data, error } = await supabase.from('customers').insert([{ name }]).select().single();
      if (error) throw error;
      selectCustomer(data as Customer);
    } catch (e: any) {
      toast.error(e.message || 'Tidak dapat menambah pelanggan.');
    }
  };

  // --- CORE TRANSACTIONS ---
  const validateSale = (validRows: SaleRow[]) => {
    if (validRows.length === 0) {
      toast.error('Pilih barang terlebih dahulu.');
      return false;
    }
    const outOfStock = validRows.filter(r => !r.item?.allow_preorder && parseNum(r.qty) > (r.item?.quantity || 0));
    if (outOfStock.length > 0) {
      const names = outOfStock.map(r => `- ${r.item?.item_name} (Stok: ${r.item?.quantity})`).join('\n');
      toast.error('Stok tidak cukup', `Barang berikut melebihi stok:\n${names}`);
      return false;
    }
    if (isCash && cashReceived < currentTotal) {
      toast.error(`Pembayaran tunai minimal ${formatRupiah(currentTotal)}`);
      return false;
    }
    if (isTempo && !selectedCustomerId) {
      toast.error(
        'Pelanggan wajib',
        'Pilih atau buat pelanggan untuk transaksi Tempo, agar hutangnya tercatat di Buku Piutang.'
      );
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
        customer_id: selectedCustomerId,
        status: isTempo ? (remainingBalance === 0 ? 'PAID' : 'PARTIAL') : 'PAID',
        down_payment: isTempo ? downPayment : currentTotal,
        discount: txDiscount,
        employee_name: profile?.full_name || 'Staff',
      };

      const itemsToSave = validRows.map(r => ({
        inventory_id: r.item!.id,
        item_name: r.item!.item_name,
        quantity: parseNum(r.qty),
        price_at_sale: Math.round(parseNum(r.price)),
        discount: Math.round(parseNum(r.discount)),
      }));

      // Atomic: inserts the sale + items and decrements stock in one transaction.
      const { data: sale, error } = await supabase.rpc('create_sale', {
        p_sale: salePayload,
        p_items: itemsToSave,
      });
      if (error) throw error;

      setLastSale(sale as Sale);
      setLastSaleItems(itemsToSave.map(it => ({ ...it, sale_id: (sale as Sale).id })));
      setPrintModal(true);
      resetPOS();
      loadInitialData();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const resetPOS = () => {
    setRows([]);
    setDiscountRows([]);
    setCustomerName('Umum');
    setSelectedCustomerId(null);
    setCustomerResults([]);
    setShowCustomerSuggest(false);
    setCashReceivedStr('');
    setDownPaymentStr('');
    setDiscountStr('');
    setShowDiscount(false);
  };

  // --- HISTORY ACTIONS (OWNER/ADMIN ONLY) ---
  const handleEditSale = async (sale: Sale) => {
    setLoading(true);
    const { data: items, error } = await supabase.from('sale_items').select('*').eq('sale_id', sale.id);
    if (error) {
      toast.error('Gagal memuat detail item.');
      setLoading(false);
      return;
    }

    setEditingSale(sale);
    setCustomerName(sale.customer_name);
    setSelectedCustomerId(sale.customer_id ?? null);
    setSelectedPayment(sale.payment_method);
    setDownPaymentStr(sale.down_payment.toString());
    setDiscountStr((sale.discount ?? 0).toString());
    setShowDiscount((sale.discount ?? 0) > 0);

    // Pull only the inventory rows referenced by this sale (no full-catalog load).
    const ids = (items as SaleItem[]).map(it => it.inventory_id);
    const { data: invData } = await supabase.from('inventory').select('*').in('id', ids);
    const invMap = new Map(((invData as InventoryItem[]) || []).map(i => [i.id, i]));

    const mappedRows: SaleRow[] = (items as SaleItem[]).map(it => {
      const inv = invMap.get(it.inventory_id) || null;
      const disc = it.discount ?? 0;
      return {
        _id: generateId(),
        item: inv,
        query: it.item_name,
        qty: it.quantity.toString(),
        price: it.price_at_sale.toString(),
        discount: disc.toString(),
        total: Math.max(0, it.quantity * it.price_at_sale - disc).toString(),
      };
    });
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
        customer_id: selectedCustomerId,
        status: isTempo ? (remainingBalance === 0 ? 'PAID' : 'PARTIAL') : 'PAID',
        down_payment: isTempo ? downPayment : currentTotal,
        discount: txDiscount,
      };

      const newItems = validRows.map(r => ({
        inventory_id: r.item!.id,
        item_name: r.item!.item_name,
        quantity: parseNum(r.qty),
        price_at_sale: Math.round(parseNum(r.price)),
        discount: Math.round(parseNum(r.discount)),
      }));

      // Atomic: restores old stock, swaps items, re-decrements — single transaction.
      const { error } = await supabase.rpc('update_sale', {
        p_sale_id: editingSale.id,
        p_sale: salePayload,
        p_items: newItems,
      });
      if (error) throw error;

      toast.success('Transaksi telah diperbarui.');
      setEditModal(false);
      resetPOS();
      loadHistory();
      loadInitialData();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSale = async (sale: Sale) => {
    const ok = await confirm({
      title: 'Hapus Transaksi',
      message: 'Data stok akan dikembalikan dan transaksi dihapus permanen. Lanjutkan?',
      confirmText: 'Hapus',
      danger: true,
    });
    if (!ok) return;
    setLoading(true);
    try {
      // Atomic: restocks the items and removes the sale in one transaction.
      const { error } = await supabase.rpc('delete_sale', { p_sale_id: sale.id });
      if (error) throw error;
      loadHistory();
      loadInitialData();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const executePrint = async (type: DocType) => {
    if (!lastSale || !settings) return;
    // Per-document transport/paper mapping is shop-wide (print_settings.print_config);
    // printDocument walks the configured transport then its fallback chain so this
    // never hard-fails (DIALOG is always available and always last).
    const config = settings.print_config ?? DEFAULT_PRINT_CONFIG;
    const result = await printDocument({
      docType: type,
      settings,
      sale: lastSale,
      items: lastSaleItems,
      config,
    });
    if (!result.ok) {
      toast.error('Tidak ada metode cetak yang tersedia. Periksa pengaturan printer di Setup.');
    }
  };

  const docLabel = (t: DocType) => (t === 'THERMAL' ? 'Struk' : t === 'FAKTUR' ? 'Faktur' : 'Surat Jalan');

  // Renders exactly what will be printed. On web that is the real generated HTML
  // in an iframe (true WYSIWYG); on native we fall back to the layout previews.
  const renderPreviewContent = () => {
    if (!previewType || !lastSale || !settings) {
      return <Text style={styles.previewEmpty}>Tidak ada data untuk ditampilkan.</Text>;
    }
    if (Platform.OS === 'web') {
      const html = generatePrintHtml(previewType, settings, lastSale, lastSaleItems);
      return createElement('iframe', {
        srcDoc: html,
        title: 'print-preview',
        style: { width: '100%', height: '100%', border: 'none', background: '#fff' },
      } as any);
    }
    return (
      <ScrollView contentContainerStyle={styles.previewNativeScroll}>
        <ScrollView horizontal showsHorizontalScrollIndicator>
          {previewType === 'THERMAL' ? (
            <ThermalPreview settings={settings} />
          ) : previewType === 'FAKTUR' ? (
            <InvoicePreview settings={settings} />
          ) : (
            <DeliveryOrderPreview settings={settings} />
          )}
        </ScrollView>
      </ScrollView>
    );
  };

  // --- SUB-COMPONENTS ---
  const renderStepper = (row: SaleRow, extra?: ViewStyle) => (
    <View style={[styles.qtyStepper, extra]}>
      <TouchableOpacity style={styles.stepBtn} onPress={() => stepQty(row._id, -1)}>
        <Ionicons name="remove" size={16} color="#0F172A" />
      </TouchableOpacity>
      <TextInput
        style={[styles.mono, styles.qtyInput]}
        keyboardType="numeric"
        value={row.qty}
        onChangeText={t => updateRow(row._id, 'qty', t)}
      />
      <TouchableOpacity style={styles.stepBtn} onPress={() => stepQty(row._id, 1)}>
        <Ionicons name="add" size={16} color="#0F172A" />
      </TouchableOpacity>
    </View>
  );

  const renderInputTable = () => (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>DETAIL PESANAN</Text>

      {/* Opens the command-palette item picker (or press "/" on desktop) */}
      <TouchableOpacity style={styles.paletteTrigger} onPress={openPalette} activeOpacity={0.8}>
        <Ionicons name="search" size={18} color="#94A3B8" />
        <Text style={styles.paletteTriggerText}>Cari atau pilih barang...</Text>
        {isDesktop && (
          <View style={styles.kbdHint}>
            <Text style={styles.kbdText}>/</Text>
          </View>
        )}
      </TouchableOpacity>

      {rows.length === 0 ? (
        <View style={styles.cartEmpty}>
          <Ionicons name="cart-outline" size={36} color="#CBD5E1" />
          <Text style={styles.cartEmptyText}>Belum ada barang. Cari di atas.</Text>
        </View>
      ) : isDesktop ? (
        <>
          <View style={styles.tableHead}>
            <Text style={[styles.th, { flex: 2.4 }]}>BARANG</Text>
            <Text style={[styles.th, { flex: 0.7, textAlign: 'center' }]}>STOK</Text>
            <Text style={[styles.th, { flex: 1.6, textAlign: 'center' }]}>QTY</Text>
            <Text style={[styles.th, { flex: 1.2, textAlign: 'right' }]}>HARGA</Text>
            <Text style={[styles.th, { flex: 1.8, textAlign: 'right', paddingRight: 10 }]}>TOTAL</Text>
            <View style={{ width: 30 }} />
          </View>
          {rows.map(row => (
            <View key={row._id} style={styles.tableRow}>
              <View style={{ flex: 2.4, paddingRight: 8 }}>
                <Text style={styles.cartItemName} numberOfLines={2}>
                  {row.item?.item_name}
                </Text>
              </View>
              <Text style={[styles.mono, styles.cellText, { flex: 0.7 }]}>{row.item?.quantity ?? '-'}</Text>
              {renderStepper(row, { flex: 1.6 })}
              <Text style={[styles.mono, styles.cellPrice, { flex: 1.2 }]}>{formatRupiah(parseNum(row.price))}</Text>
              <View
                style={{
                  flex: 1.8,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  gap: 8,
                  paddingRight: 10,
                }}
              >
                {discountRows.includes(row._id) || parseNum(row.discount) > 0 ? (
                  <TextInput
                    style={[styles.mono, styles.cellInput, { width: 60, marginBottom: 0, textAlign: 'center' }]}
                    keyboardType="numeric"
                    value={row.discount}
                    onChangeText={t => updateRow(row._id, 'discount', t)}
                    placeholder="Disk"
                    autoFocus
                  />
                ) : (
                  <TouchableOpacity
                    style={styles.discTagBtn}
                    onPress={() => setDiscountRows(prev => [...prev, row._id])}
                  >
                    <Ionicons name="pricetag-outline" size={14} color="#94A3B8" />
                  </TouchableOpacity>
                )}
                <Text style={[styles.mono, styles.cellTotal]}>{formatRupiah(parseNum(row.total))}</Text>
              </View>
              <TouchableOpacity onPress={() => removeRow(row._id)} style={styles.removeBtn}>
                <Ionicons name="trash-outline" size={18} color="#94A3B8" />
              </TouchableOpacity>
            </View>
          ))}
        </>
      ) : (
        rows.map(row => (
          <View key={row._id} style={styles.mItemCard}>
            <View style={styles.mItemHead}>
              <Text style={styles.mItemName} numberOfLines={2}>
                {row.item?.item_name}
              </Text>
              <TouchableOpacity onPress={() => removeRow(row._id)}>
                <Ionicons name="trash-outline" size={20} color="#DC2626" />
              </TouchableOpacity>
            </View>
            <View style={styles.mRow}>
              <Text style={styles.mRowLabel}>QTY</Text>
              {renderStepper(row, styles.mStepper)}
            </View>
            <View style={styles.mRow}>
              <Text style={styles.mRowLabel}>HARGA SATUAN</Text>
              <Text style={[styles.mono, styles.mRowValue]}>{formatRupiah(parseNum(row.price))}</Text>
            </View>
            <View style={styles.mItemFooter}>
              <Text style={styles.mStock}>
                Stok: {row.item?.quantity ?? '-'}
                {row.item?.allow_preorder ? ' • Pre-order' : ''}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                {discountRows.includes(row._id) || parseNum(row.discount) > 0 ? (
                  <TextInput
                    style={[styles.mono, styles.mDiscInput]}
                    keyboardType="numeric"
                    value={row.discount}
                    onChangeText={t => updateRow(row._id, 'discount', t)}
                    placeholder="Disk"
                    autoFocus
                  />
                ) : (
                  <TouchableOpacity
                    style={styles.discTagBtn}
                    onPress={() => setDiscountRows(prev => [...prev, row._id])}
                  >
                    <Ionicons name="pricetag-outline" size={16} color="#94A3B8" />
                  </TouchableOpacity>
                )}
                <Text style={[styles.mono, styles.mTotal]}>{formatRupiah(parseNum(row.total))}</Text>
              </View>
            </View>
          </View>
        ))
      )}
    </View>
  );

  const DENOMS = [1000, 2000, 5000, 10000, 20000, 50000, 100000];
  // Quick cash-entry pad: each tap ADDS the denomination; RESET clears to zero.
  const renderMoneyPad = (value: string, setValue: (s: string) => void) => (
    <View style={styles.moneyPad}>
      {DENOMS.map(d => (
        <PressableScale key={d} style={styles.denomBtn} onPress={() => setValue(String(parseNum(value) + d))}>
          <Text style={styles.denomText}>{d / 1000}rb</Text>
        </PressableScale>
      ))}
      <PressableScale style={[styles.denomBtn, styles.denomReset]} onPress={() => setValue('0')}>
        <Text style={styles.denomResetText}>RESET</Text>
      </PressableScale>
    </View>
  );

  const renderCheckout = () => (
    <View style={styles.receiptCard as ViewStyle}>
      <Text style={styles.sectionTitle}>PEMBAYARAN</Text>

      <View style={[styles.mb15, { position: 'relative', zIndex: 30 }]}>
        <Text style={styles.label}>Nama Pelanggan / No. Telepon</Text>
        <TextInput
          style={styles.input}
          value={customerName}
          onChangeText={handleCustomerSearch}
          onFocus={() => setShowCustomerSuggest(true)}
          placeholder="Umum"
        />
        {selectedCustomerId ? <Text style={styles.custLinkedHint}>Terhubung ke buku piutang pelanggan</Text> : null}
        {showCustomerSuggest && (
          <View style={styles.custSuggestBox}>
            <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled style={{ maxHeight: 200 }}>
              <TouchableOpacity style={styles.suggestItem} onPress={selectUmum}>
                <Text style={{ fontWeight: 'bold', color: '#0F172A' }}>Umum (tanpa pelanggan)</Text>
              </TouchableOpacity>
              {customerResults.map(c => (
                <TouchableOpacity key={c.id} style={styles.suggestItem} onPress={() => selectCustomer(c)}>
                  <Text style={{ fontWeight: 'bold', color: '#0F172A' }}>{c.name}</Text>
                  {!!c.phone && <Text style={[styles.mono, { fontSize: 11, color: '#64748B' }]}>{c.phone}</Text>}
                </TouchableOpacity>
              ))}
              {online &&
                customerName.trim().length > 0 &&
                customerName.trim().toLowerCase() !== 'umum' &&
                !customerResults.some(c => c.name.toLowerCase() === customerName.trim().toLowerCase()) && (
                  <TouchableOpacity style={styles.suggestItem} onPress={quickCreateCustomer}>
                    <Text style={{ fontWeight: 'bold', color: '#DC2626' }}>
                      + Tambah &quot;{customerName.trim()}&quot;
                    </Text>
                  </TouchableOpacity>
                )}
            </ScrollView>
          </View>
        )}
      </View>

      <View style={styles.mb15}>
        <Text style={styles.label}>Metode Bayar</Text>
        {paymentMethods.length > 0 ? (
          <View style={styles.payWrap}>
            {paymentMethods.map(m => {
              const active = selectedPayment === m.name;
              return (
                <TouchableOpacity
                  key={m.id}
                  onPress={() => setSelectedPayment(m.name)}
                  style={[styles.payChip, active && styles.payChipActive]}
                >
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
        <Text style={styles.label}>Subtotal</Text>
        <Text style={[styles.mono, styles.subTotal, { fontSize: 16, fontWeight: '700' }]}>
          {formatRupiah(subtotal)}
        </Text>
      </View>

      <View style={{ marginTop: 12 }}>
        <TouchableOpacity style={styles.discountToggle} onPress={() => setShowDiscount(v => !v)}>
          <Text style={styles.label}>Diskon Transaksi (Rp)</Text>
          <View style={styles.row}>
            {txDiscount > 0 && <Text style={[styles.mono, styles.discountAmount]}>− {formatRupiah(txDiscount)}</Text>}
            <Ionicons
              name={showDiscount ? 'chevron-up' : 'chevron-down'}
              size={18}
              color="#94A3B8"
              style={{ marginLeft: 8 }}
            />
          </View>
        </TouchableOpacity>
        {showDiscount && (
          <Animated.View entering={FadeInDown.duration(200)} exiting={FadeOutUp.duration(150)} style={{ marginTop: 8 }}>
            <TextInput
              style={[styles.mono, styles.input]}
              keyboardType="numeric"
              value={discountStr}
              onChangeText={setDiscountStr}
              placeholder="0"
            />
          </Animated.View>
        )}
      </View>

      <View style={styles.receiptDivider} />

      <View style={styles.rowBetween}>
        <Text style={styles.totalLabel}>TOTAL</Text>
        <Animated.Text style={[styles.mono, styles.grandTotalText, totalAnim]}>
          {formatRupiah(currentTotal)}
        </Animated.Text>
      </View>

      <View style={{ marginTop: 15 }}>
        {isTempo ? (
          <View>
            <Text style={styles.label}>Uang Muka (DP)</Text>
            <TextInput
              style={[styles.mono, styles.input]}
              keyboardType="numeric"
              value={downPaymentStr}
              onChangeText={setDownPaymentStr}
            />
            {renderMoneyPad(downPaymentStr, setDownPaymentStr)}
            <View style={[styles.rowBetween, { marginTop: 10 }]}>
              <Text style={styles.label}>Sisa Hutang</Text>
              <Text style={[styles.mono, styles.subTotal, { color: '#B45309' }]}>{formatRupiah(remainingBalance)}</Text>
            </View>
          </View>
        ) : isElectronic ? (
          <View style={[styles.rowBetween, { marginVertical: 6 }]}>
            <Text style={styles.label}>Status Pembayaran</Text>
            <Text style={[styles.mono, styles.subTotal, { fontSize: 15, color: '#16A34A' }]}>
              {selectedPayment.toUpperCase()} • LUNAS
            </Text>
          </View>
        ) : (
          <View>
            <Text style={styles.label}>Uang Diterima</Text>
            <View style={styles.row}>
              <TextInput
                style={[styles.mono, styles.input, { flex: 1, marginBottom: 0 }]}
                keyboardType="numeric"
                value={cashReceivedStr}
                onChangeText={setCashReceivedStr}
              />
              <TouchableOpacity style={styles.pasBtn} onPress={() => setCashReceivedStr(currentTotal.toString())}>
                <Text style={styles.pasText}>PAS</Text>
              </TouchableOpacity>
            </View>
            {renderMoneyPad(cashReceivedStr, setCashReceivedStr)}
            <View style={[styles.rowBetween, { marginTop: 10 }]}>
              <Text style={styles.label}>Kembalian</Text>
              <Text style={[styles.mono, styles.subTotal, { color: changeAmount < 0 ? '#DC2626' : '#16A34A' }]}>
                {formatRupiah(changeAmount)}
              </Text>
            </View>
          </View>
        )}
      </View>

      <PressableScale onPress={handleCheckout} disabled={checkoutBlocked} style={{ marginTop: 25 }}>
        <LinearGradient
          colors={checkoutBlocked ? ['#CBD5E1', '#94A3B8'] : ['#DC2626', '#991B1B']}
          style={styles.payBtn}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.payBtnText}>PROSES TRANSAKSI</Text>}
        </LinearGradient>
      </PressableScale>
      {!online ? (
        <Text style={styles.offlineHint}>Tidak ada koneksi — transaksi dinonaktifkan sementara.</Text>
      ) : checkoutBlock ? (
        <Text style={styles.offlineHint}>{checkoutBlock}</Text>
      ) : null}
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.tabToggle}>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'input' && styles.tabBtnActive]}
            onPress={() => setActiveTab('input')}
          >
            <Text style={[styles.tabText, activeTab === 'input' && styles.tabTextActive]}>KASIR</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'history' && styles.tabBtnActive]}
            onPress={() => setActiveTab('history')}
          >
            <Text style={[styles.tabText, activeTab === 'history' && styles.tabTextActive]}>RIWAYAT</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, !isDesktop && { paddingBottom: 120 }]}
        keyboardShouldPersistTaps="handled"
      >
        {activeTab === 'input' ? (
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={isDesktop ? styles.desktopLayout : styles.mobileLayout}
          >
            <View style={isDesktop ? { flex: 2 } : { width: '100%' }}>{renderInputTable()}</View>
            <View style={isDesktop ? { flex: 1, marginLeft: 20 } : { width: '100%' }}>{renderCheckout()}</View>
          </KeyboardAvoidingView>
        ) : (
          <View style={styles.historyContainer}>
            <View style={styles.histSearch}>
              <Ionicons name="search" size={18} color="#94A3B8" />
              <TextInput
                style={styles.histSearchInput}
                placeholder="Cari pelanggan..."
                value={histSearch}
                onChangeText={setHistSearch}
              />
              {histSearch.length > 0 && (
                <TouchableOpacity onPress={() => setHistSearch('')}>
                  <Ionicons name="close-circle" size={18} color="#CBD5E1" />
                </TouchableOpacity>
              )}
            </View>

            <Text style={styles.histFilterLabel}>Status</Text>
            <View style={styles.histFilters}>
              {(
                [
                  ['ALL', 'Semua'],
                  ['PAID', 'Lunas'],
                  ['PARTIAL', 'Sebagian'],
                  ['UNPAID', 'Belum'],
                ] as const
              ).map(([k, label]) => (
                <TouchableOpacity
                  key={k}
                  onPress={() => setHistStatus(k)}
                  style={[styles.histChip, histStatus === k && styles.histChipActive]}
                >
                  <Text style={[styles.histChipText, histStatus === k && styles.histChipTextActive]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.histFilterLabel}>Tanggal</Text>
            <View style={styles.histFilters}>
              {(
                [
                  ['today', 'Hari Ini'],
                  ['7d', '7 Hari'],
                  ['30d', '30 Hari'],
                  ['all', 'Semua'],
                ] as const
              ).map(([k, label]) => (
                <TouchableOpacity
                  key={k}
                  onPress={() => setHistPreset(k)}
                  style={[styles.histChip, histPreset === k && styles.histDateActive]}
                >
                  <Text style={[styles.histChipText, histPreset === k && styles.histChipTextActive]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.histSummary}>
              <View style={styles.histSummaryItem}>
                <Text style={styles.histSummaryLabel}>TRANSAKSI</Text>
                <Text style={styles.histSummaryVal}>{histSummary.count}</Text>
              </View>
              <View style={styles.histSummaryItem}>
                <Text style={styles.histSummaryLabel}>TOTAL</Text>
                <Text style={[styles.mono, styles.histSummaryVal]} numberOfLines={1} adjustsFontSizeToFit>
                  {formatRupiah(histSummary.total)}
                </Text>
              </View>
              <View style={styles.histSummaryItem}>
                <Text style={styles.histSummaryLabel}>PIUTANG</Text>
                <Text
                  style={[styles.mono, styles.histSummaryVal, { color: '#B45309' }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {formatRupiah(histSummary.piutang)}
                </Text>
              </View>
            </View>

            {loading ? (
              <ActivityIndicator style={{ marginTop: 30 }} color="#DC2626" />
            ) : sales.length === 0 ? (
              <View style={styles.histEmpty}>
                <Ionicons name="receipt-outline" size={40} color="#CBD5E1" />
                <Text style={styles.histEmptyText}>Belum ada transaksi.</Text>
              </View>
            ) : (
              sales.map((item, i) => {
                const expanded = expandedId === item.id;
                const remaining = histRemaining(item);
                const strip = item.status === 'PAID' ? '#16A34A' : item.status === 'PARTIAL' ? '#F59E0B' : '#DC2626';
                return (
                  <Animated.View
                    key={item.id}
                    entering={FadeInDown.duration(200).delay(Math.min(i, 8) * 25)}
                    style={styles.historyCard}
                  >
                    <View style={[styles.histStrip, { backgroundColor: strip }]} />
                    <TouchableOpacity activeOpacity={0.7} onPress={() => toggleExpand(item)} style={styles.histHead}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.hName}>{item.customer_name}</Text>
                        <Text style={styles.hDate}>{new Date(item.created_at).toLocaleString('id-ID')}</Text>
                        <View style={styles.hMeta}>
                          <Text
                            style={[
                              styles.badge,
                              item.status === 'PAID'
                                ? styles.badgePaid
                                : item.status === 'PARTIAL'
                                  ? styles.badgePartial
                                  : styles.badgeUnpaid,
                            ]}
                          >
                            {item.status}
                          </Text>
                          <Text style={styles.hPm}>{item.payment_method}</Text>
                        </View>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={[styles.mono, styles.hPrice]}>{formatRupiah(item.total_amount)}</Text>
                        {remaining > 0 && <Text style={styles.hRemaining}>Sisa {formatRupiah(remaining)}</Text>}
                        <Ionicons
                          name={expanded ? 'chevron-up' : 'chevron-down'}
                          size={16}
                          color="#94A3B8"
                          style={{ marginTop: 4 }}
                        />
                      </View>
                    </TouchableOpacity>
                    {expanded && (
                      <View style={styles.histDetail}>
                        {(expandedItems[item.id] || []).map((it, idx) => (
                          <View key={idx} style={styles.histDetailRow}>
                            <Text style={styles.histDetailName} numberOfLines={1}>
                              {it.quantity}× {it.item_name}
                            </Text>
                            <Text style={[styles.mono, styles.histDetailVal]}>
                              {formatRupiah(it.price_at_sale * it.quantity)}
                            </Text>
                          </View>
                        ))}
                        <View style={styles.histDetailActions}>
                          {profile?.role !== 'STAFF' && (
                            <>
                              <TouchableOpacity style={styles.histActBtn} onPress={() => handleEditSale(item)}>
                                <Ionicons name="create-outline" size={16} color="#0F172A" />
                                <Text style={styles.histActText}>Edit</Text>
                              </TouchableOpacity>
                              <TouchableOpacity style={styles.histActBtn} onPress={() => handleDeleteSale(item)}>
                                <Ionicons name="trash-outline" size={16} color="#DC2626" />
                                <Text style={[styles.histActText, { color: '#DC2626' }]}>Hapus</Text>
                              </TouchableOpacity>
                            </>
                          )}
                          <TouchableOpacity
                            style={styles.histActBtn}
                            onPress={async () => {
                              setLastSale(item);
                              const { data } = await supabase.from('sale_items').select('*').eq('sale_id', item.id);
                              setLastSaleItems((data as SaleItem[]) || []);
                              setPrintModal(true);
                            }}
                          >
                            <Ionicons name="print-outline" size={16} color="#16A34A" />
                            <Text style={[styles.histActText, { color: '#16A34A' }]}>Cetak</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}
                  </Animated.View>
                );
              })
            )}

            {!loading && sales.length >= histLimit && (
              <TouchableOpacity style={styles.histLoadMore} onPress={() => setHistLimit(l => l + 50)}>
                <Text style={styles.histLoadMoreText}>MUAT LEBIH BANYAK</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </ScrollView>

      <Modal visible={editModal} animationType="slide">
        <View style={[styles.container, { paddingTop: 50 }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Edit Transaksi #{editingSale?.id}</Text>
            <TouchableOpacity
              onPress={() => {
                setEditModal(false);
                resetPOS();
              }}
            >
              <Ionicons name="close" size={28} color="#0F172A" />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.scrollContent}>
            {renderInputTable()}
            {renderCheckout()}
            <TouchableOpacity
              style={[styles.payBtn, { backgroundColor: '#0F172A', marginBottom: 40 }]}
              onPress={handleUpdateSale}
            >
              <Text style={styles.payBtnText}>SIMPAN PERUBAHAN</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      <CommandPalette<InventoryItem>
        visible={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        items={paletteAll}
        loading={paletteLoading}
        isDesktop={isDesktop}
        placeholder="Cari barang..."
        emptyText="Tidak ada barang."
        keyExtractor={i => i.id}
        getLabel={i => i.item_name}
        getSubtitle={i => `${formatRupiah(i.price)} • Stok: ${i.quantity}${i.allow_preorder ? ' • PO' : ''}`}
        getGroup={i => i.category || 'Lainnya'}
        favorites={popularItems}
        favoritesTitle="Sering Dijual"
        getCount={i => {
          const r = rows.find(x => x.item?.id === i.id);
          return r ? parseNum(r.qty) : 0;
        }}
        onSelect={addItemToCart}
        onRemove={decrementItem}
        keepOpenOnSelect
        footer={
          <>
            <Text style={{ fontSize: 12, color: '#64748B', fontWeight: '600' }}>{rows.length} barang di keranjang</Text>
            <TouchableOpacity
              onPress={() => setPaletteOpen(false)}
              style={{ backgroundColor: '#0F172A', borderRadius: 10, paddingHorizontal: 18, paddingVertical: 10 }}
            >
              <Text style={{ color: '#FFF', fontWeight: '800', fontSize: 12, letterSpacing: 0.5 }}>SELESAI</Text>
            </TouchableOpacity>
          </>
        }
      />

      <Modal visible={printModal} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.modalCard}>
            <Ionicons name="checkmark-circle" size={64} color="#16A34A" />
            <Text style={styles.modalTitle}>Berhasil!</Text>
            {(
              [
                { type: 'THERMAL', color: '#DC2626', icon: 'print', label: 'STRUK THERMAL' },
                { type: 'FAKTUR', color: '#0F172A', icon: 'document-text', label: 'FAKTUR A5' },
                { type: 'DO', color: '#16A34A', icon: 'bus', label: 'SURAT JALAN' },
              ] as { type: DocType; color: string; icon: any; label: string }[]
            ).map(opt => (
              <View key={opt.type} style={styles.pRow}>
                <TouchableOpacity
                  style={[styles.pOption, styles.pOptionFlex, { backgroundColor: opt.color }]}
                  onPress={() => executePrint(opt.type)}
                >
                  <Ionicons name={opt.icon} size={20} color="#FFF" style={{ marginRight: 10 }} />
                  <Text style={styles.pOptionText}>{opt.label}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.previewBtn} onPress={() => setPreviewType(opt.type)}>
                  <Ionicons name="eye-outline" size={20} color="#0F172A" />
                </TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity onPress={() => setPrintModal(false)} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>SELESAI</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={!!previewType} transparent animationType="slide" onRequestClose={() => setPreviewType(null)}>
        <View style={styles.previewOverlay}>
          <View style={styles.previewCard}>
            <View style={styles.previewHeader}>
              <Text style={styles.previewTitle}>Preview {previewType ? docLabel(previewType) : ''}</Text>
              <TouchableOpacity onPress={() => setPreviewType(null)} style={styles.iconBtn}>
                <Ionicons name="close" size={26} color="#0F172A" />
              </TouchableOpacity>
            </View>
            <View style={styles.previewBody}>{renderPreviewContent()}</View>
            <View style={styles.previewActions}>
              <TouchableOpacity style={styles.previewCancel} onPress={() => setPreviewType(null)}>
                <Text style={styles.previewCancelText}>TUTUP</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.previewPrint}
                onPress={() => {
                  const t = previewType;
                  setPreviewType(null);
                  if (t) executePrint(t);
                }}
              >
                <Ionicons name="print" size={18} color="#FFF" style={{ marginRight: 8 }} />
                <Text style={styles.previewPrintText}>CETAK SEKARANG</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
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
  card: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: '#94A3B8',
    marginBottom: 15,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  label: { fontSize: 11, fontWeight: '700', color: '#64748B', marginBottom: 6 },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#0F172A',
  },
  mb15: { marginBottom: 15 },
  row: { flexDirection: 'row' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  emptyText: { paddingLeft: 10, fontSize: 12, color: '#94A3B8' },
  payWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  payChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  payChipActive: { backgroundColor: '#0F172A', borderColor: '#0F172A' },
  payChipText: { fontSize: 13, fontWeight: '700', color: '#475569' },
  payChipTextActive: { color: '#FFF' },
  moneyPad: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  denomBtn: {
    flexGrow: 1,
    flexBasis: '22%',
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  denomText: { fontSize: 12, fontWeight: '800', color: '#0F172A' },
  denomReset: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  denomResetText: { fontSize: 12, fontWeight: '800', color: '#DC2626' },
  discountToggle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  discountAmount: { color: '#DC2626', fontWeight: '700', fontSize: 14 },
  tableHead: {
    flexDirection: 'row',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    marginBottom: 10,
  },
  th: { fontSize: 10, fontWeight: '800', color: '#94A3B8' },
  tableRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  cellInput: {
    minWidth: 0,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 6,
    padding: 8,
    fontSize: 13,
    textAlign: 'center',
  },
  cellText: { fontSize: 13, textAlign: 'center', color: '#0F172A' },
  cellTotal: { fontSize: 13, fontWeight: '700', color: '#0F172A', textAlign: 'right' },
  cellPrice: { fontSize: 13, textAlign: 'right', color: '#0F172A' },
  removeBtn: { width: 30, alignItems: 'center' },
  qtyStepper: { flexDirection: 'row', alignItems: 'center' },
  stepBtn: {
    width: 36,
    height: 40,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qtyInput: {
    flex: 1,
    minWidth: 0,
    backgroundColor: '#F8FAFC',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 10,
    fontSize: 15,
    textAlign: 'center',
    marginHorizontal: 2,
    color: '#0F172A',
  },
  suggestInline: {
    marginTop: 6,
    backgroundColor: '#FFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  // Mobile per-item card (stacked, full-width labeled rows)
  mItemCard: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    backgroundColor: '#FFF',
  },
  mRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
  mRowLabel: { fontSize: 12, fontWeight: '800', color: '#64748B' },
  mStepper: { width: 150 },
  mRowInput: {
    width: 150,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 15,
    textAlign: 'center',
    color: '#0F172A',
  },
  mRowValue: { fontSize: 15, fontWeight: '800', color: '#0F172A' },
  mItemFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  mFooterRight: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  mStock: { fontSize: 13, color: '#64748B', fontWeight: '600' },
  mTotal: { fontSize: 18, fontWeight: '900', color: '#DC2626' },
  mTrash: {
    width: 42,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
  },
  suggestBox: {
    position: 'absolute',
    top: 42,
    left: 0,
    right: 0,
    backgroundColor: '#FFF',
    borderRadius: 8,
    elevation: 10,
    zIndex: 1000,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  suggestItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  paletteTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 48,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
  },
  paletteTriggerText: { flex: 1, fontSize: 14, color: '#94A3B8', fontWeight: '600' },
  kbdHint: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: '#FFF',
  },
  kbdText: { fontSize: 12, fontWeight: '800', color: '#64748B' },
  palOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.55)',
    alignItems: 'center',
    paddingTop: 70,
    paddingHorizontal: 16,
  },
  palCard: {
    width: '100%',
    maxHeight: '85%',
    backgroundColor: '#FFF',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
  },
  palSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    height: 56,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  palSearchInput: { flex: 1, fontSize: 16, color: '#0F172A', outlineStyle: 'none' as any },
  palClose: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: '#F8FAFC',
  },
  palCloseText: { fontSize: 11, fontWeight: '800', color: '#94A3B8' },
  palCatRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F1F5F9', flexGrow: 0 },
  palChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  palChipActive: { backgroundColor: '#DC2626', borderColor: '#DC2626' },
  palChipText: { fontSize: 12, fontWeight: '700', color: '#64748B' },
  palChipTextActive: { color: '#FFF' },
  palSectionTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
  },
  palItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  palItemIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  palItemName: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  palItemMeta: { fontSize: 11, color: '#64748B', marginTop: 2 },
  palEmpty: { textAlign: 'center', color: '#94A3B8', fontWeight: '600', paddingVertical: 40 },
  palFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    backgroundColor: '#F8FAFC',
  },
  palFooterText: { fontSize: 12, color: '#64748B', fontWeight: '600' },
  palDone: { backgroundColor: '#0F172A', borderRadius: 10, paddingHorizontal: 18, paddingVertical: 10 },
  palDoneText: { color: '#FFF', fontWeight: '800', fontSize: 12, letterSpacing: 0.5 },
  catalogBar: { marginBottom: 14, position: 'relative', zIndex: 50 },
  catalogSearch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 46,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  catalogInput: { flex: 1, fontSize: 14, color: '#0F172A', outlineStyle: 'none' as any },
  favRow: { flexDirection: 'row', gap: 8, paddingRight: 4 },
  favChip: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FEE2E2',
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxWidth: 170,
  },
  favName: { fontSize: 12, fontWeight: '800', color: '#0F172A' },
  favPrice: { fontSize: 11, color: '#DC2626', fontWeight: '700', marginTop: 2 },
  catalogResults: {
    position: 'absolute',
    top: 52,
    left: 0,
    right: 0,
    backgroundColor: '#FFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    zIndex: 50,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  catalogEmpty: { padding: 16, textAlign: 'center', color: '#94A3B8', fontWeight: '600' },
  cartItemName: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  discTagBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mDiscInput: {
    width: 72,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    textAlign: 'center',
    color: '#111827',
    backgroundColor: '#F8FAFC',
    outlineStyle: 'none' as any,
  },
  cartEmpty: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  cartEmptyText: { color: '#94A3B8', fontWeight: '600', fontSize: 13, textAlign: 'center' },
  mItemHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 8,
  },
  mItemName: { flex: 1, fontSize: 15, fontWeight: '800', color: '#0F172A' },
  custSuggestBox: {
    position: 'absolute',
    top: 62,
    left: 0,
    right: 0,
    backgroundColor: '#FFF',
    borderRadius: 8,
    elevation: 10,
    zIndex: 1000,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  custLinkedHint: { fontSize: 10, color: '#16A34A', fontWeight: '700', marginTop: 4 },
  offlineHint: { fontSize: 11, color: '#B45309', marginTop: 10, fontWeight: '600', textAlign: 'center' },
  receiptCard: {
    backgroundColor: '#FFF',
    padding: 25,
    borderRadius: 2,
    borderTopWidth: 2,
    borderTopColor: '#0F172A',
    borderStyle: 'dashed', // Applying style to all borders but only showing Top via Width
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
  },
  receiptDivider: { height: 1, backgroundColor: '#F1F5F9', marginVertical: 10 },
  totalLabel: { fontSize: 14, fontWeight: '900', color: '#0F172A' },
  grandTotalText: { fontSize: 28, fontWeight: '900', color: '#DC2626' },
  subTotal: { fontSize: 18, fontWeight: '700' },
  pasBtn: {
    backgroundColor: '#0F172A',
    borderRadius: 8,
    paddingHorizontal: 15,
    justifyContent: 'center',
    marginLeft: 8,
  },
  pasText: { color: '#FFF', fontWeight: 'bold', fontSize: 11 },
  payBtn: { paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  payBtnText: { color: '#FFF', fontWeight: '900', fontSize: 15, letterSpacing: 1 },
  historyContainer: { width: '100%' },
  historyCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#FEE2E2',
    overflow: 'hidden',
    position: 'relative',
  },
  histStrip: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  histHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingLeft: 18,
  },
  histDetail: {
    paddingHorizontal: 18,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 10,
  },
  histDetailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  histDetailName: { flex: 1, fontSize: 13, color: '#334155', marginRight: 10 },
  histDetailVal: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  histDetailActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  histActBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  histActText: { fontSize: 12, fontWeight: '700', color: '#0F172A' },
  hRemaining: { fontSize: 11, color: '#B45309', fontWeight: '700', marginTop: 2 },
  histSearch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFF',
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 46,
    borderWidth: 1,
    borderColor: '#FEE2E2',
    marginBottom: 12,
  },
  histSearchInput: { flex: 1, fontSize: 14, color: '#0F172A', outlineStyle: 'none' as any },
  histFilters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  histFilterLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
    marginTop: 2,
  },
  histChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#FEE2E2',
  },
  histChipActive: { backgroundColor: '#DC2626', borderColor: '#DC2626' },
  histDateActive: { backgroundColor: '#0F172A', borderColor: '#0F172A' },
  histChipText: { fontSize: 12, fontWeight: '700', color: '#64748B' },
  histChipTextActive: { color: '#FFF' },
  histSummary: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  histSummaryItem: {
    flex: 1,
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#FEE2E2',
  },
  histSummaryLabel: { fontSize: 9, fontWeight: '800', color: '#94A3B8', marginBottom: 4 },
  histSummaryVal: { fontSize: 14, fontWeight: '900', color: '#0F172A' },
  histEmpty: { alignItems: 'center', paddingVertical: 50, gap: 10 },
  histEmptyText: { color: '#94A3B8', fontWeight: '600' },
  histLoadMore: { alignItems: 'center', paddingVertical: 14, marginTop: 4 },
  histLoadMoreText: { color: '#DC2626', fontWeight: '800', fontSize: 12, letterSpacing: 0.5 },
  hName: { fontWeight: '800', fontSize: 15, color: '#0F172A' },
  hDate: { fontSize: 10, color: '#94A3B8', marginTop: 2 },
  hPrice: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  hMeta: { flexDirection: 'row', gap: 6, marginTop: 8, alignItems: 'center' },
  hPm: {
    fontSize: 9,
    fontWeight: '700',
    color: '#64748B',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badge: { fontSize: 9, fontWeight: '900', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  badgePaid: { backgroundColor: '#DCFCE7', color: '#166534' },
  badgePartial: { backgroundColor: '#FEF3C7', color: '#B45309' },
  badgeUnpaid: { backgroundColor: '#FEE2E2', color: '#991B1B' },
  hActions: { flexDirection: 'row', gap: 12, marginTop: 10 },
  iconBtn: { padding: 4 },
  reprintBtn: { padding: 4 },
  overlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.8)', justifyContent: 'center', alignItems: 'center' },
  modalCard: {
    backgroundColor: '#FFF',
    width: '85%',
    maxWidth: 400,
    borderRadius: 24,
    padding: 30,
    alignItems: 'center',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  modalTitle: { fontSize: 20, fontWeight: '900', color: '#0F172A', marginVertical: 10 },
  pOption: {
    width: '100%',
    padding: 16,
    borderRadius: 12,
    marginBottom: 10,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  pOptionFlex: { flex: 1, marginBottom: 0 },
  pOptionText: { color: '#FFF', fontWeight: '800', fontSize: 12, letterSpacing: 0.5 },
  pRow: { flexDirection: 'row', alignItems: 'stretch', gap: 8, width: '100%', marginBottom: 10 },
  previewBtn: {
    width: 52,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtn: { marginTop: 15, padding: 10 },
  closeBtnText: { color: '#94A3B8', fontWeight: '800', letterSpacing: 1.2, fontSize: 12 },
  // Print preview modal
  previewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  previewCard: { backgroundColor: '#FFF', borderRadius: 16, width: '92%', maxWidth: 820, height: '88%', padding: 16 },
  previewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  previewTitle: { fontSize: 18, fontWeight: '900', color: '#0F172A' },
  previewBody: { flex: 1, backgroundColor: '#E2E8F0', borderRadius: 10, overflow: 'hidden' },
  previewEmpty: { color: '#64748B', textAlign: 'center', padding: 30, fontSize: 13 },
  previewNativeScroll: { padding: 16, alignItems: 'center' },
  previewActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  previewCancel: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewCancelText: { color: '#475569', fontWeight: '800', fontSize: 12, letterSpacing: 0.5 },
  previewPrint: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#DC2626',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewPrintText: { color: '#FFF', fontWeight: '800', fontSize: 13, letterSpacing: 0.5 },
});
