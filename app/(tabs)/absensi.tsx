import { Feather, Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
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
import { useProfile } from '../../lib/ProfileContext';
import { supabase } from '../../lib/supabase';
import { toast } from '../../lib/toast';

interface Worker {
  id: string;
  name: string;
  daily_salary: number;
}

interface Attendance {
  id: string;
  worker_id: string;
  tanggal: string;
  is_paid: boolean;
}

interface UnpaidSummary {
  worker_id: string;
  name: string;
  unpaid_count: number;
  total_debt: number;
}

export default function AbsensiScreen() {
  const { profile } = useProfile();
  const { width } = useWindowDimensions();
  const isDesktop = width > 900;

  const [activeTab, setActiveTab] = useState<'absensi' | 'tukang'>('absensi');
  const [loading, setLoading] = useState(true);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [unpaidSummaries, setUnpaidSummaries] = useState<UnpaidSummary[]>([]);

  // Form Tukang
  const [workerName, setWorkerName] = useState('');
  const [workerSalary, setWorkerSalary] = useState('');
  const [editWorkerId, setEditWorkerId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [selectedDate]);

  async function loadData() {
    setLoading(true);
    try {
      const [workerRes, attRes, unpaidRes] = await Promise.all([
        supabase.from('workers').select('*').order('name'),
        supabase.from('attendance').select('*').eq('tanggal', selectedDate),
        supabase.from('attendance').select('*, workers(name, daily_salary)').eq('is_paid', false)
      ]);

      setWorkers(workerRes.data || []);
      setAttendance(attRes.data || []);

      const summaryMap: Record<string, UnpaidSummary> = {};
      (unpaidRes.data || []).forEach((item: any) => {
        const wId = item.worker_id;
        if (!summaryMap[wId]) {
          summaryMap[wId] = { 
            worker_id: wId, 
            name: item.workers.name, 
            unpaid_count: 0, 
            total_debt: 0 
          };
        }
        summaryMap[wId].unpaid_count += 1;
        summaryMap[wId].total_debt += Number(item.workers.daily_salary);
      });
      setUnpaidSummaries(Object.values(summaryMap));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function saveWorker() {
    if (!workerName || !workerSalary) return toast.error("Isi nama dan gaji");
    const payload = { name: workerName, daily_salary: parseNum(workerSalary) };
    try {
      if (editWorkerId) {
        await supabase.from('workers').update(payload).eq('id', editWorkerId);
        toast.success("Data tukang diperbarui");
      } else {
        await supabase.from('workers').insert([payload]);
        toast.success("Tukang baru ditambahkan");
      }
      setWorkerName(''); setWorkerSalary(''); setEditWorkerId(null);
      loadData();
    } catch (e) { toast.error("Gagal simpan"); }
  }

  async function toggleAttendance(workerId: string) {
    const existing = attendance.find(a => a.worker_id === workerId);
    try {
      if (existing) {
        if (existing.is_paid) return toast.error("Sudah dibayar, tidak bisa dihapus");
        await supabase.from('attendance').delete().eq('worker_id', workerId).eq('tanggal', selectedDate);
      } else {
        await supabase.from('attendance').insert([{ worker_id: workerId, tanggal: selectedDate }]);
      }
      loadData();
    } catch (e) { toast.error("Gagal update"); }
  }

  async function processPayroll(workerId?: string) {
    setLoading(true);
    try {
      let query = supabase.from('attendance').select('*, workers(name, daily_salary)').eq('is_paid', false);
      if (workerId) query = query.eq('worker_id', workerId);
      
      const { data: unpaid } = await query;

      if (!unpaid || unpaid.length === 0) {
        setLoading(false);
        return toast.error("Tidak ada piutang gaji");
      }

      const payrollMap: Record<string, { name: string, days: string[], total: number, ids: string[] }> = {};
      unpaid.forEach((item: any) => {
        const wId = item.worker_id;
        const formattedDate = new Date(item.tanggal).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
        if (!payrollMap[wId]) payrollMap[wId] = { name: item.workers.name, days: [], total: 0, ids: [] };
        payrollMap[wId].days.push(formattedDate);
        payrollMap[wId].total += Number(item.workers.daily_salary);
        payrollMap[wId].ids.push(item.id);
      });

      for (const wId in payrollMap) {
        const p = payrollMap[wId];
        const keterangan = `Gaji: ${p.days.join(', ')}`;
        
        const { error: expErr } = await supabase.from('expenses').insert([{
          jenis: 'Gaji',
          judul: `Gaji Tukang: ${p.name}`,
          keterangan,
          biaya_satuan: p.total,
          quantity: 1,
          tanggal: new Date().toISOString().split('T')[0],
          created_by: profile?.id
        }]);

        if (expErr) throw expErr;
        await supabase.from('attendance').update({ is_paid: true }).in('id', p.ids);
      }

      toast.success("Pembayaran berhasil dikirim ke Pengeluaran");
      loadData();
    } catch (e) { 
      console.error(e);
      toast.error("Gagal memproses pembayaran");
    } finally { 
      setLoading(false); 
    }
  }

  const renderAttendance = () => (
    <View style={styles.pane}>
      <Text style={styles.paneTitle}>LOG ABSENSI HARIAN</Text>
      <View style={styles.rowBetween}>
        {Platform.OS === 'web' ? (
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            style={{ padding: 10, borderRadius: 10, border: '1px solid #E2E8F0', backgroundColor: '#F8FAFC', outline: 'none', width: '100%' }}
          />
        ) : (
          <TextInput value={selectedDate} onChangeText={setSelectedDate} style={styles.dateInput} placeholder="YYYY-MM-DD" />
        )}
      </View>
      
      <ScrollView style={{marginTop: 10}}>
        {workers.map(w => {
          const att = attendance.find(a => a.worker_id === w.id);
          return (
            <TouchableOpacity 
              key={w.id} 
              style={[styles.attCard, att && styles.attCardActive]} 
              onPress={() => toggleAttendance(w.id)}
            >
              <View style={{flex: 1}}>
                <Text style={[styles.workerName, att && {color: '#FFF'}]}>{w.name}</Text>
                <Text style={[styles.workerSub, att && {color: '#FEE2E2'}]}>{formatRupiah(w.daily_salary)} / hari</Text>
              </View>
              {att?.is_paid ? (
                <View style={styles.paidBadge}><Text style={styles.paidBadgeText}>LUNAS</Text></View>
              ) : (
                <Ionicons name={att ? "checkmark-circle" : "ellipse-outline"} size={28} color={att ? "#FFF" : "#CBD5E1"} />
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );

  const renderSummary = () => (
    <View style={styles.pane}>
      <Text style={styles.paneTitle}>PIUTANG GAJI (AKUMULASI)</Text>
      {unpaidSummaries.length === 0 ? (
        <View style={styles.emptyBox}><Text style={styles.emptyText}>Semua gaji tukang sudah lunas.</Text></View>
      ) : (
        <ScrollView style={{maxHeight: 300}}>
          {unpaidSummaries.map(s => (
            <View key={s.worker_id} style={styles.summaryCard}>
              <View style={{flex: 1}}>
                <Text style={styles.sName}>{s.name}</Text>
                <Text style={styles.sDetail}>{s.unpaid_count} Hari belum dibayar</Text>
              </View>
              <View style={{alignItems: 'flex-end'}}>
                <Text style={styles.sAmount}>{formatRupiah(s.total_debt)}</Text>
                <TouchableOpacity onPress={() => processPayroll(s.worker_id)}>
                  <Text style={styles.payLink}>BAYAR SEKARANG</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
          
          <TouchableOpacity style={styles.payAllBtn} onPress={() => processPayroll()}>
            <LinearGradient colors={['#0F172A', '#334155']} style={styles.payAllGradient}>
               <Text style={styles.payAllText}>BAYAR SEMUA TUKANG ({formatRupiah(unpaidSummaries.reduce((a,b) => a + b.total_debt, 0))})</Text>
            </LinearGradient>
          </TouchableOpacity>
        </ScrollView>
      )}

      <Text style={[styles.paneTitle, {marginTop: 30}]}>MANAJEMEN TUKANG</Text>
      <View style={styles.form}>
        <TextInput placeholder="Nama Tukang" style={styles.input} value={workerName} onChangeText={setWorkerName} />
        <TextInput placeholder="Gaji/Hari" style={styles.input} keyboardType="numeric" value={workerSalary} onChangeText={setWorkerSalary} />
        <TouchableOpacity style={styles.addBtn} onPress={saveWorker}>
          <Text style={styles.addBtnText}>{editWorkerId ? 'UPDATE DATA' : 'TAMBAH TUKANG'}</Text>
        </TouchableOpacity>
      </View>
      
      {workers.map(w => (
        <View key={w.id} style={styles.workerListRow}>
          <Text style={styles.wNameText}>{w.name} ({formatRupiah(w.daily_salary)})</Text>
          <View style={{flexDirection: 'row', gap: 15}}>
             <TouchableOpacity onPress={() => {setEditWorkerId(w.id); setWorkerName(w.name); setWorkerSalary(w.daily_salary.toString());}}><Feather name="edit-2" size={16} color="#64748B" /></TouchableOpacity>
             <TouchableOpacity onPress={async () => { await supabase.from('workers').delete().eq('id', w.id); loadData(); }}><Feather name="trash-2" size={16} color="#DC2626" /></TouchableOpacity>
          </View>
        </View>
      ))}
    </View>
  );

  return (
    <View style={styles.container}>
      {loading && <ActivityIndicator style={styles.loader} color="#DC2626" />}
      
      {isDesktop ? (
        <View style={styles.splitView}>
          <View style={{ flex: 1 }}>{renderAttendance()}</View>
          <View style={{ width: 1, backgroundColor: '#E2E8F0', marginVertical: 20 }} />
          <View style={{ flex: 1.2 }}>{renderSummary()}</View>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{paddingBottom: 40}}>
          {renderAttendance()}
          <View style={{height: 20}} />
          {renderSummary()}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF' },
  loader: { position: 'absolute', top: 20, right: 20, zIndex: 10 },
  splitView: { flexDirection: 'row', flex: 1 },
  pane: { flex: 1, padding: 20 },
  paneTitle: { fontSize: 10, fontWeight: '900', color: '#94A3B8', marginBottom: 15, letterSpacing: 1.5 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dateInput: { backgroundColor: '#F8FAFC', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0', flex: 1 },
  attCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', padding: 16, borderRadius: 15, marginBottom: 8, borderWidth: 1, borderColor: '#F1F5F9' },
  attCardActive: { backgroundColor: '#DC2626', borderColor: '#DC2626' },
  workerName: { fontSize: 14, fontWeight: '700', color: '#1E293B' },
  workerSub: { fontSize: 11, color: '#64748B' },
  paidBadge: { backgroundColor: '#16A34A', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  paidBadgeText: { color: '#FFF', fontSize: 10, fontWeight: '900' },
  summaryCard: { flexDirection: 'row', backgroundColor: '#F8FAFC', padding: 16, borderRadius: 14, marginBottom: 10, borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center' },
  sName: { fontWeight: '800', color: '#0F172A' },
  sDetail: { fontSize: 11, color: '#64748B' },
  sAmount: { fontWeight: '900', color: '#DC2626', fontSize: 15 },
  payLink: { fontSize: 10, fontWeight: '900', color: '#16A34A', marginTop: 4 },
  payAllBtn: { marginTop: 15 },
  payAllGradient: { padding: 16, borderRadius: 12, alignItems: 'center' },
  payAllText: { color: '#FFF', fontWeight: '900', fontSize: 12 },
  form: { gap: 10, marginBottom: 20 },
  input: { backgroundColor: '#F8FAFC', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0' },
  addBtn: { backgroundColor: '#0F172A', padding: 14, borderRadius: 10, alignItems: 'center' },
  addBtnText: { color: '#FFF', fontWeight: '800', fontSize: 12 },
  workerListRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  wNameText: { fontSize: 13, color: '#475569', fontWeight: '600' },
  emptyBox: { padding: 20, backgroundColor: '#F0FDF4', borderRadius: 10 },
  emptyText: { color: '#166534', fontWeight: '700', fontSize: 12, textAlign: 'center' }
});