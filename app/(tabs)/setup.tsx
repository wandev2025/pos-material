import { useProfile } from '@/lib/ProfileContext';
import { supabase } from '@/lib/supabase';
import { Feather } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert,
  Platform,
  ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity, useWindowDimensions, View
} from 'react-native';

// --- TYPES ---
type TabType = 'INFO' | 'PRINTERS' | 'METRICS' | 'PAYMENT';

interface SystemPrinter {
  name: string;
}

interface Metric {
  id: number;
  unit_name: string;
}

interface PaymentMethod {
  id: number;
  name: string;
}

const BRIDGE_URL = 'http://localhost:3001';

export default function SetupScreen() {
  const { profile } = useProfile();
  const { width } = useWindowDimensions();
  const isDesktop = width > 900;
  
  const [activeTab, setActiveTab] = useState<TabType>('INFO');
  const [loading, setLoading] = useState(false);
  const [bridgeStatus, setBridgeStatus] = useState<'OFFLINE' | 'ONLINE'>('OFFLINE');
  
  // Data States
  const [systemPrinters, setSystemPrinters] = useState<SystemPrinter[]>([]);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [payments, setPayments] = useState<PaymentMethod[]>([]);
  
  const [settings, setSettings] = useState({
    shop_name: '', shop_address: '', shop_phone: '',
    thermal_footer: '', invoice_footer: '', do_footer: '',
    thermal_printer_name: '', invoice_printer_name: '', do_printer_name: ''
  });

  // Form States
  const [newUnit, setNewUnit] = useState('');
  const [newPayment, setNewPayment] = useState('');

  useEffect(() => { 
    if (profile?.role === 'OWNER') {
        loadAllData();
        const interval = setInterval(checkBridge, 5000);
        return () => clearInterval(interval);
    }
  }, [profile]);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const { data: s } = await supabase.from('print_settings').select('*').eq('id', 1).single();
      const { data: m } = await supabase.from('metrics').select('*').order('unit_name');
      const { data: p } = await supabase.from('payment_methods').select('*').order('name');
      
      if (s) setSettings(s);
      if (m) setMetrics(m);
      if (p) setPayments(p);
      checkBridge();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const checkBridge = async () => {
    try {
      const res = await fetch(`${BRIDGE_URL}/list`);
      const data = await res.json();
      setSystemPrinters(data);
      setBridgeStatus('ONLINE');
    } catch (e) {
      setBridgeStatus('OFFLINE');
    }
  };

  const handleSave = async () => {
    setLoading(true);
    const { error } = await supabase.from('print_settings').update(settings).eq('id', 1);
    setLoading(false);
    if (!error) Alert.alert("Sukses", "Pengaturan disimpan");
    else Alert.alert("Error", error.message);
  };

  // --- ACTIONS ---
  const addMetric = async () => {
    if (!newUnit.trim()) return;
    await supabase.from('metrics').insert([{ unit_name: newUnit.toLowerCase() }]);
    setNewUnit(''); loadAllData();
  };

  const addPayment = async () => {
    if (!newPayment.trim()) return;
    await supabase.from('payment_methods').insert([{ name: newPayment }]);
    setNewPayment(''); loadAllData();
  };

  const deleteItem = async (table: string, id: number) => {
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (!error) loadAllData();
  };

  const downloadDriver = () => {
    const driverCode = `@echo off
echo Initializing POS Printer Driver...
if not exist "node_modules" (
  call npm init -y
  call npm install express cors pdf-to-printer
)
echo Driver is ONLINE. Keep this window open.
node -e "const express=require('express');const cors=require('cors');const ptp=require('pdf-to-printer');const app=express();app.use(cors());app.use(express.json());app.get('/list', async (req, res) => { try { const p = await ptp.getPrinters(); res.json(p); } catch (e) { res.status(500).send(e); } }); app.post('/print', async (req, res) => { try { await ptp.print(req.body.url, { printer: req.body.printer }); res.sendStatus(200); } catch (e) { res.status(500).send(e); } }); app.listen(3001);"`;

    if (Platform.OS === 'web') {
      const element = document.createElement("a");
      const file = new Blob([driverCode], {type: 'text/plain'});
      element.href = URL.createObjectURL(file);
      element.download = "POS-Driver.bat";
      document.body.appendChild(element);
      element.click();
    }
  };

  if (profile?.role !== 'OWNER') return <View style={styles.center}><Text>Akses Owner Diperlukan</Text></View>;

  return (
    <View style={[styles.container, isDesktop && styles.row]}>
      {/* SIDEBAR */}
      <View style={[styles.subSidebar, isDesktop ? {width: 260} : {width: '100%'}]}>
        <Text style={styles.subHeader}>PENGATURAN</Text>
        <SubBtn id="INFO" label="Toko & Footer" icon="edit" active={activeTab} set={setActiveTab} />
        <SubBtn id="PRINTERS" label="Printer (Hardware)" icon="printer" active={activeTab} set={setActiveTab} />
        <SubBtn id="METRICS" label="Satuan (Unit)" icon="box" active={activeTab} set={setActiveTab} />
        <SubBtn id="PAYMENT" label="Metode Bayar" icon="credit-card" active={activeTab} set={setActiveTab} />
      </View>

      <ScrollView style={styles.content}>
        {loading && <ActivityIndicator color="#DC2626" style={{marginBottom: 20}} />}

        {/* TAB: INFO */}
        {activeTab === 'INFO' && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Profil Toko</Text>
            <Text style={styles.label}>Nama Bisnis</Text>
            <TextInput style={styles.input} value={settings.shop_name} onChangeText={t => setSettings({...settings, shop_name: t})} />
            <Text style={styles.label}>Alamat Operasional</Text>
            <TextInput style={styles.input} value={settings.shop_address} onChangeText={t => setSettings({...settings, shop_address: t})} />
            <Text style={styles.label}>Telepon / WA</Text>
            <TextInput style={styles.input} value={settings.shop_phone} onChangeText={t => setSettings({...settings, shop_phone: t})} keyboardType="phone-pad" />
            <Text style={styles.label}>Pesan Struk (Footer Thermal)</Text>
            <TextInput style={styles.input} value={settings.thermal_footer} onChangeText={t => setSettings({...settings, thermal_footer: t})} />
            <Text style={styles.label}>Catatan Faktur</Text>
            <TextInput style={styles.input} value={settings.invoice_footer} onChangeText={t => setSettings({...settings, invoice_footer: t})} />
            <Text style={styles.label}>Catatan Surat Jalan (DO)</Text>
            <TextInput style={styles.input} value={settings.do_footer} onChangeText={t => setSettings({...settings, do_footer: t})} />
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave}><Text style={styles.btnText}>UPDATE IDENTITAS</Text></TouchableOpacity>
          </View>
        )}

        {/* TAB: PRINTERS */}
        {activeTab === 'PRINTERS' && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Hardware & Silent Print</Text>
            
            {bridgeStatus === 'OFFLINE' ? (
              <View style={styles.statusBoxError}>
                <Text style={styles.statusText}>Driver Tidak Terdeteksi</Text>
                <TouchableOpacity style={styles.downloadBtn} onPress={downloadDriver}>
                    <Feather name="download" size={16} color="#FFF" />
                    <Text style={styles.downloadBtnText}>Download Driver (.bat)</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.statusBoxSuccess}>
                <Feather name="check-circle" size={18} color="#059669" />
                <Text style={styles.statusTextSuccess}>Driver Terhubung</Text>
              </View>
            )}

            <View style={{marginTop: 20}}>
                <PrinterList 
                    label="Printer Struk (Thermal)" 
                    selected={settings.thermal_printer_name} 
                    list={systemPrinters}
                    onSelect={(name: string) => setSettings({...settings, thermal_printer_name: name})}
                />
                
                <PrinterList 
                    label="Printer Faktur / DO (Dot Matrix)" 
                    selected={settings.invoice_printer_name} 
                    list={systemPrinters}
                    onSelect={(name: string) => setSettings({...settings, invoice_printer_name: name})}
                />
            </View>

            <TouchableOpacity style={styles.saveBtn} onPress={handleSave}><Text style={styles.btnText}>SIMPAN MAPPING</Text></TouchableOpacity>
          </View>
        )}

        {/* TAB: METRICS & PAYMENT */}
        {(activeTab === 'METRICS' || activeTab === 'PAYMENT') && (
            <View style={styles.card}>
                <Text style={styles.cardTitle}>{activeTab === 'METRICS' ? 'Manajemen Satuan' : 'Metode Pembayaran'}</Text>
                <View style={styles.row}>
                    <TextInput 
                        style={[styles.input, {flex: 1, marginBottom: 0}]} 
                        placeholder={activeTab === 'METRICS' ? "Contoh: Pcs, Box, Kg" : "Contoh: Tunai, BCA"} 
                        value={activeTab === 'METRICS' ? newUnit : newPayment} 
                        onChangeText={activeTab === 'METRICS' ? setNewUnit : setNewPayment} 
                    />
                    <TouchableOpacity style={styles.darkBtn} onPress={activeTab === 'METRICS' ? addMetric : addPayment}>
                        <Text style={styles.btnText}>Tambah</Text>
                    </TouchableOpacity>
                </View>
                <View style={{marginTop: 20}}>
                    {(activeTab === 'METRICS' ? metrics : payments).map((item: any) => (
                        <View key={item.id} style={styles.listRow}>
                            <Text style={{fontWeight:'700', color: '#334155'}}>{(activeTab === 'METRICS' ? item.unit_name : item.name).toUpperCase()}</Text>
                            <TouchableOpacity onPress={() => deleteItem(activeTab === 'METRICS' ? 'metrics' : 'payment_methods', item.id)}>
                                <Feather name="trash-2" size={16} color="#DC2626"/>
                            </TouchableOpacity>
                        </View>
                    ))}
                </View>
            </View>
        )}
      </ScrollView>
    </View>
  );
}

