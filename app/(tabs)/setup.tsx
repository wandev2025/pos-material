import { Feather } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
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
import { useProfile } from '@/lib/ProfileContext';
import { clearPairedDevice, getPairedDevice } from '@/lib/printerStore';
import type { DocConfig, DocType, PaperProfile, PrintConfig, TransportId } from '@/lib/printing';
import {
  DEFAULT_PRINT_CONFIG,
  listAgentPrinters,
  pairWebSerial,
  pairWebUsb,
  pingAgent,
  printDocument,
} from '@/lib/printing';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';

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

// Order shown in the Method picker. Every field below is editable so the owner
// can swap printer / paper / transport entirely from this screen, no code change.
const METHOD_OPTIONS: TransportId[] = ['WEBUSB', 'WEBSERIAL', 'AGENT', 'KIOSK', 'DIALOG'];
const PAPER_OPTIONS: { id: PaperProfile; label: string }[] = [
  { id: '58mm', label: '58mm' },
  { id: '76mm', label: '76mm (Bixolon SRP-275III)' },
  { id: '80mm', label: '80mm thermal' },
];
const cloneDefaultConfig = (): PrintConfig => JSON.parse(JSON.stringify(DEFAULT_PRINT_CONFIG));

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
    shop_name: '',
    shop_address: '',
    shop_phone: '',
    thermal_footer: '',
    invoice_footer: '',
    do_footer: '',
    print_config: cloneDefaultConfig(),
  });

  // Machine-local paired WebUSB / WebSerial devices (for display + forget).
  const [pairedDevices, setPairedDevices] = useState<{ WEBUSB: string | null; WEBSERIAL: string | null }>({
    WEBUSB: null,
    WEBSERIAL: null,
  });

  // The local agent is only relevant when a document is mapped to it.
  const usesAgent = useMemo(
    () => Object.values(settings.print_config).some(c => c.transport === 'AGENT'),
    [settings.print_config]
  );

  // Form States
  const [newUnit, setNewUnit] = useState('');
  const [newPayment, setNewPayment] = useState('');

  useEffect(() => {
    if (profile?.role === 'OWNER' || profile?.role === 'SUPERADMIN') {
      loadAllData();
      refreshPaired();
    }
  }, [profile]);

  // Only poll the local agent when a document actually uses it AND we're on the
  // Printers tab. Otherwise we'd hammer :3001 with refused connections.
  useEffect(() => {
    const isManager = profile?.role === 'OWNER' || profile?.role === 'SUPERADMIN';
    if (!isManager || activeTab !== 'PRINTERS' || !usesAgent) {
      setBridgeStatus('OFFLINE');
      return;
    }
    checkBridge();
    const interval = setInterval(checkBridge, 8000);
    return () => clearInterval(interval);
  }, [profile, activeTab, usesAgent]);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const { data: s } = await supabase.from('print_settings').select('*').eq('id', 1).single();
      const { data: m } = await supabase.from('metrics').select('*').order('unit_name');
      const { data: p } = await supabase.from('payment_methods').select('*').order('name');

      // Pick only the fields the UI manages; seed print_config from the default
      // when the row predates the migration. (Legacy *_printer_name columns are
      // intentionally dropped here — print_config supersedes them.)
      if (s)
        setSettings({
          shop_name: s.shop_name ?? '',
          shop_address: s.shop_address ?? '',
          shop_phone: s.shop_phone ?? '',
          thermal_footer: s.thermal_footer ?? '',
          invoice_footer: s.invoice_footer ?? '',
          do_footer: s.do_footer ?? '',
          print_config: s.print_config ?? cloneDefaultConfig(),
        });
      if (m) setMetrics(m);
      if (p) setPayments(p);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const checkBridge = async () => {
    const online = await pingAgent();
    setBridgeStatus(online ? 'ONLINE' : 'OFFLINE');
    if (online) setSystemPrinters(await listAgentPrinters());
  };

  const refreshPaired = async () => {
    const [usb, serial] = await Promise.all([getPairedDevice('WEBUSB'), getPairedDevice('WEBSERIAL')]);
    setPairedDevices({ WEBUSB: usb, WEBSERIAL: serial });
  };

  // Updates one document's transport / printer / paper inside print_config.
  const updateDocConfig = (doc: DocType, patch: Partial<DocConfig>) => {
    setSettings(prev => {
      const base = prev.print_config ?? cloneDefaultConfig();
      return { ...prev, print_config: { ...base, [doc]: { ...base[doc], ...patch } } };
    });
  };

  // Pair / forget must run from a real user gesture (handled by the button onPress).
  const handlePair = async (kind: 'WEBUSB' | 'WEBSERIAL') => {
    const serial = kind === 'WEBUSB' ? await pairWebUsb() : await pairWebSerial();
    if (serial) toast.success(`Printer terhubung: ${serial}`);
    else toast.error('Pemasangan dibatalkan atau tidak didukung di perangkat ini (butuh Chrome/Edge).');
    refreshPaired();
  };

  const handleForget = async (kind: 'WEBUSB' | 'WEBSERIAL') => {
    await clearPairedDevice(kind);
    refreshPaired();
  };

  // Quick verification after swapping hardware: prints a tiny dummy document.
  const handleTestPrint = async (doc: DocType) => {
    const config = settings.print_config ?? cloneDefaultConfig();
    const dummySale = {
      id: 0,
      total_amount: 25000,
      customer_name: 'TEST PRINT',
      created_at: new Date().toISOString(),
      payment_method: 'Tunai',
      status: 'PAID',
      down_payment: 25000,
      employee_name: profile?.full_name || 'Staff',
    };
    const dummyItems = [
      { item_name: 'Test Item A', quantity: 1, price_at_sale: 10000 },
      { item_name: 'Test Item B', quantity: 3, price_at_sale: 5000 },
    ];
    const result = await printDocument({ docType: doc, settings, sale: dummySale, items: dummyItems, config });
    if (!result.ok) toast.error('Tidak ada metode cetak yang tersedia.');
  };

  const handleSave = async () => {
    setLoading(true);
    const { error } = await supabase.from('print_settings').update(settings).eq('id', 1);
    setLoading(false);
    if (!error) toast.success('Pengaturan disimpan');
    else toast.error(error.message);
  };

  // --- ACTIONS ---
  const addMetric = async () => {
    if (!newUnit.trim()) return;
    await supabase.from('metrics').insert([{ unit_name: newUnit.toLowerCase() }]);
    setNewUnit('');
    loadAllData();
  };

  const addPayment = async () => {
    if (!newPayment.trim()) return;
    await supabase.from('payment_methods').insert([{ name: newPayment }]);
    setNewPayment('');
    loadAllData();
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
      const element = document.createElement('a');
      const file = new Blob([driverCode], { type: 'text/plain' });
      element.href = URL.createObjectURL(file);
      element.download = 'POS-Driver.bat';
      document.body.appendChild(element);
      element.click();
    }
  };

  // One fully-editable config row per document type. Swapping printer / paper /
  // transport here writes to print_settings.print_config — no code change needed.
  const renderDocConfig = (doc: DocType, title: string, allowPaper: boolean) => {
    const cfg = (settings.print_config ?? cloneDefaultConfig())[doc];
    const isPaired = cfg.transport === 'WEBUSB' || cfg.transport === 'WEBSERIAL';
    return (
      <View style={styles.docCard} key={doc}>
        <Text style={styles.docTitle}>{title}</Text>

        <Text style={styles.label}>Metode</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexDirection: 'row', marginTop: 5, marginBottom: 14 }}
        >
          {METHOD_OPTIONS.map(m => (
            <TouchableOpacity
              key={m}
              onPress={() => updateDocConfig(doc, { transport: m })}
              style={[styles.chip, cfg.transport === m && styles.chipActive]}
            >
              <Text style={cfg.transport === m ? styles.chipTextActive : styles.chipText}>{m}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {cfg.transport === 'AGENT' && (
          <PrinterList
            label="Pilih Printer (Agent)"
            selected={cfg.printer || ''}
            list={systemPrinters}
            onSelect={(name: string) => updateDocConfig(doc, { printer: name })}
          />
        )}

        {isPaired && (
          <View style={{ marginBottom: 16 }}>
            <Text style={styles.label}>Perangkat Terpasang</Text>
            <Text style={styles.pairedText}>
              {pairedDevices[cfg.transport as 'WEBUSB' | 'WEBSERIAL'] || 'Belum ada perangkat'}
            </Text>
            <View style={styles.row}>
              <TouchableOpacity
                style={styles.pairBtn}
                onPress={() => handlePair(cfg.transport as 'WEBUSB' | 'WEBSERIAL')}
              >
                <Feather name="link" size={14} color="#FFF" />
                <Text style={styles.pairBtnText}>Pasang Printer</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.forgetBtn}
                onPress={() => handleForget(cfg.transport as 'WEBUSB' | 'WEBSERIAL')}
              >
                <Feather name="x-circle" size={14} color="#DC2626" />
                <Text style={styles.forgetBtnText}>Lupakan</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {allowPaper && (
          <View style={{ marginBottom: 16 }}>
            <Text style={styles.label}>Ukuran Kertas</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ flexDirection: 'row', marginTop: 5 }}
            >
              {PAPER_OPTIONS.map(p => {
                const active = (cfg.paper || '76mm') === p.id;
                return (
                  <TouchableOpacity
                    key={p.id}
                    onPress={() => updateDocConfig(doc, { paper: p.id })}
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <Text style={active ? styles.chipTextActive : styles.chipText}>{p.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        <TouchableOpacity style={styles.testBtn} onPress={() => handleTestPrint(doc)}>
          <Feather name="printer" size={14} color="#1E293B" />
          <Text style={styles.testBtnText}>Test Print</Text>
        </TouchableOpacity>
      </View>
    );
  };

  if (profile?.role !== 'OWNER' && profile?.role !== 'SUPERADMIN')
    return (
      <View style={styles.center}>
        <Text>Akses Owner Diperlukan</Text>
      </View>
    );

  return (
    <View style={[styles.container, isDesktop && styles.row]}>
      {/* SIDEBAR */}
      <View style={[styles.subSidebar, isDesktop ? { width: 260 } : { width: '100%' }]}>
        <Text style={styles.subHeader}>PENGATURAN</Text>
        <SubBtn id="INFO" label="Toko & Footer" icon="edit" active={activeTab} set={setActiveTab} />
        <SubBtn id="PRINTERS" label="Printer (Hardware)" icon="printer" active={activeTab} set={setActiveTab} />
        <SubBtn id="METRICS" label="Satuan (Unit)" icon="box" active={activeTab} set={setActiveTab} />
        <SubBtn id="PAYMENT" label="Metode Bayar" icon="credit-card" active={activeTab} set={setActiveTab} />
      </View>

      <ScrollView
        style={[styles.content, !isDesktop && styles.contentMobile]}
        contentContainerStyle={!isDesktop ? { paddingBottom: 120 } : undefined}
      >
        {loading && <ActivityIndicator color="#DC2626" style={{ marginBottom: 20 }} />}

        {/* TAB: INFO */}
        {activeTab === 'INFO' && (
          <View style={[styles.card, !isDesktop && styles.cardMobile]}>
            <Text style={styles.cardTitle}>Profil Toko</Text>
            <Text style={styles.label}>Nama Bisnis</Text>
            <TextInput
              style={styles.input}
              value={settings.shop_name}
              onChangeText={t => setSettings({ ...settings, shop_name: t })}
            />
            <Text style={styles.label}>Alamat Operasional</Text>
            <TextInput
              style={styles.input}
              value={settings.shop_address}
              onChangeText={t => setSettings({ ...settings, shop_address: t })}
            />
            <Text style={styles.label}>Telepon / WA</Text>
            <TextInput
              style={styles.input}
              value={settings.shop_phone}
              onChangeText={t => setSettings({ ...settings, shop_phone: t })}
              keyboardType="phone-pad"
            />
            <Text style={styles.label}>Pesan Struk (Footer Thermal)</Text>
            <TextInput
              style={styles.input}
              value={settings.thermal_footer}
              onChangeText={t => setSettings({ ...settings, thermal_footer: t })}
            />
            <Text style={styles.label}>Catatan Faktur</Text>
            <TextInput
              style={styles.input}
              value={settings.invoice_footer}
              onChangeText={t => setSettings({ ...settings, invoice_footer: t })}
            />
            <Text style={styles.label}>Catatan Surat Jalan (DO)</Text>
            <TextInput
              style={styles.input}
              value={settings.do_footer}
              onChangeText={t => setSettings({ ...settings, do_footer: t })}
            />
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
              <Text style={styles.btnText}>UPDATE IDENTITAS</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* TAB: PRINTERS */}
        {activeTab === 'PRINTERS' && (
          <View style={[styles.card, !isDesktop && styles.cardMobile]}>
            <Text style={styles.cardTitle}>Hardware & Silent Print</Text>

            {/* Agent status only matters when a document is mapped to the AGENT method. */}
            {usesAgent &&
              (bridgeStatus === 'OFFLINE' ? (
                <View style={styles.statusBoxError}>
                  <Text style={styles.statusText}>Driver Tidak Terdeteksi</Text>
                  <TouchableOpacity style={styles.downloadBtn} onPress={downloadDriver}>
                    <Feather name="download" size={16} color="#FFF" />
                    <Text style={styles.downloadBtnText}>Download Driver (.bat)</Text>
                  </TouchableOpacity>
                  <Text style={styles.noteText}>
                    Disarankan menjalankan agent dari folder agent/ (lebih stabil daripada .bat ini).
                  </Text>
                </View>
              ) : (
                <View style={styles.statusBoxSuccess}>
                  <Feather name="check-circle" size={18} color="#059669" />
                  <Text style={styles.statusTextSuccess}>Driver Terhubung</Text>
                </View>
              ))}

            <View style={{ marginTop: 20 }}>
              {renderDocConfig('THERMAL', 'Struk / Thermal', true)}
              {renderDocConfig('FAKTUR', 'Faktur', false)}
              {renderDocConfig('DO', 'Surat Jalan (DO)', false)}
            </View>

            <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
              <Text style={styles.btnText}>SIMPAN MAPPING</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* TAB: METRICS & PAYMENT */}
        {(activeTab === 'METRICS' || activeTab === 'PAYMENT') && (
          <View style={[styles.card, !isDesktop && styles.cardMobile]}>
            <Text style={styles.cardTitle}>{activeTab === 'METRICS' ? 'Manajemen Satuan' : 'Metode Pembayaran'}</Text>
            <View style={styles.row}>
              <TextInput
                style={[styles.input, { flex: 1, marginBottom: 0 }]}
                placeholder={activeTab === 'METRICS' ? 'Contoh: Pcs, Box, Kg' : 'Contoh: Tunai, BCA'}
                value={activeTab === 'METRICS' ? newUnit : newPayment}
                onChangeText={activeTab === 'METRICS' ? setNewUnit : setNewPayment}
              />
              <TouchableOpacity style={styles.darkBtn} onPress={activeTab === 'METRICS' ? addMetric : addPayment}>
                <Text style={styles.btnText}>Tambah</Text>
              </TouchableOpacity>
            </View>
            <View style={{ marginTop: 20 }}>
              {(activeTab === 'METRICS' ? metrics : payments).map((item: any) => (
                <View key={item.id} style={styles.listRow}>
                  <Text style={{ fontWeight: '700', color: '#334155' }}>
                    {(activeTab === 'METRICS' ? item.unit_name : item.name).toUpperCase()}
                  </Text>
                  <TouchableOpacity
                    onPress={() => deleteItem(activeTab === 'METRICS' ? 'metrics' : 'payment_methods', item.id)}
                  >
                    <Feather name="trash-2" size={16} color="#DC2626" />
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
    <View style={{ marginBottom: 20 }}>
      <Text style={styles.label}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: 'row', marginTop: 5 }}>
        <TouchableOpacity onPress={() => onSelect('')} style={[styles.chip, !selected && styles.chipActive]}>
          <Text style={!selected ? styles.chipTextActive : styles.chipText}>None</Text>
        </TouchableOpacity>
        {list.map((p: SystemPrinter) => (
          <TouchableOpacity
            key={p.name}
            onPress={() => onSelect(p.name)}
            style={[styles.chip, selected === p.name && styles.chipActive]}
          >
            <Text style={selected === p.name ? styles.chipTextActive : styles.chipText}>{p.name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

function SubBtn({
  id,
  label,
  icon,
  active,
  set,
}: {
  id: TabType;
  label: string;
  icon: any;
  active: string;
  set: (id: TabType) => void;
}) {
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
  contentMobile: { padding: 14 },
  card: { backgroundColor: '#FFF', padding: 30, borderRadius: 20, maxWidth: 600, alignSelf: 'center', width: '100%' },
  cardMobile: { padding: 18 },
  cardTitle: { fontSize: 18, fontWeight: '800', marginBottom: 20 },
  label: { fontSize: 11, fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase' },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 14,
    marginBottom: 20,
  },
  saveBtn: { backgroundColor: '#1E293B', padding: 18, borderRadius: 12, alignItems: 'center' },
  btnText: { color: '#FFF', fontWeight: '800' },
  darkBtn: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 20,
    borderRadius: 10,
    marginLeft: 10,
    justifyContent: 'center',
  },
  statusBoxError: { backgroundColor: '#FEF2F2', padding: 20, borderRadius: 12, alignItems: 'center' },
  statusBoxSuccess: {
    backgroundColor: '#F0FDF4',
    padding: 15,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  statusText: { color: '#991B1B', fontWeight: '700', marginBottom: 15 },
  statusTextSuccess: { color: '#166534', fontWeight: '700' },
  downloadBtn: {
    backgroundColor: '#DC2626',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    gap: 10,
  },
  downloadBtnText: { color: '#FFF', fontWeight: '700', fontSize: 13 },
  noteText: { color: '#991B1B', fontSize: 11, marginTop: 12, textAlign: 'center' },
  docCard: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 18,
    marginBottom: 16,
  },
  docTitle: { fontSize: 14, fontWeight: '800', color: '#1E293B', marginBottom: 14 },
  pairedText: { fontSize: 13, fontWeight: '600', color: '#334155', marginTop: 4, marginBottom: 10 },
  pairBtn: {
    backgroundColor: '#1E293B',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 8,
  },
  pairBtnText: { color: '#FFF', fontWeight: '700', fontSize: 12 },
  forgetBtn: {
    backgroundColor: '#FEF2F2',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 8,
    marginLeft: 10,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  forgetBtnText: { color: '#DC2626', fontWeight: '700', fontSize: 12 },
  testBtn: {
    backgroundColor: '#E2E8F0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  testBtnText: { color: '#1E293B', fontWeight: '700', fontSize: 13 },
  chip: {
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  chipActive: { backgroundColor: '#DC2626', borderColor: '#DC2626' },
  chipText: { fontSize: 12, color: '#475569' },
  chipTextActive: { color: '#FFF', fontWeight: '700' },
  listRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
