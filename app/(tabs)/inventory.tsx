import { Feather } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator, Alert,
    FlatList,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    useWindowDimensions,
    View
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { parseNum } from '../../lib/number';
import { useProfile } from '../../lib/ProfileContext';
import { supabase } from '../../lib/supabase';

// --- TYPES ---
interface Metric { id: number; unit_name: string; }
interface InventoryItem {
  id: number;
  item_name: string;
  quantity: number;
  price: number;
  min_stock: number;
  metric_id: number;
  allow_preorder?: boolean;
  metrics?: { unit_name: string };
}
interface SplitTarget { _tempId: string; itemId: string; qty: string; }

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

  // Modal Visibility
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [splitModalVisible, setSplitModalVisible] = useState(false);

  // Form State: Add/Edit
  const [formName, setFormName] = useState('');
  const [formQty, setFormQty] = useState('');
  const [formPrice, setFormPrice] = useState('');
  const [formMinStock, setFormMinStock] = useState('5');
  const [formMetricId, setFormMetricId] = useState<string>("");
  const [formAllowPreorder, setFormAllowPreorder] = useState(false);

  // Targeted Item
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [stockAdjustment, setStockAdjustment] = useState('');

  // Form State: Split Stock
  const [sourceSplitQty, setSourceSplitQty] = useState('1');
  const [splitTargets, setSplitTargets] = useState<SplitTarget[]>([{ _tempId: '1', itemId: "", qty: '' }]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: invData } = await supabase.from('inventory').select('*, metrics(unit_name)').order('item_name');
      const { data: metData } = await supabase.from('metrics').select('*').order('unit_name');
      
      if (invData) setInventory(invData);
      if (metData) {
        setMetrics(metData);
        if (metData.length > 0 && formMetricId === "") setFormMetricId(metData[0].id.toString());
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  // --- LOGIC: SAVE / UPDATE PRODUCT ---
  const handleSaveProduct = async () => {
    if (!formName || !formMetricId) return Alert.alert('Error', 'Nama dan Satuan wajib diisi');
    
    setLoading(true);
    const payload = {
      item_name: formName,
      price: parseNum(formPrice),
      min_stock: parseNum(formMinStock),
      metric_id: parseInt(formMetricId),
      allow_preorder: formAllowPreorder
    };

    let error;
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
      Alert.alert('Gagal', error.message);
    }
    setLoading(false);
  };

  // --- LOGIC: QUICK ADJUST STOCK ---
  const handleAdjustStock = async () => {
    if (!selectedItem || !stockAdjustment) return;
    const change = parseNum(stockAdjustment);
    if (!change) return;
    const { error } = await supabase.from('inventory').update({ quantity: selectedItem.quantity + change }).eq('id', selectedItem.id);
    if (!error) {
      await supabase.from('inventory_logs').insert([{ 
        item_name: selectedItem.item_name, action_type: 'ADJUST', 
        quantity_change: change, employee_name: profile?.full_name 
      }]);
      setEditModalVisible(false);
      fetchData();
    }
  };

  // --- LOGIC: SPLIT STOCK ---
  const addSplitRow = () => setSplitTargets([...splitTargets, { _tempId: Math.random().toString(), itemId: "", qty: '' }]);
  const removeSplitRow = (id: string) => setSplitTargets(splitTargets.filter(t => t._tempId !== id));

  const handleSplitProcess = async () => {
    if (!selectedItem) return;
    const sourceQty = parseNum(sourceSplitQty);
    const validTargets = splitTargets.filter(t => t.itemId !== "" && parseNum(t.qty) > 0);

    if (sourceQty <= 0) return Alert.alert('Error', 'Qty diambil tidak valid');
    if (sourceQty > selectedItem.quantity) return Alert.alert('Error', 'Stok tidak mencukupi');
    
    setLoading(true);
    // 1. Reduce Source
    await supabase.from('inventory').update({ quantity: selectedItem.quantity - sourceQty }).eq('id', selectedItem.id);
    await supabase.from('inventory_logs').insert([{ item_name: selectedItem.item_name, action_type: 'SPLIT_OUT', quantity_change: -sourceQty, employee_name: profile?.full_name }]);

    // 2. Add to Targets
    for (const target of validTargets) {
      const targetInv = inventory.find(i => i.id.toString() === target.itemId.toString());
      if (targetInv) {
        const addAmt = parseNum(target.qty);
        await supabase.from('inventory').update({ quantity: targetInv.quantity + addAmt }).eq('id', targetInv.id);
        await supabase.from('inventory_logs').insert([{ item_name: targetInv.item_name, action_type: 'SPLIT_IN', quantity_change: addAmt, employee_name: profile?.full_name }]);
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
      if (!error) { setEditModalVisible(false); fetchData(); }
      else Alert.alert('Gagal', 'Barang sedang digunakan dalam transaksi.');
    };
    if (Platform.OS === 'web') { if (confirm(`Hapus permanen ${selectedItem.item_name}?`)) performDelete(); }
    else Alert.alert('Hapus', 'Yakin hapus barang ini?', [{ text: 'Batal' }, { text: 'Hapus', style: 'destructive', onPress: performDelete }]);
  };

  const handleOpenEdit = (item: InventoryItem) => {
    setSelectedItem(item);
    setFormName(item.item_name);
    setFormPrice(item.price.toString());
    setFormMinStock(item.min_stock.toString());
    setFormMetricId(item.metric_id.toString());
    setFormAllowPreorder(item.allow_preorder ?? false);
    setStockAdjustment('');
    setEditModalVisible(true);
  };

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <View style={styles.searchBar}>
          <Feather name="search" size={18} color="#94A3B8" />
          <TextInput placeholder="Cari material..." style={styles.searchInput} value={search} onChangeText={setSearch} />
        </View>
        <TouchableOpacity style={styles.refreshBtn} onPress={fetchData}><Feather name="refresh-cw" size={18} color="#FFF" /></TouchableOpacity>
      </View>

      {/* LIST */}
      {loading && !addModalVisible ? <ActivityIndicator style={{marginTop: 50}} color="#DC2626" /> : (
        <FlatList
          data={inventory.filter(i => i.item_name.toLowerCase().includes(search.toLowerCase()))}
          contentContainerStyle={{ padding: isDesktop ? 40 : 14 }}
          renderItem={({ item }) => {
            const isLow = item.quantity <= item.min_stock;
            return (
              <Animated.View entering={FadeIn.duration(180)}>
              <TouchableOpacity style={[styles.itemCard, isLow && styles.cardLow]} onPress={() => handleOpenEdit(item)}>
                <View style={[styles.iconCircle, isLow && {backgroundColor:'#FEE2E2'}]}>
                  <Feather name="package" size={20} color={isLow ? "#DC2626" : "#64748B"} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName}>{item.item_name}</Text>
                  <Text style={styles.itemPrice}>Rp {item.price.toLocaleString()}</Text>
                  {item.allow_preorder && <Text style={styles.poBadge}>PRE-ORDER</Text>}
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[styles.itemQty, isLow && {color: '#DC2626'}]}>{item.quantity} {item.metrics?.unit_name}</Text>
                    {isLow && <Text style={styles.lowBadge}>STOK MINIM ({item.min_stock})</Text>}
                </View>
              </TouchableOpacity>
              </Animated.View>
            );
          }}
        />
      )}

      {/* FAB: ADD */}
      <TouchableOpacity style={[styles.fab, !isDesktop && { bottom: 110 }]} onPress={() => { setSelectedItem(null); setFormName(''); setFormQty(''); setFormPrice(''); setFormMinStock('5'); setFormAllowPreorder(false); setAddModalVisible(true); }}>
        <Feather name="plus" size={30} color="#FFF" />
      </TouchableOpacity>

      {/* MODAL: ADD MATERIAL */}
      <Modal visible={addModalVisible} transparent animationType="fade">
        <View style={[styles.modalOverlay, !isDesktop && styles.modalOverlayMobile]}>
          <KeyboardAvoidingView behavior="padding" style={[styles.modalContent, isDesktop && { width: 550 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Tambah Material Baru</Text>
              <TouchableOpacity onPress={() => setAddModalVisible(false)}><Feather name="x" size={24} /></TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.label}>Nama Barang</Text>
              <TextInput style={styles.input} value={formName} onChangeText={setFormName} placeholder="Contoh: Semen Tiga Roda" />
              <View style={styles.row}>
                <View style={{flex:1, marginRight:10}}><Text style={styles.label}>Stok Awal</Text><TextInput style={styles.input} keyboardType="numeric" value={formQty} onChangeText={setFormQty}/></View>
                <View style={{flex:1}}><Text style={styles.label}>Harga (Rp)</Text><TextInput style={styles.input} keyboardType="numeric" value={formPrice} onChangeText={setFormPrice}/></View>
              </View>
              <View style={styles.row}>
                <View style={{flex:1, marginRight:10}}><Text style={styles.label}>Batas Minim</Text><TextInput style={styles.input} keyboardType="numeric" value={formMinStock} onChangeText={setFormMinStock}/></View>
                <View style={{flex:1}}>
                    <Text style={styles.label}>Satuan</Text>
                    <View style={styles.pickerWrapper}>
                        <Picker selectedValue={formMetricId} onValueChange={(v) => setFormMetricId(v)}>
                            {metrics.map(m => <Picker.Item key={m.id} label={m.unit_name.toUpperCase()} value={m.id.toString()} />)}
                        </Picker>
                    </View>
                </View>
              </View>
              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Bisa Pre-order</Text>
                  <Text style={styles.switchHint}>Tetap bisa dijual walau stok habis</Text>
                </View>
                <Switch value={formAllowPreorder} onValueChange={setFormAllowPreorder} trackColor={{ true: '#DC2626' }} />
              </View>
              <TouchableOpacity style={styles.primaryBtn} onPress={handleSaveProduct}><Text style={styles.btnText}>SIMPAN DATA</Text></TouchableOpacity>
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
                <TouchableOpacity onPress={() => setEditModalVisible(false)}><Feather name="x" size={24} /></TouchableOpacity>
             </View>
             <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.adjustBox}>
                    <Text style={styles.label}>Stok Saat Ini</Text>
                    <Text style={styles.currentStock}>{selectedItem?.quantity ?? 0} {selectedItem?.metrics?.unit_name ?? ''}</Text>

                    <Text style={[styles.label, { marginTop: 14 }]}>Update Stok (Tambah / Kurang)</Text>
                    <View style={styles.adjustRow}>
                        <TouchableOpacity style={styles.adjStepBtn} onPress={() => setStockAdjustment(String(parseNum(stockAdjustment) - 1))}>
                            <Feather name="minus" size={20} color="#DC2626" />
                        </TouchableOpacity>
                        <TextInput style={styles.adjInput} placeholder="0" keyboardType="numbers-and-punctuation" value={stockAdjustment} onChangeText={setStockAdjustment} />
                        <TouchableOpacity style={styles.adjStepBtn} onPress={() => setStockAdjustment(String(parseNum(stockAdjustment) + 1))}>
                            <Feather name="plus" size={20} color="#16A34A" />
                        </TouchableOpacity>
                    </View>
                    <Text style={styles.adjPreview}>Stok menjadi: <Text style={{ fontWeight: '900', color: '#111827' }}>{(selectedItem?.quantity ?? 0) + parseNum(stockAdjustment)} {selectedItem?.metrics?.unit_name ?? ''}</Text></Text>

                    <TouchableOpacity style={[styles.primaryBtn, { marginTop: 14 }]} onPress={handleAdjustStock}><Text style={styles.btnText}>UPDATE STOK</Text></TouchableOpacity>
                </View>

                <Text style={styles.label}>Nama Produk</Text>
                <TextInput style={styles.input} value={formName} onChangeText={setFormName} />
                <View style={styles.row}>
                    <View style={{flex:1, marginRight:10}}><Text style={styles.label}>Harga</Text><TextInput style={styles.input} keyboardType="numeric" value={formPrice} onChangeText={setFormPrice}/></View>
                    <View style={{flex:1}}><Text style={styles.label}>Minim</Text><TextInput style={styles.input} keyboardType="numeric" value={formMinStock} onChangeText={setFormMinStock}/></View>
                </View>

                <View style={styles.switchRow}>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.label}>Bisa Pre-order</Text>
                        <Text style={styles.switchHint}>Tetap bisa dijual walau stok habis</Text>
                    </View>
                    <Switch value={formAllowPreorder} onValueChange={setFormAllowPreorder} trackColor={{ true: '#DC2626' }} />
                </View>

                <TouchableOpacity style={[styles.primaryBtn, {backgroundColor:'#111827'}]} onPress={handleSaveProduct}><Text style={styles.btnText}>SIMPAN PERUBAHAN INFO</Text></TouchableOpacity>

                <TouchableOpacity style={styles.splitBtn} onPress={() => { setEditModalVisible(false); setSplitModalVisible(true); }}>
                    <Feather name="scissors" size={16} color="#DC2626" style={{marginRight:8}} />
                    <Text style={styles.splitBtnText}>PECAH STOK (SPLIT)</Text>
                </TouchableOpacity>

                {isManager && (
                    <TouchableOpacity style={styles.deleteBtn} onPress={handleDeleteProduct}>
                        <Feather name="trash-2" size={16} color="#DC2626" />
                        <Text style={{color:'#DC2626', marginLeft:10, fontWeight:'700'}}>Hapus Permanen</Text>
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
                    <TouchableOpacity onPress={() => setSplitModalVisible(false)}><Feather name="x" size={24} /></TouchableOpacity>
                </View>
                <ScrollView showsVerticalScrollIndicator={false}>
                    <View style={styles.sourceBox}>
                        <Text style={{fontWeight:'900', color:'#111827'}}>{selectedItem?.item_name}</Text>
                        <Text style={{fontSize:12, color:'#64748B'}}>Sisa: {selectedItem?.quantity}</Text>
                        <TextInput style={[styles.input, {marginTop:10}]} placeholder="Qty diambil" keyboardType="numeric" value={sourceSplitQty} onChangeText={setSourceSplitQty} />
                    </View>
                    <View style={{alignItems:'center', marginVertical:10}}><Feather name="arrow-down" size={24} color="#CBD5E1" /></View>
                    {splitTargets.map((t, idx) => (
                        <View key={t._tempId} style={styles.splitRow}>
                            <View style={[styles.pickerWrapper, {flex: 1, marginBottom:0}]}>
                                <Picker selectedValue={t.itemId} onValueChange={(val) => {
                                    const n = [...splitTargets]; n[idx].itemId = val; setSplitTargets(n);
                                }}>
                                    <Picker.Item label="Pilih Target..." value="" />
                                    {inventory.filter(i => i.id !== selectedItem?.id).map(i => <Picker.Item key={i.id} label={i.item_name} value={i.id.toString()} />)}
                                </Picker>
                            </View>
                            <TextInput style={[styles.input, {width: 70, marginLeft: 10, marginBottom:0}]} placeholder="Qty" keyboardType="numeric" value={t.qty} onChangeText={(v) => {
                                const n = [...splitTargets]; n[idx].qty = v; setSplitTargets(n);
                            }} />
                            <TouchableOpacity onPress={() => removeSplitRow(t._tempId)} style={{marginLeft:10}}><Feather name="minus-circle" size={20} color="#EF4444" /></TouchableOpacity>
                        </View>
                    ))}
                    <TouchableOpacity onPress={addSplitRow} style={styles.addSplitBtn}><Text style={{color:'#DC2626', fontWeight:'800', fontSize:12}}>+ TARGET BARU</Text></TouchableOpacity>
                    <TouchableOpacity style={[styles.primaryBtn, {marginTop:30}]} onPress={handleSplitProcess}><Text style={styles.btnText}>KONFIRMASI PECAH STOK</Text></TouchableOpacity>
                </ScrollView>
            </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { padding: 20, backgroundColor: '#FFF', flexDirection: 'row', gap: 10, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  searchBar: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6', borderRadius: 12, paddingHorizontal: 15, height: 45 },
  searchInput: { flex: 1, marginLeft: 10, fontSize: 14, outlineStyle: 'none' } as any,
  refreshBtn: { width: 45, height: 45, backgroundColor: '#64748B', borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  
  itemCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', padding: 18, borderRadius: 20, marginBottom: 12, borderWidth: 1, borderColor: '#E5E7EB', elevation: 2 },
  cardLow: { borderColor: '#FEE2E2', backgroundColor: '#FFF5F5' },
  iconCircle: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#F9FAFB', justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  itemName: { fontSize: 15, fontWeight: '700', color: '#1F2937' },
  itemPrice: { fontSize: 12, color: '#94A3B8' },
  itemQty: { fontSize: 16, fontWeight: '800', color: '#111827' },
  lowBadge: { fontSize: 9, fontWeight: '900', color: '#DC2626', marginTop: 4 },

  fab: { position: 'absolute', bottom: 30, right: 30, width: 60, height: 60, borderRadius: 20, backgroundColor: '#DC2626', justifyContent: 'center', alignItems: 'center', elevation: 5 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalOverlayMobile: { padding: 0 },
  modalContent: { backgroundColor: '#FFF', borderRadius: 28, padding: 30, width: '100%', maxHeight: '95%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: '900', color: '#111827' },
  modalSub: { color: '#DC2626', fontWeight: '800', textAlign: 'center', fontSize: 16, marginBottom: 25 },
  
  label: { fontSize: 11, fontWeight: '800', color: '#94A3B8', marginBottom: 8, textTransform: 'uppercase' },
  input: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, padding: 12, fontSize: 15, color: '#111827', marginBottom: 15 },
  row: { flexDirection: 'row' },
  pickerWrapper: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, height: 50, justifyContent: 'center', marginBottom: 15, overflow: 'hidden' },
  
  primaryBtn: { backgroundColor: '#DC2626', padding: 16, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: '#FFF', fontWeight: '900', fontSize: 14, letterSpacing: 0.5 },
  
  adjustBox: { backgroundColor: '#F9FAFB', padding: 15, borderRadius: 18, marginBottom: 20, borderWidth: 1, borderColor: '#E5E7EB' },
  currentStock: { fontSize: 26, fontWeight: '900', color: '#111827', marginTop: 2 },
  adjustRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  adjStepBtn: { width: 52, height: 52, borderRadius: 14, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E5E7EB', justifyContent: 'center', alignItems: 'center' },
  adjInput: { flex: 1, minWidth: 0, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 14, paddingVertical: 14, fontSize: 18, textAlign: 'center', color: '#111827', fontWeight: '800' },
  adjPreview: { fontSize: 13, color: '#64748B', marginTop: 10 },
  splitBtn: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 15, borderRadius: 14, borderWidth: 1, borderColor: '#FEE2E2', marginTop: 15, marginBottom: 10 },
  splitBtnText: { color: '#DC2626', fontWeight: '800', fontSize: 12 },
  deleteBtn: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 10, padding: 10 },

  sourceBox: { padding: 15, backgroundColor: '#F9FAFB', borderRadius: 15, borderWidth: 1, borderColor: '#E5E7EB' },
  splitRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  addSplitBtn: { padding: 12, alignItems: 'center', borderStyle: 'dashed', borderWidth: 1, borderColor: '#DC2626', borderRadius: 12, marginTop: 10 },
  switchRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, padding: 14, marginBottom: 15 },
  switchHint: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  poBadge: { fontSize: 9, fontWeight: '900', color: '#7C3AED', marginTop: 4 }
});