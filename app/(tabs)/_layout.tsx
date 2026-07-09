import { Feather } from '@expo/vector-icons';
import { Tabs, usePathname, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Image // Added Image import
  ,




  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View
} from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  LinearTransition,
  SlideInDown,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AccountMenu from '../../components/AccountMenu';
import PressableScale from '../../components/PressableScale';
import { useProfile } from '../../lib/ProfileContext';
import { atLeast } from '../../lib/roles';
import { supabase } from '../../lib/supabase';

// --- NAVIGATION CONFIG ---
const PRIMARY_NAV = [
  { route: '/', path: '/', icon: 'home', label: 'Beranda' },
  { route: '/inventory', path: '/inventory', icon: 'package', label: 'Stok' },
  { route: '/pos', path: '/pos', icon: 'shopping-cart', label: 'POS' },
  { route: '/kasir', path: '/kasir', icon: 'dollar-sign', label: 'Tutup' },
];

const SECONDARY_NAV = [
  { route: '/laporan', path: '/laporan', icon: 'bar-chart-2', label: 'Laporan', tier: 'OWNER' },
  { route: '/expenses', path: '/expenses', icon: 'credit-card', label: 'Pengeluaran', tier: 'ADMIN' },
  { route: '/absensi', path: '/absensi', icon: 'check-square', label: 'Absensi', tier: 'ADMIN' },
  { route: '/setup', path: '/setup', icon: 'settings', label: 'Setup', tier: 'ADMIN' },
  { route: '/users', path: '/users', icon: 'users', label: 'Pengguna', tier: 'OWNER' },
  { route: '/pembelian', path: '/pembelian', icon: 'truck', label: 'Pembelian', tier: 'ADMIN' },
  { route: '/pelanggan', path: '/pelanggan', icon: 'user-check', label: 'Pelanggan', tier: 'ADMIN' },
  { route: '/retur', path: '/retur', icon: 'corner-up-left', label: 'Retur', tier: 'OWNER' },
] as const;

export default function TabLayout() {
  const { width } = useWindowDimensions();
  const { profile } = useProfile();
  const router = useRouter();
  const pathname = usePathname();

  const isWeb = width > 768;
  const isManager = profile?.role === 'OWNER' || profile?.role === 'SUPERADMIN';
  const isAdmin = atLeast(profile?.role, 'ADMIN');

  const [collapsed, setCollapsed] = useState(false);

  if (isWeb) {
    return (
      <View style={styles.webContainer}>
        <View style={[styles.sidebar, { width: collapsed ? 85 : 260 }]}>
          <View style={[styles.brandContainer, collapsed && { justifyContent: 'center' }]}>
            {/* LOGO IMAGE SECTION FIXED */}
            <View style={[styles.logoBox, { backgroundColor: 'transparent' }]}>
              <Image 
                source={require('../../assets/images/LOGO_TJ.png')} 
                style={{ width: 60, height: 60 }} 
                resizeMode="contain"
              />
            </View>
            {!collapsed && <Text style={styles.brandName}>POS TANJUNG JATI</Text>}
          </View>

          <TouchableOpacity style={styles.toggleBtn} onPress={() => setCollapsed(!collapsed)}>
            <Feather name={collapsed ? 'chevron-right' : 'chevron-left'} size={14} color="#9CA3AF" />
          </TouchableOpacity>

          <ScrollView showsVerticalScrollIndicator={false} style={styles.menuWrapper}>
            <SidebarSection label="MENU UTAMA" collapsed={collapsed} />
            <SidebarItem icon="home" label="Beranda" active={pathname === '/'} collapsed={collapsed} onPress={() => router.push('/')} />
            <SidebarItem icon="package" label="Stok Barang" active={pathname === '/inventory'} collapsed={collapsed} onPress={() => router.push('/inventory')} />
            <SidebarItem icon="shopping-cart" label="Input Pesanan" active={pathname === '/pos'} collapsed={collapsed} onPress={() => router.push('/pos')} />

            <SidebarSection label="OPERASIONAL" collapsed={collapsed} marginTop={25} />
            <SidebarItem icon="dollar-sign" label="Tutup Kasir" active={pathname === '/kasir'} collapsed={collapsed} onPress={() => router.push('/kasir')} />
            {isAdmin && (
              <>
                <SidebarItem icon="truck" label="Pembelian" active={pathname === '/pembelian'} collapsed={collapsed} onPress={() => router.push('/pembelian')} />
                <SidebarItem icon="check-square" label="Absensi" active={pathname === '/absensi'} collapsed={collapsed} onPress={() => router.push('/absensi')} />
              </>
            )}
            {isManager && <SidebarItem icon="corner-up-left" label="Retur" active={pathname === '/retur'} collapsed={collapsed} onPress={() => router.push('/retur')} />}

            {isAdmin && (
              <>
                <SidebarSection label="ADMINISTRASI" collapsed={collapsed} marginTop={25} />
                <SidebarItem icon="credit-card" label="Pengeluaran" active={pathname === '/expenses'} collapsed={collapsed} onPress={() => router.push('/expenses')} />
                <SidebarItem icon="user-check" label="Pelanggan" active={pathname === '/pelanggan'} collapsed={collapsed} onPress={() => router.push('/pelanggan')} />
                {isManager && (
                  <>
                    <SidebarItem icon="bar-chart-2" label="Laporan" collapsed={collapsed} active={pathname === '/laporan'} onPress={() => router.push('/laporan')} />
                    <SidebarItem icon="users" label="Pengguna" active={pathname === '/users'} collapsed={collapsed} onPress={() => router.push('/users')} />
                  </>
                )}
                <SidebarItem icon="settings" label="Setup Sistem" active={pathname === '/setup'} collapsed={collapsed} onPress={() => router.push('/setup')} />
              </>
            )}
          </ScrollView>

          <View style={styles.sidebarFooter}><AccountMenu collapsed={collapsed} /></View>
        </View>
        <View style={styles.webContent}><Tabs screenOptions={{ headerShown: false, tabBarStyle: { display: 'none' } }} /></View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerStyle: { backgroundColor: '#FFF', borderBottomColor: '#F3F4F6', borderBottomWidth: 1 },
          headerTitleStyle: { fontWeight: '900', color: '#111827', fontSize: 18 },
          tabBarStyle: { display: 'none' },
          animation: 'fade',
        }}
      >
        <Tabs.Screen name="index" />
        <Tabs.Screen name="inventory" />
        <Tabs.Screen name="pos" />
        <Tabs.Screen name="absensi" />
        <Tabs.Screen name="expenses" />
        <Tabs.Screen name="setup" />
        <Tabs.Screen name="users" />
        <Tabs.Screen name="laporan" />
        <Tabs.Screen name="kasir" />
        <Tabs.Screen name="pembelian" />
        <Tabs.Screen name="pelanggan" />
        <Tabs.Screen name="retur" />
      </Tabs>
      <FloatingTabBar />
    </View>
  );
}

