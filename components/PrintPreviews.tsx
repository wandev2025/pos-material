import { StyleSheet, Text, View } from 'react-native';

interface PrintSettings {
  shop_name: string;
  shop_address: string;
  shop_phone: string;
  thermal_footer: string;
  invoice_footer: string;
  do_footer: string;
}

export const ThermalPreview = ({ settings }: { settings: PrintSettings }) => (
  <View style={styles.thermalPaper}>
    <Text style={styles.thermalBrand}>{settings.shop_name || 'NAMA TOKO'}</Text>
    <Text style={styles.thermalAddress}>{settings.shop_address || 'Alamat Toko'}</Text>
    <Text style={styles.thermalAddress}>Telp: {settings.shop_phone || '-'}</Text>
    <Text style={styles.thermalDash}>--------------------------------</Text>
    <View style={styles.thermalRow}>
      <Text style={styles.thermalTxt}>2x Semen Tiga Roda</Text>
      <Text style={styles.thermalTxt}>130.000</Text>
    </View>
    <View style={styles.thermalRow}>
      <Text style={styles.thermalTxt}>1x Pasir Beton</Text>
      <Text style={styles.thermalTxt}>250.000</Text>
    </View>
    <Text style={styles.thermalDash}>--------------------------------</Text>
    <View style={styles.thermalRow}>
      <Text style={[styles.thermalTxt, { fontWeight: 'bold' }]}>TOTAL</Text>
      <Text style={[styles.thermalTxt, { fontWeight: 'bold' }]}>380.000</Text>
    </View>
    <Text style={[styles.thermalFooter, { marginTop: 15 }]}>{settings.thermal_footer || 'Terima Kasih'}</Text>
  </View>
);

export const InvoicePreview = ({ settings }: { settings: PrintSettings }) => (
  <View style={styles.dotMatrixPaper}>
    <View style={styles.docHeader}>
      <View style={{ flex: 1 }}>
        <Text style={styles.docBrand}>{settings.shop_name || 'NAMA TOKO'}</Text>
        <Text style={styles.docAddress}>{settings.shop_address || 'Alamat Toko'}</Text>
        <Text style={styles.docAddress}>WA: {settings.shop_phone || '-'}</Text>
      </View>
      <View style={{ flex: 1, alignItems: 'flex-end' }}>
        <Text style={[styles.docType, { color: '#1E40AF' }]}>FAKTUR</Text>
        <View style={styles.metaBox}>
          <View style={styles.metaRow}>
            <Text style={styles.metaL}>No. Faktur</Text>
            <Text style={styles.metaV}>: INV24001</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaL}>Tanggal</Text>
            <Text style={styles.metaV}>: 20/05/2024</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaL}>Kepada</Text>
            <Text style={styles.metaV}>: Toko Sejahtera</Text>
          </View>
        </View>
      </View>
    </View>
    <View style={styles.tableBordered}>
      <View style={styles.tableH}>
        <Text style={[styles.cell, { flex: 0.5 }]}>No</Text>
        <Text style={[styles.cell, { flex: 3 }]}>Nama Barang</Text>
        <Text style={[styles.cell, { flex: 1, textAlign: 'center' }]}>Qty</Text>
        <Text style={[styles.cell, { flex: 1.5, textAlign: 'right' }]}>Harga</Text>
        <Text style={[styles.cell, { flex: 1.5, textAlign: 'right' }]}>Subtotal</Text>
      </View>
      <View style={styles.tableR}>
        <Text style={[styles.cell, { flex: 0.5 }]}>1</Text>
        <Text style={[styles.cell, { flex: 3 }]}>Cat Tembok Avitex 5kg - Putih</Text>
        <Text style={[styles.cell, { flex: 1, textAlign: 'center' }]}>5 Galon</Text>
        <Text style={[styles.cell, { flex: 1.5, textAlign: 'right' }]}>145.000</Text>
        <Text style={[styles.cell, { flex: 1.5, textAlign: 'right' }]}>725.000</Text>
      </View>
    </View>
    <View style={styles.docBottomSection}>
      <View style={{ flex: 1.5 }}>
        <Text style={styles.docFooterNote}>Ket: {settings.invoice_footer}</Text>
      </View>
      <View style={{ flex: 1, alignItems: 'flex-end' }}>
        <View style={styles.summaryRow}>
          <Text style={styles.sumL}>Total</Text>
          <Text style={styles.sumV}>725.000</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.sumL}>Bayar</Text>
          <Text style={styles.sumV}>725.000</Text>
        </View>
      </View>
    </View>
    <View style={styles.signatureRow}>
      <SignArea title="Penerima" />
      <SignArea title="Gudang" />
      <SignArea title="Hormat Kami" />
    </View>
  </View>
);

