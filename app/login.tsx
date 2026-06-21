import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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

import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';

export default function LoginScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width > 900;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: boolean; password?: boolean }>({});
  const passwordRef = useRef<TextInput>(null);

  async function handleLogin() {
    // 1. Validation
    const newErrors = { email: !email.trim(), password: !password };
    if (newErrors.email || newErrors.password) {
      setErrors(newErrors);
      return;
    }
    setErrors({});

    setLoading(true);
    try {
      // 2. Supabase Auth
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        if (Platform.OS === 'web') {
          window.alert("Gagal Login: " + error.message);
        } else {
          Alert.alert('Gagal Login', error.message);
        }
        setLoading(false);
        return;
      }

      // 3. Navigation Force
      if (data?.user) {
        router.replace('/(tabs)' as any);
      }
    } catch (err) {
      setLoading(false);
      Alert.alert('Error', 'Terjadi kesalahan sistem.');
    } finally {
      // We don't set loading false here because the page will redirect
    }
  }

  const renderForm = () => (
    <>
      {isDesktop ? (
        <View style={styles.formHeader}>
          <Text style={styles.formTitle}>Selamat Datang</Text>
          <Text style={styles.subtitle}>Masuk untuk melanjutkan ke dashboard</Text>
        </View>
      ) : (
        <View style={styles.logoContainer}>
          <LinearGradient colors={['#DC2626', '#991B1B']} style={styles.logoCircle}>
            <Feather name="box" size={32} color="#fff" />
          </LinearGradient>
          <Text style={styles.title}>POSMATERIAL</Text>
          <Text style={styles.subtitle}>Sistem Manajemen Konstruksi</Text>
        </View>
      )}

      <View style={styles.inputWrapper}>
        <Text style={styles.label}>Email</Text>
        <View style={[styles.inputContainer, errors.email && styles.inputContainerError]}>
          <Feather name="mail" size={18} color={errors.email ? '#EF4444' : '#6B7280'} />
          <TextInput
            style={styles.input}
            placeholder="Masukkan email"
            placeholderTextColor="#9CA3AF"
            value={email}
            onChangeText={(t) => setEmail(t)}
            autoCapitalize="none"
            keyboardType="email-address"
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
          />
        </View>
      </View>

      <View style={styles.inputWrapper}>
        <Text style={styles.label}>Password</Text>
        <View style={[styles.inputContainer, errors.password && styles.inputContainerError]}>
          <Feather name="lock" size={18} color={errors.password ? '#EF4444' : '#6B7280'} />
          <TextInput
            ref={passwordRef}
            style={styles.input}
            placeholder="Masukkan password"
            placeholderTextColor="#9CA3AF"
            value={password}
            onChangeText={(t) => setPassword(t)}
            secureTextEntry
            returnKeyType="go"
            onSubmitEditing={handleLogin}
          />
        </View>
      </View>

      <TouchableOpacity activeOpacity={0.85} onPress={handleLogin} disabled={loading}>
        <LinearGradient colors={['#DC2626', '#991B1B']} style={styles.button}>
          {loading ? <ActivityIndicator color="#fff" /> : (
            <>
              <Text style={styles.buttonText}>MASUK SISTEM</Text>
              <Feather name="arrow-right" size={18} color="#fff" />
            </>
          )}
        </LinearGradient>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => router.push('/signup' as any)} style={styles.signupBtn}>
        <Text style={styles.signupText}>Belum punya akun? <Text style={styles.signupHighlight}>Daftar disini</Text></Text>
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
              <View style={styles.brandLogo}>
                <Feather name="box" size={36} color="#fff" />
              </View>
              <Text style={styles.brandTitle}>POSMATERIAL</Text>
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
          {!isDesktop && <View style={styles.circleBottom} />}

          <KeyboardAvoidingView
            style={{ flex: 1, width: '100%' }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            {isDesktop ? (
              <ScrollView
                contentContainerStyle={styles.scrollContainer}
                keyboardShouldPersistTaps="handled"
              >
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB', overflow: 'hidden' },
  split: { flex: 1 },
  splitRow: { flexDirection: 'row' },

  // Desktop brand panel
  brandPanel: { flex: 1, overflow: 'hidden', justifyContent: 'center', paddingHorizontal: 64, paddingVertical: 60 },
  brandContent: { maxWidth: 460, zIndex: 2 },
  brandLogo: { width: 76, height: 76, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.18)', justifyContent: 'center', alignItems: 'center', marginBottom: 28 },
  brandTitle: { color: '#fff', fontSize: 40, fontWeight: '900', letterSpacing: 1 },
  brandTagline: { color: 'rgba(255,255,255,0.92)', fontSize: 18, fontWeight: '600', marginTop: 10 },
  brandSub: { color: 'rgba(255,255,255,0.78)', fontSize: 15, lineHeight: 24, marginTop: 20 },
  brandOrb1: { position: 'absolute', width: 320, height: 320, borderRadius: 160, backgroundColor: 'rgba(255,255,255,0.12)', top: -80, right: -60 },
  brandOrb2: { position: 'absolute', width: 260, height: 260, borderRadius: 130, backgroundColor: 'rgba(255,255,255,0.10)', bottom: -90, left: -50 },

  // Form pane
  formPane: { flex: 1, overflow: 'hidden' },
  formPaneDesktop: { backgroundColor: '#FFFFFF' },
  scrollContainer: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  centerFill: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  circleTop: { position: 'absolute', width: 350, height: 350, borderRadius: 175, backgroundColor: '#FEE2E2', top: -150, right: -100 },
  circleBottom: { position: 'absolute', width: 300, height: 300, borderRadius: 150, backgroundColor: '#FEF2F2', bottom: -150, left: -100, opacity: 0.5 },

  card: { width: '100%', maxWidth: 420, alignSelf: 'center', backgroundColor: '#FFF', borderRadius: 32, padding: 30, shadowColor: '#DC2626', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.08, shadowRadius: 24, elevation: 8 },
  cardFlat: { maxWidth: 400, backgroundColor: 'transparent', shadowOpacity: 0, elevation: 0, padding: 8 },

  logoContainer: { alignItems: 'center', marginBottom: 35 },
  logoCircle: { width: 70, height: 70, borderRadius: 24, justifyContent: 'center', alignItems: 'center', marginBottom: 15 },
  title: { fontSize: 28, fontWeight: '900', color: '#1F2937', letterSpacing: 1 },
  formHeader: { marginBottom: 30 },
  formTitle: { fontSize: 30, fontWeight: '900', color: '#1F2937' },
  subtitle: { color: '#6B7280', marginTop: 5, fontSize: 14, fontWeight: '500' },
  inputWrapper: { marginBottom: 20 },
  label: { color: '#4B5563', marginBottom: 8, fontSize: 13, fontWeight: '700' },
  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 16, paddingHorizontal: 16, height: 60 },
  inputContainerError: { borderColor: '#EF4444', backgroundColor: '#FEF2F2' },
  input: { flex: 1, color: '#111827', fontSize: 16, marginLeft: 12, outlineStyle: 'none' as any },
  button: { marginTop: 10, height: 60, borderRadius: 16, justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: 10 },
  buttonText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
  signupBtn: { marginTop: 25, alignItems: 'center' },
  signupText: { color: '#6B7280', fontSize: 14 },
  signupHighlight: { color: '#DC2626', fontWeight: '800' }
});
