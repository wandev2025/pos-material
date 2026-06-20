import { useRouter } from 'expo-router';
import { useEffect } from 'react';

export default function Index() {
  const router = useRouter();

  useEffect(() => {
    // Force move to login as soon as the index is hit
    router.replace('/login' as any);
  }, []);

  return null;
}