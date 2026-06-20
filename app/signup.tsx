import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';

export default function SignupScreen() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'OWNER' | 'ADMIN'>('ADMIN');
  const [loading, setLoading] = useState(false);

  async function handleSignup() {
    if (!fullName || !email || !password) {
      Alert.alert('Error', 'Harap isi semua kolom');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { full_name: fullName.trim(), role: role } },
      });

      if (error) {
        Alert.alert('Signup Gagal', error.message);
      } else {
        Alert.alert('Berhasil', 'Akun berhasil dibuat! Silahkan login.', [
          { text: 'OK', onPress: () => router.replace('/login' as any) }
        ]);
      }
    } catch (err) {
      Alert.alert('System Error', 'Terjadi kesalahan.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.circleTop} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scrollContainer}>
          <View style={styles.card}>
            <Text style={styles.title}>Register Account</Text>
            <Text style={styles.subtitle}>Daftar akun manajemen baru</Text>

            <View style={styles.inputWrapper}>
              <Text style={styles.label}>Nama Lengkap</Text>
              <View style={styles.inputContainer}>
                <Feather name="user" size={18} color="#6B7280" />
                <TextInput style={styles.input} placeholder="Nama lengkap" value={fullName} onChangeText={setFullName} />
              </View>
            </View>

            <View style={styles.inputWrapper}>
              <Text style={styles.label}>Email</Text>
              <View style={styles.inputContainer}>
                <Feather name="mail" size={18} color="#6B7280" />
                <TextInput style={styles.input} placeholder="Email" value={email} onChangeText={setEmail} autoCapitalize="none" />
              </View>
            </View>

            <View style={styles.inputWrapper}>
              <Text style={styles.label}>Role</Text>
              <View style={styles.roleGrid}>
                <TouchableOpacity onPress={() => setRole('OWNER')} style={[styles.roleBtn, role === 'OWNER' && styles.roleActive]}>
                  <Text style={[styles.roleLabel, role === 'OWNER' && styles.roleLabelActive]}>OWNER</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setRole('ADMIN')} style={[styles.roleBtn, role === 'ADMIN' && styles.roleActive]}>
                  <Text style={[styles.roleLabel, role === 'ADMIN' && styles.roleLabelActive]}>ADMIN</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.inputWrapper}>
              <Text style={styles.label}>Password</Text>
              <View style={styles.inputContainer}>
                <Feather name="lock" size={18} color="#6B7280" />
                <TextInput style={styles.input} placeholder="Password" value={password} onChangeText={setPassword} secureTextEntry />
              </View>
            </View>

            <TouchableOpacity activeOpacity={0.85} onPress={handleSignup} disabled={loading}>
              <LinearGradient colors={['#7C3AED', '#9333EA']} style={styles.button}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>DAFTAR AKUN</Text>}
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 20, alignItems: 'center' }}>
              <Text style={styles.loginText}>Sudah punya akun? <Text style={styles.loginHighlight}>Login</Text></Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// Styles reuse the login theme for consistency
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  scrollContainer: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  circleTop: { position: 'absolute', width: 300, height: 300, borderRadius: 150, backgroundColor: '#EDE9FE', top: -100, right: -50 },
  card: { backgroundColor: '#FFF', borderRadius: 30, padding: 28, elevation: 5, borderWidth: 1, borderColor: '#F3F4F6' },
  title: { color: '#1F2937', fontSize: 26, fontWeight: '800', textAlign: 'center' },
  subtitle: { color: '#6B7280', textAlign: 'center', marginBottom: 25 },
  inputWrapper: { marginBottom: 15 },
  label: { color: '#374151', marginBottom: 6, fontSize: 13, fontWeight: '600' },
  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6', borderRadius: 16, paddingHorizontal: 16, height: 56, borderWidth: 1, borderColor: '#E5E7EB' },
  input: { flex: 1, color: '#111827', marginLeft: 12 },
  roleGrid: { flexDirection: 'row', gap: 10 },
  roleBtn: { flex: 1, height: 45, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', justifyContent: 'center', alignItems: 'center', backgroundColor: '#F3F4F6' },
  roleActive: { backgroundColor: '#7C3AED', borderColor: '#7C3AED' },
  roleLabel: { color: '#6B7280', fontWeight: 'bold', fontSize: 12 },
  roleLabelActive: { color: '#FFF' },
  button: { marginTop: 10, height: 56, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  buttonText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  loginText: { color: '#6B7280' },
  loginHighlight: { color: '#7C3AED', fontWeight: '700' }
});