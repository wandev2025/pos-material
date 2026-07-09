import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { toast } from '../lib/toast';

export default function SignupScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width > 900;
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSignup() {
    if (!fullName || !email || !password) {
      toast.error('Harap isi semua kolom');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { full_name: fullName.trim() } },
      });

      if (error) {
        toast.error('Signup Gagal', error.message);
      } else {
        toast.success('Akun berhasil dibuat! Silahkan login.');
        router.replace('/login' as any);
      }
    } catch (err) {
      toast.error('Terjadi kesalahan.');
    } finally {
      setLoading(false);
    }
  }

  const renderForm = () => (
    <>
      {isDesktop ? (
        <View style={styles.formHeader}>
          <Text style={styles.formTitle}>Register Account</Text>
          <Text style={styles.subtitle}>Daftar akun manajemen baru</Text>
        </View>
      ) : (
        <View style={styles.logoContainer}>
          {/* MOBILE LOGO UPDATED */}
          <View style={styles.logoCircle}>
            <Image 
              source={require('../assets/images/LOGO_TJ.png')} 
              style={{ width: 70, height: 70 }} 
              resizeMode="contain" 
            />
          </View>
          <Text style={styles.title}>POS TANJUNG JATI</Text>
          <Text style={styles.subtitle}>Sistem Manajemen Konstruksi</Text>
        </View>
      )}

      <View style={styles.inputWrapper}>
        <Text style={styles.label}>Nama Lengkap</Text>
        <View style={styles.inputContainer}>
          <Feather name="user" size={18} color="#6B7280" />
          <TextInput
            style={styles.input}
            placeholder="Nama lengkap"
            placeholderTextColor="#9CA3AF"
            value={fullName}
            onChangeText={setFullName}
          />
        </View>
      </View>

      <View style={styles.inputWrapper}>
        <Text style={styles.label}>Email</Text>
        <View style={styles.inputContainer}>
          <Feather name="mail" size={18} color="#6B7280" />
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor="#9CA3AF"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
        </View>
      </View>

      <View style={styles.inputWrapper}>
        <Text style={styles.label}>Password</Text>
        <View style={styles.inputContainer}>
          <Feather name="lock" size={18} color="#6B7280" />
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor="#9CA3AF"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
        </View>
      </View>

      <TouchableOpacity activeOpacity={0.85} onPress={handleSignup} disabled={loading}>
        <LinearGradient colors={['#DC2626', '#991B1B']} style={styles.button}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>DAFTAR AKUN</Text>}
        </LinearGradient>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => router.back()} style={styles.loginBtn}>
        <Text style={styles.loginText}>
          Sudah punya akun? <Text style={styles.loginHighlight}>Login</Text>
        </Text>
      </TouchableOpacity>
    </>
  );

  return (
    <View style={[styles.container, isWebFullHeight]}>
      <StatusBar barStyle="dark-content" />

      <View style={[styles.split, isDesktop && styles.splitRow]}>
        {/* Desktop-only brand panel */}
        {isDesktop && (
          <LinearGradient
            colors={['#DC2626', '#991B1B']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.brandPanel}
          >
            <View style={styles.brandOrb1} />
            <View style={styles.brandOrb2} />
            <View style={styles.brandContent}>
              {/* DESKTOP LOGO UPDATED */}
              <View style={[styles.brandLogo, { backgroundColor: 'transparent' }]}>
                <Image 
                  source={require('../assets/images/LOGO_TJ.png')} 
                  style={{ width: 200, height: 200 }} 
                  resizeMode="contain" 
                />
              </View>
              <Text style={styles.brandTitle}>POS TANJUNG JATI</Text>
              <Text style={styles.brandTagline}>Sistem Manajemen Konstruksi</Text>
              <Text style={styles.brandSub}>
                Kelola inventaris, penjualan, dan operasional toko Anda dalam satu tempat.
              </Text>
            </View>
          </LinearGradient>
        )}

        {/* Form pane */}
        <View style={[styles.formPane, isDesktop && styles.formPaneDesktop]}>
          {!isDesktop && <View style={styles.circleTop} />}

          <KeyboardAvoidingView
            style={{ flex: 1, width: '100%' }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            {isDesktop ? (
              <ScrollView contentContainerStyle={styles.scrollContainer}>
                <View style={[styles.card, styles.cardFlat]}>{renderForm()}</View>
              </ScrollView>
            ) : (
              // Mobile: fill the viewport (100vh on web), centered, no scroll
              <View style={styles.centerFill}>
                <View style={styles.card}>{renderForm()}</View>
              </View>
            )}
          </KeyboardAvoidingView>
        </View>
      </View>
    </View>
  );
}

// Web-only: pin the page to the full viewport height so mobile never scrolls.
const isWebFullHeight = Platform.OS === 'web' ? ({ height: '100vh' } as any) : null;

// Styles reuse the login theme for consistency
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB', overflow: 'hidden' },
  split: { flex: 1 },
  splitRow: { flexDirection: 'row' },

  // Desktop brand panel
  brandPanel: { flex: 1, overflow: 'hidden', justifyContent: 'center', paddingHorizontal: 64, paddingVertical: 60 },
  brandContent: { maxWidth: 460, zIndex: 2 },
  brandLogo: {
    width: 76,
    height: 76,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 28,
  },
  brandTitle: { color: '#fff', fontSize: 40, fontWeight: '900', letterSpacing: 1 },
  brandTagline: { color: 'rgba(255,255,255,0.92)', fontSize: 18, fontWeight: '600', marginTop: 10 },
  brandSub: { color: 'rgba(255,255,255,0.78)', fontSize: 15, lineHeight: 24, marginTop: 20 },
  brandOrb1: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: 'rgba(255,255,255,0.12)',
    top: -80,
    right: -60,
  },
  brandOrb2: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(255,255,255,0.10)',
    bottom: -90,
    left: -50,
  },

  // Form pane
  formPane: { flex: 1, overflow: 'hidden' },
  formPaneDesktop: { backgroundColor: '#FFFFFF' },
  scrollContainer: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  centerFill: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  circleTop: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: '#FEE2E2',
    top: -100,
    right: -50,
  },

  card: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    backgroundColor: '#FFF',
    borderRadius: 30,
    padding: 28,
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 5,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  cardFlat: {
    maxWidth: 400,
    backgroundColor: 'transparent',
    shadowOpacity: 0,
    elevation: 0,
    borderWidth: 0,
    padding: 8,
  },

  logoContainer: { alignItems: 'center', marginBottom: 25 },
  logoCircle: {
    width: 70,
    height: 70,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 15,
  },
  title: { color: '#1F2937', fontSize: 26, fontWeight: '800', textAlign: 'center' },
  formHeader: { marginBottom: 25 },
  formTitle: { color: '#1F2937', fontSize: 28, fontWeight: '900' },
  subtitle: { color: '#6B7280', marginTop: 4, fontSize: 14 },
  subtitleCenter: { color: '#6B7280', marginTop: 4, fontSize: 14, textAlign: 'center' },
  inputWrapper: { marginBottom: 15 },
  label: { color: '#374151', marginBottom: 6, fontSize: 13, fontWeight: '600' },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 16,
    paddingHorizontal: 16,
    height: 56,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  input: { flex: 1, color: '#111827', marginLeft: 12, outlineStyle: 'none' as any },
  button: { marginTop: 10, height: 56, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  buttonText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  loginBtn: { marginTop: 20, alignItems: 'center' },
  loginText: { color: '#6B7280' },
  loginHighlight: { color: '#DC2626', fontWeight: '700' },
});