// --- SUB COMPONENTS (Fixed TS Errors) ---
interface PrinterListProps {
    label: string;
    selected: string;
    list: SystemPrinter[];
    onSelect: (name: string) => void;
}

function PrinterList({ label, selected, list, onSelect }: PrinterListProps) {
    return (
        <View style={{marginBottom: 20}}>
            <Text style={styles.label}>{label}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{flexDirection: 'row', marginTop: 5}}>
                <TouchableOpacity onPress={() => onSelect('')} style={[styles.chip, !selected && styles.chipActive]}>
                    <Text style={!selected ? styles.chipTextActive : styles.chipText}>None</Text>
                </TouchableOpacity>
                {list.map((p: SystemPrinter) => (
                    <TouchableOpacity key={p.name} onPress={() => onSelect(p.name)} style={[styles.chip, selected === p.name && styles.chipActive]}>
                        <Text style={selected === p.name ? styles.chipTextActive : styles.chipText}>{p.name}</Text>
                    </TouchableOpacity>
                ))}
            </ScrollView>
        </View>
    );
}

function SubBtn({ id, label, icon, active, set }: {id: TabType, label: string, icon: any, active: string, set: (id: TabType) => void}) {
    const isActive = active === id;
    return (
        <TouchableOpacity style={[styles.subBtn, isActive && styles.subBtnActive]} onPress={() => set(id)}>
            <Feather name={icon} size={18} color={isActive ? '#DC2626' : '#64748B'} />
            <Text style={[styles.subLabel, isActive && styles.subLabelActive]}>{label}</Text>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  row: { flexDirection: 'row' },
  subSidebar: { backgroundColor: '#FFF', borderRightWidth: 1, borderRightColor: '#E2E8F0', padding: 20 },
  subHeader: { fontSize: 10, fontWeight: '900', color: '#94A3B8', marginBottom: 20, letterSpacing: 1.5 },
  subBtn: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, marginBottom: 5 },
  subBtnActive: { backgroundColor: '#FEF2F2' },
  subLabel: { marginLeft: 12, fontWeight: '700', color: '#64748B' },
  subLabelActive: { color: '#DC2626' },
  content: { flex: 1, padding: 25 },
  card: { backgroundColor: '#FFF', padding: 30, borderRadius: 20, maxWidth: 600, alignSelf: 'center', width: '100%' },
  cardTitle: { fontSize: 18, fontWeight: '800', marginBottom: 20 },
  label: { fontSize: 11, fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase' },
  input: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, padding: 14, marginBottom: 20 },
  saveBtn: { backgroundColor: '#1E293B', padding: 18, borderRadius: 12, alignItems: 'center' },
  btnText: { color: '#FFF', fontWeight: '800' },
  darkBtn: { backgroundColor: '#1E293B', paddingHorizontal: 20, borderRadius: 10, marginLeft: 10, justifyContent: 'center' },
  statusBoxError: { backgroundColor: '#FEF2F2', padding: 20, borderRadius: 12, alignItems: 'center' },
  statusBoxSuccess: { backgroundColor: '#F0FDF4', padding: 15, borderRadius: 12, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10 },
  statusText: { color: '#991B1B', fontWeight: '700', marginBottom: 15 },
  statusTextSuccess: { color: '#166534', fontWeight: '700' },
  downloadBtn: { backgroundColor: '#DC2626', flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 8, gap: 10 },
  downloadBtnText: { color: '#FFF', fontWeight: '700', fontSize: 13 },
  chip: { paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F1F5F9', marginRight: 8, borderWidth: 1, borderColor: '#E2E8F0' },
  chipActive: { backgroundColor: '#DC2626', borderColor: '#DC2626' },
  chipText: { fontSize: 12, color: '#475569' },
  chipTextActive: { color: '#FFF', fontWeight: '700' },
  listRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 16, backgroundColor: '#F8FAFC', borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: '#E2E8F0' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});