function SidebarSection({ label, collapsed, marginTop = 0 }: any) {
  return <Text style={[styles.sidebarSection, { marginTop }, collapsed && { textAlign: 'center', fontSize: 8 }]}>{collapsed ? '---' : label}</Text>;
}

function SidebarItem({ icon, label, active, onPress, collapsed }: any) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.sidebarItem, active && styles.sidebarItemActive, collapsed && { justifyContent: 'center' }]} activeOpacity={0.7}>
      <Feather name={icon} size={20} color={active ? '#DC2626' : '#64748B'} />
      {!collapsed && <Text style={[styles.sidebarLabel, active && styles.sidebarLabelActive]}>{label}</Text>}
      {active && !collapsed && <View style={styles.activeIndicator} />}
    </TouchableOpacity>
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function TabButton({ item, active, onPress }: { item: any; active: boolean; onPress: () => void }) {
  const scale = useSharedValue(1);
  const aStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={() => { scale.value = withTiming(0.9, { duration: 110 }); }}
      onPressOut={() => { scale.value = withTiming(1, { duration: 150 }); }}
      layout={LinearTransition.duration(140)}
      style={[tabStyles.tab, active && tabStyles.tabActive, aStyle]}
    >
      <Feather name={item.icon as any} size={20} color={active ? '#FFF' : '#64748B'} />
      {active && <Animated.Text entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)} style={tabStyles.tabLabel} numberOfLines={1}>{item.label}</Animated.Text>}
    </AnimatedPressable>
  );
}

