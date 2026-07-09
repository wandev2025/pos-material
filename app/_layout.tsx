import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import { SplashScreen, Stack, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import OfflineBanner from '../components/OfflineBanner';
import { ConfirmHost } from '../lib/confirm';
import { OfflineProvider } from '../lib/offline/OfflineContext';
import { ProfileProvider, useProfile } from '../lib/ProfileContext';
import { Toaster } from '../lib/toast';

// Prevent the splash screen from auto-hiding before assets are loaded.
SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  const { session, isLoading: profileLoading } = useProfile();
  const segments = useSegments();
  const router = useRouter();

  const [fontsLoaded, fontError] = useFonts({
    ...Feather.font,
    ...Ionicons.font,
    ...MaterialCommunityIcons.font,
  });

  // Handle Font Errors
  useEffect(() => {
    if (fontError) throw fontError;
  }, [fontError]);

  // Handle Redirection and Hide Splash Screen
  useEffect(() => {
    // Wait until fonts and profile are ready
    if (!fontsLoaded || profileLoading) return;

    const rootSegment = segments[0] as string;
    const inTabsGroup = rootSegment === '(tabs)';

    // Hide splash screen once we know where to go
    SplashScreen.hideAsync();

    if (!session) {
      // If not logged in and not already on auth pages, go to login
      if (rootSegment !== 'login' && rootSegment !== 'signup') {
        router.replace('/login' as any);
      }
    } else {
      // If logged in and at root or auth pages, go to tabs
      if (!inTabsGroup) {
        router.replace('/(tabs)/' as any);
      }
    }
  }, [session, segments, fontsLoaded, profileLoading]);

  // Show a loading spinner while fonts or profile are loading
  if (!fontsLoaded || profileLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFF' }}>
        <ActivityIndicator size="large" color="#DC2626" />
      </View>
    );
  }

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
  // Fix for Web Focus Ring (Keep your existing logic)
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const style = document.createElement('style');
    style.textContent = `
      input:focus, textarea:focus, select:focus, [contenteditable]:focus {
        outline: none !important;
        box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.25) !important;
      }
      /* Ensure icons render correctly on all browsers */
      body {
        text-rendering: optimizeLegibility;
        -webkit-font-smoothing: antialiased;
      }
    `;
    document.head.appendChild(style);
    return () => {
      if (document.head.contains(style)) {
        document.head.removeChild(style);
      }
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