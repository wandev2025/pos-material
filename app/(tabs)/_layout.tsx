import { Feather } from '@expo/vector-icons';
import { Tabs, usePathname, useRouter } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, LinearTransition, SlideInDown, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import PressableScale from '../../components/PressableScale';
import { useProfile } from '../../lib/ProfileContext';
import { supabase } from '../../lib/supabase';

export default function TabLayout() {
  const { width } = useWindowDimensions();
  const { profile } = useProfile();
  const router = useRouter();
  const pathname = usePathname();
  
  // Responsive Constants
  const isWeb = width > 768;
  const isManager = profile?.role === 'OWNER' || profile?.role === 'SUPERADMIN';

  // Sidebar visibility state (for Web)
  const [collapsed, setCollapsed] = useState(false);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace('/login' as any);
  };

  /**
   * WEB SIDEBAR LAYOUT
   */
  if (isWeb) {
    return (
      <View style={styles.webContainer}>
        {/* SIDEBAR */}
        <View style={[styles.sidebar, { width: collapsed ? 85 : 260 }]}>
          
          {/* Brand/Logo */}
          <View style={[styles.brandContainer, collapsed && { justifyContent: 'center' }]}>
            <View style={styles.logoBox}>
                <Feather name="box" size={20} color="#FFF" />
            </View>
            {!collapsed && <Text style={styles.brandName}>POSMATERIAL</Text>}
          </View>

          {/* Toggle Button (Floating on edge) */}
          <TouchableOpacity 
            style={styles.toggleBtn} 
            onPress={() => setCollapsed(!collapsed)}
            activeOpacity={0.8}
          >
            <Feather name={collapsed ? "chevron-right" : "chevron-left"} size={14} color="#9CA3AF" />
          </TouchableOpacity>

          <View style={styles.menuWrapper}>
            <Text style={[styles.sidebarSection, collapsed && { textAlign: 'center', fontSize: 8 }]}>
                {collapsed ? "---" : "MENU UTAMA"}
            </Text>
            
            <SidebarItem 
                icon="home" label="Beranda" 
                active={pathname === '/'}
                collapsed={collapsed} 
                onPress={() => router.push('/(tabs)/' as any)} 
            />
            <SidebarItem 
                icon="package" label="Stok Barang" 
                active={pathname === '/inventory'}
                collapsed={collapsed} 
                onPress={() => router.push('/(tabs)/inventory' as any)} 
            />
            <SidebarItem
                icon="shopping-cart" label="Input Pesanan"
                active={pathname === '/pos'}
                collapsed={collapsed}
                onPress={() => router.push('/(tabs)/pos' as any)}
            />
            <SidebarItem
                icon="dollar-sign" label="Tutup Kasir"
                active={pathname === '/kasir'}
                collapsed={collapsed}
                onPress={() => router.push('/(tabs)/kasir' as any)}
            />

            {/* ADMNISTRASI SECTION (Owner Only) */}
            {isManager && (
                <>
                    <Text style={[styles.sidebarSection, { marginTop: 25 }, collapsed && { textAlign: 'center', fontSize: 8 }]}>
                        {collapsed ? "---" : "ADMINISTRASI"}
                    </Text>
                    <SidebarItem 
                        icon="settings" label="Setup Sistem" 
                        active={pathname === '/setup'}
                        collapsed={collapsed} 
                        onPress={() => router.push('/(tabs)/setup' as any)} 
                    />
                    <SidebarItem 
                        icon="bar-chart-2" label="Laporan" 
                        collapsed={collapsed} 
                        active={pathname === '/laporan'} onPress={() => router.push('/(tabs)/laporan' as any)} 
                    />
                    <SidebarItem
                        icon="users" label="Pengguna"
                        active={pathname === '/users'}
                        collapsed={collapsed}
                        onPress={() => router.push('/(tabs)/users' as any)}
                    />
                    <SidebarItem
                        icon="truck" label="Pembelian"
                        active={pathname === '/pembelian'}
                        collapsed={collapsed}
                        onPress={() => router.push('/(tabs)/pembelian' as any)}
                    />
                    <SidebarItem
                        icon="user-check" label="Pelanggan"
                        active={pathname === '/pelanggan'}
                        collapsed={collapsed}
                        onPress={() => router.push('/(tabs)/pelanggan' as any)}
                    />
                    <SidebarItem
                        icon="corner-up-left" label="Retur"
                        active={pathname === '/retur'}
                        collapsed={collapsed}
                        onPress={() => router.push('/(tabs)/retur' as any)}
                    />
                </>
            )}
          </View>

          {/* Sidebar Footer (User & Logout) */}
          <View style={styles.sidebarFooter}>
            {!collapsed && (
              <View style={styles.userBox}>
                <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{profile?.full_name?.charAt(0) || 'U'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.userName} numberOfLines={1}>{profile?.full_name || 'User'}</Text>
                  <Text style={styles.userRole}>{profile?.role || 'OWNER'}</Text>
                </View>
              </View>
            )}
            <TouchableOpacity style={[styles.logoutBtn, collapsed && { paddingHorizontal: 0 }]} onPress={handleLogout}>
              <Feather name="log-out" size={18} color="#DC2626" />
              {!collapsed && <Text style={styles.logoutText}>Keluar</Text>}
            </TouchableOpacity>
          </View>
        </View>

        {/* MAIN CONTENT AREA */}
        <View style={styles.webContent}>
          <Tabs screenOptions={{ headerShown: false, tabBarStyle: { display: 'none' } }} />
        </View>
      </View>
    );
  }

  /**
   * MOBILE TAB LAYOUT
   */
  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerStyle: { backgroundColor: '#FFF', borderBottomColor: '#F3F4F6', borderBottomWidth: 1 },
          headerTitleStyle: { fontWeight: '900', color: '#111827', fontSize: 18 },
          tabBarStyle: { display: 'none' },
        }}>
      <Tabs.Screen 
        name="index" 
        options={{ title: 'Home', tabBarIcon: ({ color }) => <Feather name="home" size={20} color={color} /> }} 
      />
      <Tabs.Screen 
        name="inventory" 
        options={{ title: 'Stok', tabBarIcon: ({ color }) => <Feather name="package" size={20} color={color} /> }} 
      />
      <Tabs.Screen 
        name="pos" 
        options={{ title: 'POS', tabBarIcon: ({ color }) => <Feather name="shopping-cart" size={20} color={color} /> }} 
      />
      <Tabs.Screen
        name="setup"
        options={{ href: isManager ? undefined : null, title: 'Setup', tabBarIcon: ({ color }) => <Feather name="settings" size={20} color={color} /> }}
      />
      <Tabs.Screen
        name="users"
        options={{ href: isManager ? undefined : null, title: 'Pengguna', tabBarIcon: ({ color }) => <Feather name="users" size={20} color={color} /> }}
      />
      <Tabs.Screen
        name="laporan"
        options={{ href: isManager ? undefined : null, title: 'Laporan', tabBarIcon: ({ color }) => <Feather name="bar-chart-2" size={20} color={color} /> }}
      />
      <Tabs.Screen
        name="kasir"
        options={{ title: 'Kasir', tabBarIcon: ({ color }) => <Feather name="dollar-sign" size={20} color={color} /> }}
      />
      <Tabs.Screen
        name="pembelian"
        options={{ href: isManager ? undefined : null, title: 'Pembelian', tabBarIcon: ({ color }) => <Feather name="truck" size={20} color={color} /> }}
      />
      <Tabs.Screen
        name="pelanggan"
        options={{ href: isManager ? undefined : null, title: 'Pelanggan', tabBarIcon: ({ color }) => <Feather name="user-check" size={20} color={color} /> }}
      />
      <Tabs.Screen
        name="retur"
        options={{ href: isManager ? undefined : null, title: 'Retur', tabBarIcon: ({ color }) => <Feather name="corner-up-left" size={20} color={color} /> }}
      />
      </Tabs>
      <FloatingTabBar />
    </View>
  );
}