function FloatingTabBar() {
  const router = useRouter();
  const pathname = usePathname();
  const { profile } = useProfile();
  const insets = useSafeAreaInsets();
  const [moreOpen, setMoreOpen] = useState(false);

  const go = (route: string) => { setMoreOpen(false); router.push(route as any); };
  const onSecondary = SECONDARY_NAV.some(s => s.path === pathname);
  const overflow = SECONDARY_NAV.filter(s => atLeast(profile?.role, s.tier));

  const logout = async () => { setMoreOpen(false); await supabase.auth.signOut(); router.replace('/login'); };

  const renderRow = (circle: 'grid' | 'close', wrapStyle: any, pe: 'box-none' | 'auto') => (
    <View style={[wrapStyle, { paddingBottom: Math.max(insets.bottom, 10) }]} pointerEvents={pe}>
      <Animated.View style={tabStyles.pill} layout={LinearTransition.duration(100)}>
        {PRIMARY_NAV.map(item => (
          <TabButton key={item.path} item={item} active={pathname === item.path} onPress={() => go(item.route)} />
        ))}
      </Animated.View>
      <PressableScale onPress={() => setMoreOpen(circle === 'grid')} style={[tabStyles.circle, (circle === 'close' || onSecondary) && tabStyles.circleActive]}>
        <Feather name={circle === 'grid' ? 'grid' : 'x'} size={22} color={circle === 'close' || onSecondary ? '#FFF' : '#0F172A'} />
      </PressableScale>
    </View>
  );

  return (
    <>
      {renderRow('grid', tabStyles.overlayWrap, 'box-none')}
      <Modal visible={moreOpen} transparent animationType="fade" onRequestClose={() => setMoreOpen(false)}>
        <View style={tabStyles.modalRoot}>
          <TouchableOpacity activeOpacity={1} style={StyleSheet.absoluteFill} onPress={() => setMoreOpen(false)} />
          <Animated.View style={tabStyles.popover} entering={SlideInDown.duration(260)}>
            <TouchableOpacity style={tabStyles.logoutBtn} onPress={logout}><Feather name="log-out" size={18} color="#DC2626" /><Text style={tabStyles.logoutText}>Keluar</Text></TouchableOpacity>
            <Text style={tabStyles.sheetTitle}>MENU LAINNYA</Text>
            <View style={tabStyles.grid}>
              {overflow.map((item, i) => {
                const active = pathname === item.path;
                return (
                  <Animated.View key={item.path} entering={FadeInDown.duration(220).delay(i * 30)} style={tabStyles.tile}>
                    <PressableScale onPress={() => go(item.route)} style={{ alignItems: 'center', gap: 8 }}>
                      <View style={[tabStyles.tileIcon, active && tabStyles.tileIconActive]}><Feather name={item.icon as any} size={20} color={active ? '#FFF' : '#DC2626'} /></View>
                      <Text style={tabStyles.tileLabel} numberOfLines={1}>{item.label}</Text>
                    </PressableScale>
                  </Animated.View>
                );
              })}
            </View>
          </Animated.View>
          {renderRow('close', tabStyles.barRow, 'auto')}
        </View>
      </Modal>
    </>
  );
}

const tabStyles = StyleSheet.create({
  overlayWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10, paddingTop: 10 },
  barRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10, paddingTop: 10 },
  pill: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 30, paddingHorizontal: 6, paddingVertical: 6, gap: 4, shadowColor: '#0F172A', shadowOpacity: 0.12, shadowRadius: 16, elevation: 10 },
  tab: { height: 48, minWidth: 48, borderRadius: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 4 },
  tabActive: { backgroundColor: '#DC2626', paddingHorizontal: 16 },
  tabLabel: { color: '#FFF', fontWeight: '800', fontSize: 13 },
  circle: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center', shadowColor: '#0F172A', shadowOpacity: 0.12, shadowRadius: 16, elevation: 10 },
  circleActive: { backgroundColor: '#DC2626' },
  modalRoot: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.5)' },
  popover: { backgroundColor: '#FFF', borderRadius: 24, marginHorizontal: 12, marginBottom: 8, padding: 20, elevation: 12 },
  sheetTitle: { fontSize: 11, fontWeight: '900', color: '#94A3B8', letterSpacing: 1.2, marginTop: 18, marginBottom: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 18, columnGap: 12 },
  tile: { width: '22%', alignItems: 'center', gap: 8 },
  tileIcon: { width: 54, height: 54, borderRadius: 18, backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center' },
  tileIconActive: { backgroundColor: '#DC2626' },
  tileLabel: { fontSize: 11, color: '#475569', fontWeight: '600', textAlign: 'center' },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 15, borderRadius: 14, borderWidth: 1, borderColor: '#FEE2E2' },
  logoutText: { color: '#DC2626', fontWeight: '800', fontSize: 14 },
});

const styles = StyleSheet.create({
  webContainer: { flex: 1, flexDirection: 'row', backgroundColor: '#F9FAFB' },
  sidebar: { backgroundColor: '#FFF', borderRightWidth: 1, borderRightColor: '#E5E7EB', padding: 20 },
  webContent: { flex: 1 },
  brandContainer: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 40, marginTop: 10 },
  logoBox: { width: 32, height: 32, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  brandName: { fontSize: 16, fontWeight: '900', color: '#111827', letterSpacing: 1 },
  toggleBtn: { position: 'absolute', right: -12, top: 80, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, padding: 4, zIndex: 50 },
  menuWrapper: { flex: 1 },
  sidebarSection: { fontSize: 10, fontWeight: '800', color: '#9CA3AF', letterSpacing: 1.5, marginBottom: 15, marginLeft: 5 },
  sidebarItem: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 14, marginBottom: 6 },
  sidebarItemActive: { backgroundColor: '#FEF2F2' },
  sidebarLabel: { marginLeft: 12, fontSize: 14, color: '#4B5563', fontWeight: '600' },
  sidebarLabelActive: { color: '#DC2626' },
  activeIndicator: { width: 4, height: 18, backgroundColor: '#DC2626', borderRadius: 2, marginLeft: 'auto' },
  sidebarFooter: { marginTop: 20, borderTopWidth: 1, borderTopColor: '#F3F4F6', paddingTop: 20 },
});