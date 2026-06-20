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
  View,
} from 'react-native';

import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';

export default function LoginScreen() {
  const router = useRouter();
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

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      
      {/* Background Orbs */}
      <View style={styles.circleTop} />
      <View style={styles.circleBottom} />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView 
            contentContainerStyle={styles.scrollContainer} 
            keyboardShouldPersistTaps="handled"
        >
          <View style={styles.card}>
            <View style={styles.logoContainer}>
              <LinearGradient colors={['#7C3AED', '#A855F7']} style={styles.logoCircle}>
                <Feather name="shield" size={32} color="#fff" />
              </LinearGradient>
              <Text style={styles.title}>POSMATERIAL</Text>
              <Text style={styles.subtitle}>Sistem Manajemen Konstruksi</Text>
            </View>

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
                />
              </View>
            </View>

            <TouchableOpacity activeOpacity={0.85} onPress={handleLogin} disabled={loading}>
              <LinearGradient colors={['#7C3AED', '#9333EA']} style={styles.button}>
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
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  scrollContainer: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  circleTop: { position: 'absolute', width: 350, height: 350, borderRadius: 175, backgroundColor: '#EDE9FE', top: -150, right: -100 },
  circleBottom: { position: 'absolute', width: 300, height: 300, borderRadius: 150, backgroundColor: '#DDD6FE', bottom: -150, left: -100, opacity: 0.5 },
  card: { backgroundColor: '#FFF', borderRadius: 32, padding: 30, elevation: 8, shadowColor: '#7C3AED', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.05, shadowRadius: 20 },
  logoContainer: { alignItems: 'center', marginBottom: 35 },
  logoCircle: { width: 70, height: 70, borderRadius: 24, justifyContent: 'center', alignItems: 'center', marginBottom: 15 },
  title: { fontSize: 28, fontWeight: '900', color: '#1F2937', letterSpacing: 1 },
  subtitle: { color: '#6B7280', marginTop: 5, fontSize: 14, fontWeight: '500' },
  inputWrapper: { marginBottom: 20 },
  label: { color: '#4B5563', marginBottom: 8, fontSize: 13, fontWeight: '700' },
  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 16, paddingHorizontal: 16, height: 60 },
  inputContainerError: { borderColor: '#EF4444', backgroundColor: '#FEF2F2' },
  input: { flex: 1, color: '#111827', fontSize: 16, marginLeft: 12 },
  button: { marginTop: 10, height: 60, borderRadius: 16, justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: 10 },
  buttonText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
  signupBtn: { marginTop: 25, alignItems: 'center' },
  signupText: { color: '#6B7280', fontSize: 14 },
  signupHighlight: { color: '#7C3AED', fontWeight: '800' }
});