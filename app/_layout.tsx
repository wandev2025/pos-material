import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { ProfileProvider, useProfile } from '../lib/ProfileContext';

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
  return (
    <ProfileProvider>
      <RootLayoutNav />
    </ProfileProvider>
  );
}