export const DeliveryOrderPreview = ({ settings }: { settings: PrintSettings }) => (
  <View style={[styles.dotMatrixPaper, { borderColor: '#059669' }]}>
    <>
      <View style={styles.docHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.docBrand}>{settings.shop_name}</Text>
          <Text style={styles.docAddress}>{settings.shop_address}</Text>
        </View>
        <View style={{ flex: 1, alignItems: 'flex-end' }}>
          <Text style={[styles.docType, { color: '#059669' }]}>SURAT JALAN</Text>
          <Text style={styles.metaV}>No: DO/24/0001</Text>
          <Text style={styles.metaV}>Tgl: 15/06/2024</Text>
        </View>
      </View>
      <View style={styles.tableBordered}>
        <View style={[styles.tableH, { backgroundColor: '#F0FDF4' }]}>
          <Text style={[styles.cell, { flex: 0.5 }]}>No</Text>
          <Text style={[styles.cell, { flex: 4 }]}>Deskripsi Barang</Text>
          <Text style={[styles.cell, { flex: 1.5, textAlign: 'center' }]}>Jumlah</Text>
          <Text style={[styles.cell, { flex: 2, textAlign: 'center' }]}>Satuan</Text>
        </View>
        <View style={styles.tableR}>
          <Text style={[styles.cell, { flex: 0.5 }]}>1</Text>
          <Text style={[styles.cell, { flex: 4 }]}>Semen Tiga Roda 50kg</Text>
          <Text style={[styles.cell, { flex: 1.5, textAlign: 'center' }]}>50</Text>
          <Text style={[styles.cell, { flex: 2, textAlign: 'center' }]}>SAK</Text>
        </View>
      </View>
      <View style={styles.docBottomSection}>
        <Text style={styles.docFooterNote}>Catatan Sopir: {settings.do_footer}</Text>
      </View>
      <View style={styles.signatureRow}>
        <SignArea title="Penerima" />
        <SignArea title="Sopir" />
        <SignArea title="Gudang" />
      </View>
    </>
  </View>
);

const SignArea = ({ title }: { title: string }) => (
  <View style={styles.signArea}>
    <Text style={styles.signTitle}>{title}</Text>
    <View style={styles.signLine} />
  </View>
);

const styles = StyleSheet.create({
  thermalPaper: {
    width: 300,
    backgroundColor: '#FFF',
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    elevation: 5,
  },
  thermalBrand: { textAlign: 'center', fontSize: 18, fontWeight: '900', color: '#000' },
  thermalAddress: { textAlign: 'center', fontSize: 11, color: '#333' },
  thermalDash: { textAlign: 'center', marginVertical: 10, letterSpacing: 1 },
  thermalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  thermalTxt: { fontSize: 12, color: '#000' },
  thermalFooter: { textAlign: 'center', fontSize: 11, fontStyle: 'italic' },
  dotMatrixPaper: {
    width: 750,
    minHeight: 450,
    backgroundColor: '#FFF',
    padding: 40,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    elevation: 5,
  },
  docHeader: {
    flexDirection: 'row',
    borderBottomWidth: 2,
    borderBottomColor: '#1E293B',
    paddingBottom: 20,
    marginBottom: 20,
  },
  docBrand: { fontSize: 22, fontWeight: '900', color: '#1E293B' },
  docAddress: { fontSize: 12, color: '#475569', marginTop: 2 },
  docType: { fontSize: 28, fontWeight: '900', letterSpacing: 2 },
  metaBox: { marginTop: 10 },
  metaRow: { flexDirection: 'row', marginBottom: 2 },
  metaL: { width: 80, fontSize: 11, fontWeight: '700', color: '#64748B' },
  metaV: { fontSize: 11, fontWeight: '700', color: '#1E293B' },
  tableBordered: { borderWidth: 1, borderColor: '#1E293B' },
  tableH: { flexDirection: 'row', backgroundColor: '#F8FAFC', borderBottomWidth: 1, borderBottomColor: '#1E293B' },
  tableR: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#E2E8F0', minHeight: 100 },
  cell: { padding: 10, fontSize: 12, color: '#1E293B', fontWeight: '600' },
  docBottomSection: { flexDirection: 'row', marginTop: 15 },
  docFooterNote: { fontSize: 11, fontStyle: 'italic', color: '#64748B' },
  summaryRow: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 5 },
  sumL: { width: 80, fontSize: 12, fontWeight: '700' },
  sumV: { width: 100, textAlign: 'right', fontSize: 14, fontWeight: '900' },
  signatureRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 40 },
  signArea: { width: 150, alignItems: 'center' },
  signTitle: { fontSize: 12, fontWeight: '700', marginBottom: 50 },
  signLine: { width: '100%', height: 1, backgroundColor: '#000' },
});
