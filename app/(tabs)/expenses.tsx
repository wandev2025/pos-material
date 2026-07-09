import { Feather, Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Modal,
    Platform,
    RefreshControl,
    ScrollView,
    StatusBar,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { useProfile } from '../../lib/ProfileContext';
import { atLeast } from '../../lib/roles';
import { supabase } from '../../lib/supabase';
import { toast } from '../../lib/toast';

interface Expense {
  id: string;
  tanggal: string;
  jenis: string;
  judul: string;
  keterangan: string;
  quantity: number;
  biaya_satuan: number;
  total_pengeluaran: number;
  created_by: string;
}

const WEB_DATE_INPUT_STYLE = {
  padding: 12,
  borderRadius: 10,
  borderWidth: 1,
  borderColor: '#E2E8F0',
  backgroundColor: '#F8FAFC',
  fontSize: 14,
  fontFamily: 'inherit',
};

export default function ExpensesScreen() {
  const { profile } = useProfile();
  const isAdmin = atLeast(profile?.role, 'ADMIN');

  const [activeTab, setActiveTab] = useState<'input' | 'history'>('history');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  
  const [stickyDate, setStickyDate] = useState(new Date());
  const [editId, setEditId] = useState<string | null>(null);
  const categories = ['Gaji', 'Bulanan', 'Harian', 'Precedent', 'Lainnya'];
  
  const [form, setForm] = useState({
    jenis: 'Bulanan',
    judul: '',
    keterangan: '',
    qty: '1',
    biaya: '', 
    tanggal: stickyDate,
  });

  const [errors, setErrors] = useState<{ judul?: boolean; biaya?: boolean }>({});
  const [expandedDates, setExpandedDates] = useState<Record<string, boolean>>({});
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [search, setSearch] = useState('');

  const [startDate, setStartDate] = useState<Date | null>(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [endDate, setEndDate] = useState<Date | null>(new Date());
  
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportGroupByJenis, setExportGroupByJenis] = useState(false);
  const [exportStartDate, setExportStartDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [exportEndDate, setExportEndDate] = useState(new Date());

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pickerMode, setPickerMode] = useState<'form' | 'histStart' | 'histEnd' | 'expStart' | 'expEnd'>('form');

  useEffect(() => {
    loadData();
  }, [startDate, endDate]);

  async function loadData() {
    setLoading(true);
    try {
      let q = supabase.from('expenses').select('*').order('tanggal', { ascending: false });
      if (startDate) q = q.gte('tanggal', toDateStr(startDate));
      if (endDate) q = q.lte('tanggal', toDateStr(endDate));
      
      const { data, error } = await q;
      if (error) throw error;
      setExpenses(data || []);
    } catch (error: any) {
      toast.error('Gagal memuat data: ' + error.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  const formatCurrency = (val: string) => {
    const numeric = val.replace(/[^0-9]/g, '');
    if (!numeric) return '';
    return numeric.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  };

  const parseCurrency = (val: string) => {
    return parseFloat(val.replace(/\./g, '')) || 0;
  };

  const toDateStr = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const escapeHtml = (val: any) =>
    String(val ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const onDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    setShowDatePicker(false);
    if (!selectedDate) return;

    if (pickerMode === 'form') {
      setForm({ ...form, tanggal: selectedDate });
      setStickyDate(selectedDate);
    } else if (pickerMode === 'histStart') {
      setStartDate(selectedDate);
    } else if (pickerMode === 'histEnd') {
      setEndDate(selectedDate);
    } else if (pickerMode === 'expStart') {
      setExportStartDate(selectedDate);
    } else if (pickerMode === 'expEnd') {
      setExportEndDate(selectedDate);
    }
  };

  const handleEdit = (item: Expense) => {
    setEditId(item.id);
    setForm({
      jenis: item.jenis,
      judul: item.judul,
      keterangan: item.keterangan || '',
      qty: (item.quantity ?? 1).toString(),
      biaya: formatCurrency((item.biaya_satuan ?? 0).toString()),
      tanggal: new Date(item.tanggal),
    });
    setActiveTab('input');
  };

  const handleSubmit = async () => {
    const newErrors = { judul: !form.judul.trim(), biaya: !form.biaya };
    if (newErrors.judul || newErrors.biaya) {
      setErrors(newErrors);
      return Alert.alert('Lengkapi Data', 'Mohon isi kolom yang ditandai merah.');
    }
    const qty = parseFloat(form.qty) || 1;
    const unit = parseCurrency(form.biaya);
    const payload = {
      jenis: form.jenis,
      judul: form.judul,
      keterangan: form.keterangan,
      quantity: qty,
      biaya_satuan: unit,
      tanggal: toDateStr(form.tanggal),
      created_by: profile?.id,
    };

    setLoading(true);
    try {
      if (editId) {
        const { error } = await supabase.from('expenses').update(payload).eq('id', editId);
        if (error) throw error;
        toast.success('Data diperbarui');
      } else {
        const { error } = await supabase.from('expenses').insert([payload]);
        if (error) throw error;
        toast.success('Data disimpan');
      }
      loadData();
      resetForm();
      setActiveTab('history');
    } catch (err: any) {
      Alert.alert('Gagal', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = (id: string) => {
    Alert.alert('Hapus Data', 'Apakah Anda yakin?', [
      { text: 'Batal', style: 'cancel' },
      { text: 'Hapus', style: 'destructive', onPress: async () => {
        setLoading(true);
        await supabase.from('expenses').delete().eq('id', id);
        loadData();
      }}
    ]);
  };

  const resetForm = (fullReset = false) => {
    if (fullReset) setStickyDate(new Date());
    setEditId(null);
    setErrors({});
    setForm({
      jenis: 'Bulanan',
      judul: '',
      keterangan: '',
      qty: '1',
      biaya: '',
      tanggal: fullReset ? new Date() : stickyDate,
    });
  };

  const filteredExpenses = useMemo(() => {
    return expenses.filter((item) => {
      const matchCat = selectedCategory === 'All' ? true : item.jenis === selectedCategory;
      const matchSearch = item.judul?.toLowerCase().includes(search.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [expenses, selectedCategory, search]);

  const totalSpentHistory = filteredExpenses.reduce((acc, curr) => acc + (Number(curr.total_pengeluaran) || 0), 0);

  const groupedExpenses = useMemo(() => {
    const groups: Record<string, { items: Expense[], dailyTotal: number }> = {};
    filteredExpenses.forEach(item => {
      const dateStr = new Date(item.tanggal).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
      if (!groups[dateStr]) groups[dateStr] = { items: [], dailyTotal: 0 };
      groups[dateStr].items.push(item);
      groups[dateStr].dailyTotal += (Number(item.total_pengeluaran) || 0);
    });
    return groups;
  }, [filteredExpenses]);

  const generatePDF = async () => {
    toast.info("Fitur cetak sedang dikembangkan");
    setShowExportModal(false);
  };

  if (!isAdmin) return <View style={styles.center}><Text>Akses Diperlukan</Text></View>;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.header}>
        <View style={styles.tabToggle}>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'input' && styles.tabBtnActive]}
            onPress={() => setActiveTab('input')}
          >
            <Text style={[styles.tabText, activeTab === 'input' && styles.tabTextActive]}>INPUT DATA</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'history' && styles.tabBtnActive]}
            onPress={() => setActiveTab('history')}
          >
            <Text style={[styles.tabText, activeTab === 'history' && styles.tabTextActive]}>LAPORAN</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadData} />}>
        {loading ? (
            <ActivityIndicator color="#DC2626" size="large" style={{marginTop: 50}} />
        ) : activeTab === 'input' ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>{editId ? 'EDIT PENGELUARAN' : 'PENGELUARAN BARU'}</Text>
            
            <View style={styles.categoryContainer}>
              {categories.map((cat) => (
                <TouchableOpacity key={cat} onPress={() => setForm({ ...form, jenis: cat })} style={[styles.chip, form.jenis === cat && styles.chipActive]}>
                  <Text style={[styles.chipText, form.jenis === cat && styles.chipTextActive]}>{cat}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>TANGGAL TRANSAKSI</Text>
            {Platform.OS === 'web' ? (
               /* @ts-ignore */
              <input 
                type="date" value={toDateStr(form.tanggal)} style={{ ...WEB_DATE_INPUT_STYLE, marginBottom: 15 }}
                onChange={(e: any) => { if (!e.target.value) return; const d = new Date(e.target.value); setForm({...form, tanggal: d}); }}
              />
            ) : (
              <TouchableOpacity style={styles.inputDate} onPress={() => { setPickerMode('form'); setShowDatePicker(true); }}>
                <Feather name="calendar" size={16} color="#64748B" />
                <Text style={{marginLeft: 10}}>{form.tanggal.toLocaleDateString('id-ID')}</Text>
              </TouchableOpacity>
            )}

            <Text style={styles.label}>NAMA PENGELUARAN</Text>
            <TextInput style={[styles.input, errors.judul && styles.inputError]} placeholder="e.g. Listrik Kantor" value={form.judul} onChangeText={(t) => setForm({ ...form, judul: t })} />
            
            <Text style={styles.label}>KETERANGAN</Text>
            <TextInput style={[styles.input, {height: 80, textAlignVertical: 'top'}]} placeholder="Opsional..." value={form.keterangan} onChangeText={(t) => setForm({ ...form, keterangan: t })} multiline />

            <View style={styles.row}>
                <View style={{flex: 1}}>
                    <Text style={styles.label}>QTY</Text>
                    <TextInput style={styles.input} keyboardType="numeric" value={form.qty} onChangeText={(t) => setForm({ ...form, qty: t })} />
                </View>
                <View style={{flex: 2, marginLeft: 15}}>
                    <Text style={styles.label}>BIAYA SATUAN (RP)</Text>
                    <TextInput style={[styles.input, errors.biaya && styles.inputError]} keyboardType="numeric" placeholder="0" value={form.biaya} onChangeText={(t) => setForm({ ...form, biaya: formatCurrency(t) })} />
                </View>
            </View>

            <View style={styles.liveTotalBox}>
                <Text style={styles.liveTotalLabel}>TOTAL ESTIMASI:</Text>
                <Text style={styles.liveTotalValue}>Rp {((parseFloat(form.qty) || 0) * parseCurrency(form.biaya)).toLocaleString('id-ID')}</Text>
            </View>

            <TouchableOpacity style={styles.primaryBtn} onPress={handleSubmit}>
              <Text style={styles.primaryBtnText}>{editId ? 'UPDATE DATA' : 'SIMPAN TRANSAKSI'}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancelBtn} onPress={() => resetForm(true)}>
              <Text style={styles.cancelBtnText}>{editId ? 'BATAL' : 'HAPUS FORM'}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View>
            <LinearGradient colors={['#0F172A', '#334155']} style={styles.summaryCard}>
              <View style={styles.rowBetween}>
                 <Text style={styles.summaryTitle}>TOTAL PENGELUARAN</Text>
                 <TouchableOpacity onPress={() => setShowExportModal(true)}>
                    <Ionicons name="print-outline" size={20} color="#FFF" />
                 </TouchableOpacity>
              </View>
              <Text style={styles.summaryAmount}>Rp {totalSpentHistory.toLocaleString('id-ID')}</Text>
              <Text style={styles.summarySub}>{filteredExpenses.length} transaksi dalam periode ini</Text>
            </LinearGradient>

            <View style={styles.card}>
                <View style={styles.searchBar}>
                    <Feather name="search" size={16} color="#94A3B8" />
                    <TextInput style={styles.searchInput} placeholder="Cari pengeluaran..." value={search} onChangeText={setSearch} />
                </View>

                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginTop: 10}}>
                    {['All', ...categories].map((cat) => (
                    <TouchableOpacity key={cat} onPress={() => setSelectedCategory(cat)} style={[styles.filterChip, selectedCategory === cat && styles.filterChipActive]}>
                        <Text style={[styles.filterChipText, selectedCategory === cat && styles.filterChipTextActive]}>{cat}</Text>
                    </TouchableOpacity>
                    ))}
                </ScrollView>
            </View>

            {Object.keys(groupedExpenses).length > 0 ? Object.keys(groupedExpenses).map((date) => (
                <View key={date} style={{marginBottom: 15}}>
                    <TouchableOpacity 
                      style={styles.dateHeader}
                      onPress={() => setExpandedDates({...expandedDates, [date]: !expandedDates[date]})}
                    >
                        <View style={{flex: 1}}>
                            <Text style={styles.dateLabel}>{date}</Text>
                            <Text style={styles.dateSub}>{groupedExpenses[date].items.length} item</Text>
                        </View>
                        <Text style={styles.dateTotal}>Rp {groupedExpenses[date].dailyTotal.toLocaleString('id-ID')}</Text>
                        <Ionicons name={expandedDates[date] ? "chevron-up" : "chevron-down"} size={16} color="#94A3B8" style={{marginLeft: 10}} />
                    </TouchableOpacity>

                    {expandedDates[date] && groupedExpenses[date].items.map((item) => (
                        <View key={item.id} style={styles.itemRow}>
                            <View style={{flex: 1}}>
                                <Text style={styles.itemTitle}>{item.judul}</Text>
                                <Text style={styles.itemMeta}>{item.jenis} • {item.quantity} unit</Text>
                            </View>
                            <View style={{alignItems: 'flex-end'}}>
                                <Text style={styles.itemAmount}>Rp {(Number(item.total_pengeluaran) || 0).toLocaleString('id-ID')}</Text>
                                <View style={styles.itemActions}>
                                    <TouchableOpacity onPress={() => handleEdit(item)}><Feather name="edit-2" size={14} color="#64748B" /></TouchableOpacity>
                                    <TouchableOpacity onPress={() => handleDelete(item.id)}><Feather name="trash-2" size={14} color="#DC2626" /></TouchableOpacity>
                                </View>
                            </View>
                        </View>
                    ))}
                </View>
            )) : (
              <View style={styles.emptyContainer}>
                <Feather name="info" size={40} color="#CBD5E1" />
                <Text style={styles.emptyText}>Tidak ada data pengeluaran.</Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      <Modal visible={showExportModal} transparent animationType="fade">
          <View style={styles.overlay}>
              <View style={styles.modalCard}>
                  <Text style={styles.modalTitle}>Cetak Laporan</Text>
                  <Text style={styles.label}>PILIH PERIODE</Text>
                  <View style={styles.row}>
                      <View style={{flex: 1}}>
                        <TextInput 
                          style={styles.input} 
                          placeholder="Mulai" 
                          onFocus={() => { setPickerMode('expStart'); setShowDatePicker(true); }} 
                          value={toDateStr(exportStartDate)} 
                        />
                      </View>
                      <View style={{flex: 1, marginLeft: 10}}>
                        <TextInput 
                          style={styles.input} 
                          placeholder="Selesai" 
                          onFocus={() => { setPickerMode('expEnd'); setShowDatePicker(true); }} 
                          value={toDateStr(exportEndDate)} 
                        />
                      </View>
                  </View>
                  <View style={styles.rowBetween}>
                      <Text style={styles.label}>GABUNG PER KATEGORI</Text>
                      <Switch value={exportGroupByJenis} onValueChange={setExportGroupByJenis} trackColor={{true: '#DC2626'}} />
                  </View>
                  <TouchableOpacity style={[styles.primaryBtn, {marginTop: 20}]} onPress={generatePDF}>
                    <Text style={styles.primaryBtnText}>EXPORT PDF</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={{marginTop: 15, alignSelf: 'center'}} onPress={() => setShowExportModal(false)}>
                    <Text style={{color: '#94A3B8', fontWeight: 'bold'}}>BATAL</Text>
                  </TouchableOpacity>
              </View>
          </View>
      </Modal>

      {showDatePicker && Platform.OS !== 'web' && (
        <DateTimePicker value={new Date()} mode="date" display="default" onChange={onDateChange} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FEF2F2' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { backgroundColor: '#FFF', padding: 15, borderBottomWidth: 1, borderBottomColor: '#FEE2E2' },
  tabToggle: { flexDirection: 'row', backgroundColor: '#FEF2F2', borderRadius: 12, padding: 4 },
  tabBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  tabBtnActive: { backgroundColor: '#0F172A' },
  tabText: { fontWeight: 'bold', color: '#94A3B8', fontSize: 13 },
  tabTextActive: { color: '#FFF' },
  scrollContent: { padding: 15 },
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
  sectionTitle: { fontSize: 12, fontWeight: '900', color: '#94A3B8', marginBottom: 15, letterSpacing: 1.2 },
  label: { fontSize: 10, fontWeight: '800', color: '#64748B', marginBottom: 6, marginTop: 10 },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: '#0F172A',
  },
  inputDate: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#F8FAFC', 
    borderWidth: 1, 
    borderColor: '#E2E8F0', 
    borderRadius: 10, 
    padding: 12 
  },
  inputError: { borderColor: '#DC2626' },
  primaryBtn: { backgroundColor: '#DC2626', padding: 16, borderRadius: 12, alignItems: 'center' },
  primaryBtnText: { color: '#FFF', fontWeight: '900', fontSize: 14 },
  cancelBtn: { padding: 15, alignItems: 'center' },
  cancelBtnText: { color: '#94A3B8', fontWeight: '700' },
  row: { flexDirection: 'row' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  categoryContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 5 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: '#F1F5F9' },
  chipActive: { backgroundColor: '#0F172A' },
  chipText: { fontSize: 11, fontWeight: '700', color: '#64748B' },
  chipTextActive: { color: '#FFF' },
  liveTotalBox: { 
    backgroundColor: '#FEF2F2', 
    padding: 15, 
    borderRadius: 12, 
    borderLeftWidth: 4, 
    borderLeftColor: '#DC2626', 
    marginVertical: 20 
  },
  liveTotalLabel: { fontSize: 9, fontWeight: '800', color: '#DC2626' },
  liveTotalValue: { fontSize: 20, fontWeight: '900', color: '#0F172A', marginTop: 2 },
  summaryCard: { padding: 22, borderRadius: 20, marginBottom: 15 },
  summaryTitle: { color: '#FEE2E2', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  summaryAmount: { color: '#FFF', fontSize: 28, fontWeight: '900', marginTop: 5 },
  summarySub: { color: '#94A3B8', fontSize: 11, marginTop: 5 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  searchInput: { flex: 1, marginLeft: 10, fontSize: 14 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: '#FFF', marginRight: 8, borderWidth: 1, borderColor: '#FEE2E2' },
  filterChipActive: { backgroundColor: '#DC2626', borderColor: '#DC2626' },
  filterChipText: { color: '#64748B', fontWeight: '700', fontSize: 11 },
  filterChipTextActive: { color: '#FFF' },
  dateHeader: { 
    backgroundColor: '#FFF', 
    padding: 16, 
    borderRadius: 12, 
    flexDirection: 'row', 
    alignItems: 'center', 
    borderWidth: 1, 
    borderColor: '#FEE2E2', 
    marginBottom: 2 
  },
  dateLabel: { fontSize: 14, fontWeight: '800', color: '#0F172A' },
  dateSub: { fontSize: 10, color: '#94A3B8' },
  dateTotal: { fontSize: 14, fontWeight: '900', color: '#DC2626' },
  itemRow: { 
    backgroundColor: '#FFF', 
    padding: 14, 
    marginLeft: 10, 
    borderBottomWidth: 1, 
    borderBottomColor: '#F8FAFC', 
    flexDirection: 'row', 
    alignItems: 'center' 
  },
  itemTitle: { fontSize: 13, fontWeight: '700', color: '#1E293B' },
  itemMeta: { fontSize: 10, color: '#94A3B8' },
  itemAmount: { fontSize: 13, fontWeight: '800', color: '#0F172A' },
  itemActions: { flexDirection: 'row', gap: 15, marginTop: 5 },
  overlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.6)', justifyContent: 'center', padding: 20 },
  modalCard: { backgroundColor: '#FFF', borderRadius: 20, padding: 25 },
  modalTitle: { fontSize: 18, fontWeight: '900', color: '#0F172A', marginBottom: 15, textAlign: 'center' },
  emptyContainer: { padding: 50, alignItems: 'center' },
  emptyText: { color: '#94A3B8', marginTop: 10, fontWeight: '600' }
});