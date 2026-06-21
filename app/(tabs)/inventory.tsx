import { Feather } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Animated as RNAnimated,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import CommandPalette from '../../components/CommandPalette';
import { confirm } from '../../lib/confirm';
import { parseNum } from '../../lib/number';
import { useProfile } from '../../lib/ProfileContext';
import { supabase } from '../../lib/supabase';
import { toast } from '../../lib/toast';

// --- TYPES ---
interface Metric {
  id: number;
  unit_name: string;
}
interface InventoryItem {
  id: number;
  item_name: string;
  quantity: number;
  price: number;
  min_stock: number;
  metric_id: number;
  allow_preorder?: boolean;
  last_supplier_name?: string | null;
  category?: string | null;
  metrics?: { unit_name: string };
}
interface SplitTarget {
  _tempId: string;
  itemId: string;
  qty: string;
}

export default function InventoryScreen() {
  const { profile } = useProfile();
  const { width } = useWindowDimensions();
  const isDesktop = width > 768;
  const isManager = profile?.role === 'SUPERADMIN' || profile?.role === 'OWNER';

  // --- STATE ---
  const [loading, setLoading] = useState(true);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [search, setSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(20); // load-more page size
  const [invFilter, setInvFilter] = useState<'all' | 'low' | 'out' | 'preorder'>('all');
  const [invSort, setInvSort] = useState<'name' | 'stock' | 'value'>('name');

  // Modal Visibility
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [splitModalVisible, setSplitModalVisible] = useState(false);

  // Form State: Add/Edit
  const [formName, setFormName] = useState('');
  const [formQty, setFormQty] = useState('');
  const [formPrice, setFormPrice] = useState('');
  const [formMinStock, setFormMinStock] = useState('5');
  const [formMetricId, setFormMetricId] = useState<string>('');
  const [formAllowPreorder, setFormAllowPreorder] = useState(false);
  const [formCategory, setFormCategory] = useState('');
  const [splitPaletteRow, setSplitPaletteRow] = useState<string | null>(null);

  // Targeted Item
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [stockAdjustment, setStockAdjustment] = useState('');

  // Form State: Split Stock
  const [sourceSplitQty, setSourceSplitQty] = useState('1');
  const [splitTargets, setSplitTargets] = useState<SplitTarget[]>([{ _tempId: '1', itemId: '', qty: '' }]);

  // Existing categories (for quick-pick chips in the Add/Edit form).
  const categories = useMemo(
    () => [...new Set(inventory.map(i => i.category).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b)),
    [inventory]
  );

  // Draggable FAB — the + button can be moved out of the way (it overlaps content on mobile).
  const fabPan = useRef(new RNAnimated.ValueXY()).current;
  const fabResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4,
      onPanResponderGrant: () => fabPan.extractOffset(),
      onPanResponderMove: RNAnimated.event([null, { dx: fabPan.x, dy: fabPan.y }], { useNativeDriver: false }),
    })
  ).current;

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: invData } = await supabase.from('inventory').select('*, metrics(unit_name)').order('item_name');
      const { data: metData } = await supabase.from('metrics').select('*').order('unit_name');

      if (invData) setInventory(invData);
      if (metData) {
        setMetrics(metData);
        if (metData.length > 0 && formMetricId === '') setFormMetricId(metData[0].id.toString());
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);
  // Restart the visible window whenever the search changes.
  useEffect(() => {
    setVisibleCount(20);
  }, [search, invFilter, invSort]);

  // --- LOGIC: SAVE / UPDATE PRODUCT ---
  const handleSaveProduct = async () => {
    if (!formName || !formMetricId) return toast.error('Nama dan Satuan wajib diisi');

    setLoading(true);
    const payload = {
      item_name: formName,
      price: parseNum(formPrice),
      min_stock: parseNum(formMinStock),
      metric_id: parseInt(formMetricId),
      allow_preorder: formAllowPreorder,
      category: formCategory.trim() || null,
    };

    let error: { message: string } | null = null;
    if (selectedItem) {
      const { error: err } = await supabase.from('inventory').update(payload).eq('id', selectedItem.id);
      error = err;
    } else {
      const { error: err } = await supabase.from('inventory').insert([{ ...payload, quantity: parseNum(formQty) }]);
      error = err;
    }

    if (!error) {
      setAddModalVisible(false);
      setEditModalVisible(false);
      fetchData();
    } else {
      toast.error(error.message);
    }
    setLoading(false);
  };

  // --- LOGIC: QUICK ADJUST STOCK ---
  const handleAdjustStock = async () => {
    if (!selectedItem || !stockAdjustment) return;
    const change = parseNum(stockAdjustment);
    if (!change) return;
    const { error } = await supabase
      .from('inventory')
      .update({ quantity: selectedItem.quantity + change })
      .eq('id', selectedItem.id);
    if (!error) {
      await supabase.from('inventory_logs').insert([
        {
          item_name: selectedItem.item_name,
          action_type: 'ADJUST',
          quantity_change: change,
          employee_name: profile?.full_name,
        },
      ]);
      setEditModalVisible(false);
      fetchData();
    }
  };

  // --- LOGIC: SPLIT STOCK ---
  const addSplitRow = () =>
    setSplitTargets([...splitTargets, { _tempId: Math.random().toString(), itemId: '', qty: '' }]);
  const removeSplitRow = (id: string) => setSplitTargets(splitTargets.filter(t => t._tempId !== id));

  const handleSplitProcess = async () => {
    if (!selectedItem) return;
    const sourceQty = parseNum(sourceSplitQty);
    const validTargets = splitTargets.filter(t => t.itemId !== '' && parseNum(t.qty) > 0);

    if (sourceQty <= 0) return toast.error('Qty diambil tidak valid');
    if (sourceQty > selectedItem.quantity) return toast.error('Stok tidak mencukupi');

    setLoading(true);
    // 1. Reduce Source
    await supabase
      .from('inventory')
      .update({ quantity: selectedItem.quantity - sourceQty })
      .eq('id', selectedItem.id);
    await supabase.from('inventory_logs').insert([
      {
        item_name: selectedItem.item_name,
        action_type: 'SPLIT_OUT',
        quantity_change: -sourceQty,
        employee_name: profile?.full_name,
      },
    ]);

    // 2. Add to Targets
    for (const target of validTargets) {
      const targetInv = inventory.find(i => i.id.toString() === target.itemId.toString());
      if (targetInv) {
        const addAmt = parseNum(target.qty);
        await supabase
          .from('inventory')
          .update({ quantity: targetInv.quantity + addAmt })
          .eq('id', targetInv.id);
        await supabase.from('inventory_logs').insert([
          {
            item_name: targetInv.item_name,
            action_type: 'SPLIT_IN',
            quantity_change: addAmt,
            employee_name: profile?.full_name,
          },
        ]);
      }
    }
    setSplitModalVisible(false);
    fetchData();
    setLoading(false);
  };

  // --- LOGIC: DELETE ---
  const handleDeleteProduct = async () => {
    if (!isManager || !selectedItem) return;
    const performDelete = async () => {
      const { error } = await supabase.from('inventory').delete().eq('id', selectedItem.id);
      if (!error) {
        setEditModalVisible(false);
        fetchData();
      } else toast.error('Barang sedang digunakan dalam transaksi.');
    };
    const ok = await confirm({
      title: 'Hapus Barang',
      message: `Hapus permanen "${selectedItem.item_name}"?`,
      confirmText: 'Hapus',
      danger: true,
    });
    if (ok) performDelete();
  };

  const handleOpenEdit = (item: InventoryItem) => {
    setSelectedItem(item);
    setFormName(item.item_name);
    setFormPrice(item.price.toString());
    setFormMinStock(item.min_stock.toString());
    setFormMetricId(item.metric_id.toString());
    setFormAllowPreorder(item.allow_preorder ?? false);
    setFormCategory(item.category ?? '');
    setStockAdjustment('');
    setEditModalVisible(true);
  };

  const exportCSV = () => {
    if (Platform.OS !== 'web') {
      toast.info('Ekspor CSV tersedia di aplikasi web.');
      return;
    }
    const esc = (v: any) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [['Nama', 'Stok', 'Satuan', 'Harga', 'Nilai', 'Batas Minim', 'Supplier'].join(',')];
    inventory.forEach(i => {
      lines.push(
        [
          esc(i.item_name),
          i.quantity,
          esc(i.metrics?.unit_name || ''),
          i.price,
          i.price * i.quantity,
          i.min_stock,
          esc(i.last_supplier_name || ''),
        ].join(',')
      );
    });
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'inventaris.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const overview = useMemo(
    () => ({
      count: inventory.length,
      value: inventory.reduce((a, i) => a + i.price * i.quantity, 0),
      low: inventory.filter(i => i.quantity <= i.min_stock).length,
    }),
    [inventory]
  );

  const filtered = useMemo(() => {
    let list = inventory.filter(i => i.item_name.toLowerCase().includes(search.toLowerCase()));
    if (invFilter === 'low') list = list.filter(i => i.quantity <= i.min_stock);
    else if (invFilter === 'out') list = list.filter(i => i.quantity <= 0);
    else if (invFilter === 'preorder') list = list.filter(i => i.allow_preorder);
    return [...list].sort((a, b) =>
      invSort === 'stock'
        ? a.quantity - b.quantity
        : invSort === 'value'
          ? b.price * b.quantity - a.price * a.quantity
          : a.item_name.localeCompare(b.item_name)
    );
  }, [inventory, search, invFilter, invSort]);

  const sortControl = (
    <TouchableOpacity
      onPress={() => setInvSort(s => (s === 'name' ? 'stock' : s === 'stock' ? 'value' : 'name'))}
      style={styles.sortBtn}
    >
      <Feather name="bar-chart-2" size={13} color="#0F172A" />
      <Text style={styles.sortText}>{invSort === 'name' ? 'A-Z' : invSort === 'stock' ? 'Stok' : 'Nilai'}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <View style={styles.searchBar}>
          <Feather name="search" size={18} color="#94A3B8" />
          <TextInput
            placeholder="Cari material..."
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
          />
        </View>
        <TouchableOpacity style={styles.exportBtn} onPress={exportCSV}>
          <Feather name="download" size={18} color="#FFF" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.refreshBtn} onPress={fetchData}>
          <Feather name="refresh-cw" size={18} color="#FFF" />
        </TouchableOpacity>
      </View>

      {/* OVERVIEW + FILTERS */}
      <View style={[styles.overviewRow, { paddingHorizontal: isDesktop ? 40 : 14 }]}>
        <View style={styles.ovItem}>
          <Text style={styles.ovLabel}>SKU</Text>
          <Text style={styles.ovVal}>{overview.count}</Text>
        </View>
        <View style={styles.ovItem}>
          <Text style={styles.ovLabel}>NILAI STOK</Text>
          <Text style={styles.ovVal} numberOfLines={1} adjustsFontSizeToFit>
            Rp {overview.value.toLocaleString('id-ID')}
          </Text>
        </View>
        <View style={styles.ovItem}>
          <Text style={styles.ovLabel}>STOK MINIM</Text>
          <Text style={[styles.ovVal, overview.low > 0 && { color: '#DC2626' }]}>{overview.low}</Text>
        </View>
      </View>
      <View
        style={[
          styles.filterRow,
          { paddingHorizontal: isDesktop ? 40 : 14 },
          !isDesktop && { borderBottomWidth: 0, paddingBottom: 6 },
        ]}
      >
        {(
          [
            ['all', 'Semua'],
            ['low', 'Stok Minim'],
            ['out', 'Habis'],
            ['preorder', 'Pre-order'],
          ] as const
        ).map(([k, l]) => (
          <TouchableOpacity
            key={k}
            onPress={() => setInvFilter(k)}
            style={[styles.fChip, invFilter === k && styles.fChipActive]}
          >
            <Text style={[styles.fChipText, invFilter === k && styles.fChipTextActive]}>{l}</Text>
          </TouchableOpacity>
        ))}
        {isDesktop && sortControl}
      </View>
      {/* Mobile: sort sits on its own row under the filter pills (not cramped to the right). */}
      {!isDesktop && (
        <View style={styles.sortRowMobile}>
          <Text style={styles.sortRowLabel}>Urutkan</Text>
          {sortControl}
        </View>
      )}

      {/* LIST */}
      {loading && !addModalVisible ? (
        <ActivityIndicator style={{ marginTop: 50 }} color="#DC2626" />
      ) : (
        <FlatList
          data={filtered.slice(0, visibleCount)}
          contentContainerStyle={{ padding: isDesktop ? 40 : 14, paddingBottom: isDesktop ? 40 : 140 }}
          renderItem={({ item }) => {
            const isLow = item.quantity <= item.min_stock;
            return (
              <Animated.View entering={FadeIn.duration(180)}>
                <TouchableOpacity
                  style={[styles.itemCard, isLow && styles.cardLow]}
                  onPress={() => handleOpenEdit(item)}
                >
                  <View style={[styles.iconCircle, isLow && { backgroundColor: '#FEE2E2' }]}>
                    <Feather name="package" size={20} color={isLow ? '#DC2626' : '#64748B'} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName}>{item.item_name}</Text>
                    <Text style={styles.itemPrice}>Rp {item.price.toLocaleString()}</Text>
                    <Text style={styles.itemSupplier} numberOfLines={1}>
                      <Feather name="truck" size={10} color="#94A3B8" />{' '}
                      {item.last_supplier_name || 'Belum ada supplier'}
                    </Text>
                    {item.allow_preorder && <Text style={styles.poBadge}>PRE-ORDER</Text>}
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[styles.itemQty, isLow && { color: '#DC2626' }]}>
                      {item.quantity} {item.metrics?.unit_name}
                    </Text>
                    {isLow && <Text style={styles.lowBadge}>STOK MINIM ({item.min_stock})</Text>}
                  </View>
                </TouchableOpacity>
              </Animated.View>
            );
          }}
          ListFooterComponent={
            filtered.length > visibleCount ? (
              <TouchableOpacity style={styles.loadMoreBtn} onPress={() => setVisibleCount(c => c + 20)}>
                <Text style={styles.loadMoreText}>
                  Muat Lebih Banyak ({Math.min(visibleCount, filtered.length)} / {filtered.length})
                </Text>
              </TouchableOpacity>
            ) : null
          }
        />
      )}

      {/* FAB: ADD — draggable (long-press-free: just drag) so it can be moved off content */}
      <RNAnimated.View
        style={[styles.fab, !isDesktop && { bottom: 110 }, { transform: fabPan.getTranslateTransform() }]}
        {...fabResponder.panHandlers}
      >
        <TouchableOpacity
          style={styles.fabInner}
          onPress={() => {
            setSelectedItem(null);
            setFormName('');
            setFormQty('');
            setFormPrice('');
            setFormMinStock('5');
            setFormAllowPreorder(false);
            setFormCategory('');
            setAddModalVisible(true);
          }}
        >
          <Feather name="plus" size={30} color="#FFF" />
        </TouchableOpacity>
      </RNAnimated.View>

      {/* MODAL: ADD MATERIAL */}
      <Modal visible={addModalVisible} transparent animationType="fade">
        <View style={[styles.modalOverlay, !isDesktop && styles.modalOverlayMobile]}>
          <KeyboardAvoidingView behavior="padding" style={[styles.modalContent, isDesktop && { width: 550 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Tambah Material Baru</Text>
              <TouchableOpacity onPress={() => setAddModalVisible(false)}>
                <Feather name="x" size={24} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.label}>Nama Barang</Text>
              <TextInput
                style={styles.input}
                value={formName}
                onChangeText={setFormName}
                placeholder="Contoh: Semen Tiga Roda"
              />
              <View style={styles.row}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={styles.label}>Stok Awal</Text>
                  <TextInput style={styles.input} keyboardType="numeric" value={formQty} onChangeText={setFormQty} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Harga (Rp)</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="numeric"
                    value={formPrice}
                    onChangeText={setFormPrice}
                  />
                </View>
              </View>
              <Text style={styles.label}>Batas Minim Stok</Text>
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                value={formMinStock}
                onChangeText={setFormMinStock}
              />
              <Text style={styles.label}>Satuan</Text>
              <View style={styles.unitWrap}>
                {metrics.map(m => {
                  const active = formMetricId === m.id.toString();
                  return (
                    <TouchableOpacity
                      key={m.id}
                      onPress={() => setFormMetricId(m.id.toString())}
                      style={[styles.unitChip, active && styles.unitChipActive]}
                    >
                      <Text style={[styles.unitChipText, active && styles.unitChipTextActive]}>
                        {m.unit_name.toUpperCase()}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={styles.label}>Kategori</Text>
              <TextInput
                style={styles.input}
                value={formCategory}
                onChangeText={setFormCategory}
                placeholder="mis. Semen & Perekat"
              />
              {categories.length > 0 && (
                <View style={styles.unitWrap}>
                  {categories.map(c => (
                    <TouchableOpacity
                      key={c}
                      onPress={() => setFormCategory(c)}
                      style={[styles.unitChip, formCategory === c && styles.unitChipActive]}
                    >
                      <Text style={[styles.unitChipText, formCategory === c && styles.unitChipTextActive]}>{c}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Bisa Pre-order</Text>
                  <Text style={styles.switchHint}>Tetap bisa dijual walau stok habis</Text>
                </View>
                <Switch
                  value={formAllowPreorder}
                  onValueChange={setFormAllowPreorder}
                  trackColor={{ true: '#DC2626' }}
                />
              </View>
              <TouchableOpacity style={styles.primaryBtn} onPress={handleSaveProduct}>
                <Text style={styles.btnText}>SIMPAN DATA</Text>
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* MODAL: OPTIONS / EDIT */}
      <Modal visible={editModalVisible} transparent animationType="fade">
        <View style={[styles.modalOverlay, !isDesktop && styles.modalOverlayMobile]}>
          <View style={[styles.modalContent, isDesktop && { width: 500 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Opsi & Edit</Text>
              <TouchableOpacity onPress={() => setEditModalVisible(false)}>
                <Feather name="x" size={24} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.adjustBox}>
                <Text style={styles.label}>Stok Saat Ini</Text>
                <Text style={styles.currentStock}>
                  {selectedItem?.quantity ?? 0} {selectedItem?.metrics?.unit_name ?? ''}
                </Text>

                <Text style={[styles.label, { marginTop: 14 }]}>Update Stok (Tambah / Kurang)</Text>
                <View style={styles.adjustRow}>
                  <TouchableOpacity
                    style={styles.adjStepBtn}
                    onPress={() => setStockAdjustment(String(parseNum(stockAdjustment) - 1))}
                  >
                    <Feather name="minus" size={20} color="#DC2626" />
                  </TouchableOpacity>
                  <TextInput
                    style={styles.adjInput}
                    placeholder="0"
                    keyboardType="numbers-and-punctuation"
                    value={stockAdjustment}
                    onChangeText={setStockAdjustment}
                  />
                  <TouchableOpacity
                    style={styles.adjStepBtn}
                    onPress={() => setStockAdjustment(String(parseNum(stockAdjustment) + 1))}
                  >
                    <Feather name="plus" size={20} color="#16A34A" />
                  </TouchableOpacity>
                </View>
                <Text style={styles.adjPreview}>
                  Stok menjadi:{' '}
                  <Text style={{ fontWeight: '900', color: '#111827' }}>
                    {(selectedItem?.quantity ?? 0) + parseNum(stockAdjustment)} {selectedItem?.metrics?.unit_name ?? ''}
                  </Text>
                </Text>

                <TouchableOpacity style={[styles.primaryBtn, { marginTop: 14 }]} onPress={handleAdjustStock}>
                  <Text style={styles.btnText}>UPDATE STOK</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.label}>Nama Produk</Text>
              <TextInput style={styles.input} value={formName} onChangeText={setFormName} />
              <View style={styles.row}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={styles.label}>Harga</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="numeric"
                    value={formPrice}
                    onChangeText={setFormPrice}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Minim</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="numeric"
                    value={formMinStock}
                    onChangeText={setFormMinStock}
                  />
                </View>
              </View>

              <Text style={styles.label}>Kategori</Text>
              <TextInput
                style={styles.input}
                value={formCategory}
                onChangeText={setFormCategory}
                placeholder="mis. Semen & Perekat"
              />
              {categories.length > 0 && (
                <View style={styles.unitWrap}>
                  {categories.map(c => (
                    <TouchableOpacity
                      key={c}
                      onPress={() => setFormCategory(c)}
                      style={[styles.unitChip, formCategory === c && styles.unitChipActive]}
                    >
                      <Text style={[styles.unitChipText, formCategory === c && styles.unitChipTextActive]}>{c}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Bisa Pre-order</Text>
                  <Text style={styles.switchHint}>Tetap bisa dijual walau stok habis</Text>
                </View>
                <Switch
                  value={formAllowPreorder}
                  onValueChange={setFormAllowPreorder}
                  trackColor={{ true: '#DC2626' }}
                />
              </View>

              <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: '#111827' }]} onPress={handleSaveProduct}>
                <Text style={styles.btnText}>SIMPAN PERUBAHAN INFO</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.splitBtn}
                onPress={() => {
                  setEditModalVisible(false);
                  setSplitModalVisible(true);
                }}
              >
                <Feather name="scissors" size={16} color="#DC2626" style={{ marginRight: 8 }} />
                <Text style={styles.splitBtnText}>PECAH STOK (SPLIT)</Text>
              </TouchableOpacity>

              {isManager && (
                <TouchableOpacity style={styles.deleteBtn} onPress={handleDeleteProduct}>
                  <Feather name="trash-2" size={16} color="#DC2626" />
                  <Text style={{ color: '#DC2626', marginLeft: 10, fontWeight: '700' }}>Hapus Permanen</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* MODAL: SPLIT STOCK LOGIC */}
      <Modal visible={splitModalVisible} transparent animationType="slide">
        <View style={[styles.modalOverlay, !isDesktop && styles.modalOverlayMobile]}>
          <View style={[styles.modalContent, isDesktop && { width: 650 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Pecah Stok</Text>
              <TouchableOpacity onPress={() => setSplitModalVisible(false)}>
                <Feather name="x" size={24} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.sourceBox}>
                <Text style={{ fontWeight: '900', color: '#111827' }}>{selectedItem?.item_name}</Text>
                <Text style={{ fontSize: 12, color: '#64748B' }}>Sisa: {selectedItem?.quantity}</Text>
                <TextInput
                  style={[styles.input, { marginTop: 10 }]}
                  placeholder="Qty diambil"
                  keyboardType="numeric"
                  value={sourceSplitQty}
                  onChangeText={setSourceSplitQty}
                />
              </View>
              <View style={{ alignItems: 'center', marginVertical: 10 }}>
                <Feather name="arrow-down" size={24} color="#CBD5E1" />
              </View>
              {splitTargets.map((t, idx) => (
                <View key={t._tempId} style={styles.splitRow}>
                  <TouchableOpacity
                    style={[
                      styles.pickerWrapper,
                      { flex: 1, marginBottom: 0, justifyContent: 'center', paddingHorizontal: 14 },
                    ]}
                    onPress={() => setSplitPaletteRow(t._tempId)}
                  >
                    <Text style={{ color: t.itemId ? '#111827' : '#94A3B8', fontWeight: '600' }} numberOfLines={1}>
                      {inventory.find(i => i.id.toString() === t.itemId)?.item_name || 'Pilih Target...'}
                    </Text>
                  </TouchableOpacity>
                  <TextInput
                    style={[styles.input, { width: 70, marginLeft: 10, marginBottom: 0 }]}
                    placeholder="Qty"
                    keyboardType="numeric"
                    value={t.qty}
                    onChangeText={v => {
                      const n = [...splitTargets];
                      n[idx].qty = v;
                      setSplitTargets(n);
                    }}
                  />
                  <TouchableOpacity onPress={() => removeSplitRow(t._tempId)} style={{ marginLeft: 10 }}>
                    <Feather name="minus-circle" size={20} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity onPress={addSplitRow} style={styles.addSplitBtn}>
                <Text style={{ color: '#DC2626', fontWeight: '800', fontSize: 12 }}>+ TARGET BARU</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.primaryBtn, { marginTop: 30 }]} onPress={handleSplitProcess}>
                <Text style={styles.btnText}>KONFIRMASI PECAH STOK</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
          <CommandPalette<InventoryItem>
            embedded
            visible={splitPaletteRow !== null}
            onClose={() => setSplitPaletteRow(null)}
            items={inventory.filter(i => i.id !== selectedItem?.id)}
            isDesktop={isDesktop}
            placeholder="Cari item tujuan..."
            emptyText="Tidak ada barang lain."
            keyExtractor={i => i.id}
            getLabel={i => i.item_name}
            getSubtitle={i => `Stok: ${i.quantity} ${i.metrics?.unit_name || ''}`}
            getGroup={i => i.category || 'Lainnya'}
            onSelect={i =>
              setSplitTargets(prev =>
                prev.map(t => (t._tempId === splitPaletteRow ? { ...t, itemId: i.id.toString() } : t))
              )
            }
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
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
  exportBtn: {
    width: 45,
    height: 45,
    backgroundColor: '#0F172A',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  overviewRow: { flexDirection: 'row', gap: 8, paddingTop: 14, backgroundColor: '#FFF' },
  ovItem: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  ovLabel: { fontSize: 9, fontWeight: '800', color: '#94A3B8', marginBottom: 4 },
  ovVal: { fontSize: 15, fontWeight: '900', color: '#111827' },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 14,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  fChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  fChipActive: { backgroundColor: '#DC2626', borderColor: '#DC2626' },
  fChipText: { fontSize: 12, fontWeight: '700', color: '#64748B' },
  fChipTextActive: { color: '#FFF' },
  sortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginLeft: 'auto',
  },
  sortText: { fontSize: 12, fontWeight: '800', color: '#0F172A' },
  sortRowMobile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  sortRowLabel: { fontSize: 11, fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase' },

  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    padding: 18,
    borderRadius: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    elevation: 2,
  },
  cardLow: { borderColor: '#FEE2E2', backgroundColor: '#FFF5F5' },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#F9FAFB',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  itemName: { fontSize: 15, fontWeight: '700', color: '#1F2937' },
  itemPrice: { fontSize: 12, color: '#94A3B8' },
  itemSupplier: { fontSize: 11, color: '#94A3B8', marginTop: 3 },
  loadMoreBtn: {
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 20,
    paddingVertical: 12,
    paddingHorizontal: 26,
    backgroundColor: '#FFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  loadMoreText: { fontSize: 13, fontWeight: '800', color: '#DC2626' },
  itemQty: { fontSize: 16, fontWeight: '800', color: '#111827' },
  lowBadge: { fontSize: 9, fontWeight: '900', color: '#DC2626', marginTop: 4 },

  fab: {
    position: 'absolute',
    bottom: 30,
    right: 30,
    width: 60,
    height: 60,
    borderRadius: 20,
    backgroundColor: '#DC2626',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
  },
  fabInner: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalOverlayMobile: { padding: 0 },
  modalContent: { backgroundColor: '#FFF', borderRadius: 28, padding: 30, width: '100%', maxHeight: '95%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: '900', color: '#111827' },
  modalSub: { color: '#DC2626', fontWeight: '800', textAlign: 'center', fontSize: 16, marginBottom: 25 },

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
  unitWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 15 },
  unitChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  unitChipActive: { backgroundColor: '#DC2626', borderColor: '#DC2626' },
  unitChipText: { fontSize: 13, fontWeight: '700', color: '#475569' },
  unitChipTextActive: { color: '#FFF' },
  row: { flexDirection: 'row' },
  pickerWrapper: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    height: 50,
    justifyContent: 'center',
    marginBottom: 15,
    overflow: 'hidden',
  },

  primaryBtn: {
    backgroundColor: '#DC2626',
    padding: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: { color: '#FFF', fontWeight: '900', fontSize: 14, letterSpacing: 0.5 },

  adjustBox: {
    backgroundColor: '#F9FAFB',
    padding: 15,
    borderRadius: 18,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  currentStock: { fontSize: 26, fontWeight: '900', color: '#111827', marginTop: 2 },
  adjustRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  adjStepBtn: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  adjInput: {
    flex: 1,
    minWidth: 0,
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    paddingVertical: 14,
    fontSize: 18,
    textAlign: 'center',
    color: '#111827',
    fontWeight: '800',
  },
  adjPreview: { fontSize: 13, color: '#64748B', marginTop: 10 },
  splitBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 15,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FEE2E2',
    marginTop: 15,
    marginBottom: 10,
  },
  splitBtnText: { color: '#DC2626', fontWeight: '800', fontSize: 12 },
  deleteBtn: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 10, padding: 10 },

  sourceBox: { padding: 15, backgroundColor: '#F9FAFB', borderRadius: 15, borderWidth: 1, borderColor: '#E5E7EB' },
  splitRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  addSplitBtn: {
    padding: 12,
    alignItems: 'center',
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: '#DC2626',
    borderRadius: 12,
    marginTop: 10,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 14,
    marginBottom: 15,
  },
  switchHint: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  poBadge: { fontSize: 9, fontWeight: '900', color: '#7C3AED', marginTop: 4 },
});