/**
 * Sidebar Item Helper Component
 */
function SidebarItem({ icon, label, active, onPress, collapsed }: any) {
  return (
    <TouchableOpacity 
        onPress={onPress} 
        style={[styles.sidebarItem, active && styles.sidebarItemActive, collapsed && { justifyContent: 'center' }]}
        activeOpacity={0.7}
    >
      <Feather name={icon} size={20} color={active ? '#DC2626' : '#64748B'} />
      {!collapsed && (
        <Text style={[styles.sidebarLabel, active && styles.sidebarLabelActive]}>
            {label}
        </Text>
      )}
      {active && !collapsed && <View style={styles.activeIndicator} />}
    </TouchableOpacity>
  );
}

// --- MOBILE FLOATING TAB BAR (iOS-style morphing pill) ---
const PRIMARY_NAV = [
  { route: '/(tabs)/', path: '/', icon: 'home', label: 'Beranda' },
  { route: '/(tabs)/inventory', path: '/inventory', icon: 'package', label: 'Stok' },
  { route: '/(tabs)/pos', path: '/pos', icon: 'shopping-cart', label: 'POS' },
  { route: '/(tabs)/kasir', path: '/kasir', icon: 'dollar-sign', label: 'Tutup' },
];

const SECONDARY_NAV = [
  { route: '/(tabs)/laporan', path: '/laporan', icon: 'bar-chart-2', label: 'Laporan' },
  { route: '/(tabs)/setup', path: '/setup', icon: 'settings', label: 'Setup' },
  { route: '/(tabs)/users', path: '/users', icon: 'users', label: 'Pengguna' },
  { route: '/(tabs)/pembelian', path: '/pembelian', icon: 'truck', label: 'Pembelian' },
  { route: '/(tabs)/pelanggan', path: '/pelanggan', icon: 'user-check', label: 'Pelanggan' },
  { route: '/(tabs)/retur', path: '/retur', icon: 'corner-up-left', label: 'Retur' },
];

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// One primary tab in the pill. The active tab morphs wider to reveal its label —
// the width tweens via the layout transition while the label cross-fades.
function TabButton({ item, active, onPress }: { item: any; active: boolean; onPress: () => void }) {
  const scale = useSharedValue(1);
  const aStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={() => { scale.value = withTiming(0.9, { duration: 110 }); }}
      onPressOut={() => { scale.value = withTiming(1, { duration: 150 }); }}
      layout={LinearTransition.duration(240)}
      style={[tabStyles.tab, active && tabStyles.tabActive, aStyle]}
    >
      <Feather name={item.icon as any} size={20} color={active ? '#FFF' : '#64748B'} />
      {active && (
        <Animated.Text entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)} style={tabStyles.tabLabel} numberOfLines={1}>
          {item.label}
        </Animated.Text>
      )}
    </AnimatedPressable>
  );
}

