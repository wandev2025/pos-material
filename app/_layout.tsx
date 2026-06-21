import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import OfflineBanner from '../components/OfflineBanner';
import { ConfirmHost } from '../lib/confirm';
import { OfflineProvider } from '../lib/offline/OfflineContext';
import { ProfileProvider, useProfile } from '../lib/ProfileContext';
import { Toaster } from '../lib/toast';

function RootLayoutNav() {
  const { session, isLoading: profileLoading } = useProfile();
  const segments = useSegments();
  const router = useRouter();

  const [fontsLoaded] = useFonts({
    ...Feather.font,
    ...Ionicons.font,
    ...MaterialCommunityIcons.font,
  });

  useEffect(() => {
    if (!fontsLoaded || profileLoading) return;
    const rootSegment = segments[0] as string;
    const inTabsGroup = rootSegment === '(tabs)';

    if (!session) {
      if (rootSegment !== 'login' && rootSegment !== 'signup') {
        router.replace('/login' as any);
      }
    } else {
      if (!inTabsGroup) {
        router.replace('/(tabs)/' as any);
      }
    }
  }, [session, segments, fontsLoaded, profileLoading]);

  if (!fontsLoaded || profileLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#DC2626" />
      </View>
    );
  }

  // NOTICE: No Sidebar here! Just the Stack.
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="login" />
      <Stack.Screen name="signup" />
      <Stack.Screen name="(tabs)" options={{ gestureEnabled: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  // Replace the browser's default blue focus ring on web inputs with a subtle
  // brand-red ring, applied globally so every input/textarea/select matches.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const style = document.createElement('style');
    style.textContent = `
      input:focus, textarea:focus, select:focus, [contenteditable]:focus {
        outline: none !important;
        box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.25) !important;
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  return (
    <OfflineProvider>
      <ProfileProvider>
        <View style={{ flex: 1 }}>
          <OfflineBanner />
          <RootLayoutNav />
          <Toaster />
          <ConfirmHost />
        </View>
      </ProfileProvider>
    </OfflineProvider>
  );
}