function FloatingTabBar() {
  const router = useRouter();
  const pathname = usePathname();
  const { profile } = useProfile();
  const insets = useSafeAreaInsets();
  const isManager = profile?.role === 'OWNER' || profile?.role === 'SUPERADMIN';
  const [moreOpen, setMoreOpen] = useState(false);

  const go = (route: string) => { setMoreOpen(false); router.push(route as any); };
  const onSecondary = SECONDARY_NAV.some((s) => s.path === pathname);
  const overflow = isManager ? SECONDARY_NAV : [];

  const logout = async () => {
    setMoreOpen(false);
    await supabase.auth.signOut();
    router.replace('/login' as any);
  };

  // The bar: a morphing pill of primary tabs + a trailing circle. The circle is
  // a grid (opens the overflow); while open it becomes a close (✕) in the exact
  // same spot to return to the original bar.
  const renderRow = (circle: 'grid' | 'close', wrapStyle: any, pe: 'box-none' | 'auto') => (
    <View style={[wrapStyle, { paddingBottom: Math.max(insets.bottom, 10) }]} pointerEvents={pe}>
      <Animated.View style={tabStyles.pill} layout={LinearTransition.duration(240)}>
        {PRIMARY_NAV.map((item) => (
          <TabButton key={item.path} item={item} active={pathname === item.path} onPress={() => go(item.route)} />
        ))}
      </Animated.View>
      <PressableScale
        onPress={() => setMoreOpen(circle === 'grid')}
        style={[tabStyles.circle, (circle === 'close' || onSecondary) && tabStyles.circleActive]}
      >
        <Feather name={circle === 'grid' ? 'grid' : 'x'} size={22} color={(circle === 'close' || onSecondary) ? '#FFF' : '#0F172A'} />
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
            <TouchableOpacity style={tabStyles.logoutBtn} onPress={logout}>
              <Feather name="log-out" size={18} color="#DC2626" />
              <Text style={tabStyles.logoutText}>Keluar</Text>
            </TouchableOpacity>
            <Text style={tabStyles.sheetTitle}>MENU LAINNYA</Text>
            <View style={tabStyles.grid}>
              {overflow.map((item, i) => {
                const active = pathname === item.path;
                return (
                  <Animated.View key={item.path} entering={FadeInDown.duration(220).delay(i * 30)} style={tabStyles.tile}>
                    <PressableScale onPress={() => go(item.route)} style={{ alignItems: 'center', gap: 8 }}>
                      <View style={[tabStyles.tileIcon, active && tabStyles.tileIconActive]}>
                        <Feather name={item.icon as any} size={20} color={active ? '#FFF' : '#DC2626'} />
                      </View>
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
  pill: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 30, paddingHorizontal: 6, paddingVertical: 6, gap: 4, shadowColor: '#0F172A', shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 10 },
  tab: { height: 48, minWidth: 48, borderRadius: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 4 },
  tabActive: { backgroundColor: '#DC2626', paddingHorizontal: 16 },
  tabLabel: { color: '#FFF', fontWeight: '800', fontSize: 13 },
  circle: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center', shadowColor: '#0F172A', shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 10 },
  circleActive: { backgroundColor: '#DC2626' },
  modalRoot: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.5)' },
  popover: { backgroundColor: '#FFF', borderRadius: 24, marginHorizontal: 12, marginBottom: 8, padding: 20, shadowColor: '#0F172A', shadowOpacity: 0.15, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 12 },
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
  sidebar: { 
    backgroundColor: '#FFF', 
    borderRightWidth: 1, 
    borderRightColor: '#E5E7EB', 
    padding: 20,
    // Note: React Native StyleSheet doesn't support transition, 
    // but Expo Web handles basic width changes smoothly.
  },
  webContent: { flex: 1 },
  
  // Brand
  brandContainer: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 40, marginTop: 10 },
  logoBox: { width: 32, height: 32, backgroundColor: '#DC2626', borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  brandName: { fontSize: 16, fontWeight: '900', color: '#111827', letterSpacing: 1 },
  
  // Toggle
  toggleBtn: { 
    position: 'absolute', right: -12, top: 80, 
    backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E5E7EB', 
    borderRadius: 10, padding: 4, zIndex: 50,
    elevation: 2
  },

  // Menu
  menuWrapper: { flex: 1 },
  sidebarSection: { fontSize: 10, fontWeight: '800', color: '#9CA3AF', letterSpacing: 1.5, marginBottom: 15, marginLeft: 5 },
  sidebarItem: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 14, marginBottom: 6 },
  sidebarItemActive: { backgroundColor: '#FEF2F2' }, // Light red tint
  sidebarLabel: { marginLeft: 12, fontSize: 14, color: '#4B5563', fontWeight: '600' },
  sidebarLabelActive: { color: '#DC2626' },
  activeIndicator: { width: 4, height: 18, backgroundColor: '#DC2626', borderRadius: 2, marginLeft: 'auto' },

  // Footer
  sidebarFooter: { marginTop: 'auto', borderTopWidth: 1, borderTopColor: '#F3F4F6', paddingTop: 20 },
  userBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', padding: 12, borderRadius: 16, marginBottom: 12 },
  avatar: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#DC2626', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  avatarText: { color: '#FFF', fontWeight: 'bold', fontSize: 14 },
  userName: { fontWeight: '700', color: '#111827', fontSize: 13 },
  userRole: { fontSize: 9, color: '#6B7280', fontWeight: '800', textTransform: 'uppercase', marginTop: 2 },
  
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#FEE2E2', backgroundColor: '#FFF' },
  logoutText: { color: '#DC2626', fontWeight: '800', marginLeft: 10, fontSize: 13 }
});