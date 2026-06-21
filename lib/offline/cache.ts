// lib/offline/cache.ts
// Read-through cache for the resilient offline safeguard. Screens wrap their
// READ queries with cachedFetch so the UI still renders the last-known data
// when the network is unavailable. Writes are blocked elsewhere via useOnline.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const PREFIX = '@cache_';

const readCache = async (key: string): Promise<string | null> => {
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return null;
    return localStorage.getItem(key);
  }
  return AsyncStorage.getItem(key);
};

const writeCache = async (key: string, value: string): Promise<void> => {
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
    localStorage.setItem(key, value);
    return;
  }
  await AsyncStorage.setItem(key, value);
};

/**
 * Try the live fetcher first. On success, persist the result (best-effort) and
 * return it. On failure (e.g. offline), return the cached value if one exists,
 * otherwise rethrow the original error so callers can surface it.
 */
export async function cachedFetch<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const storageKey = PREFIX + key;
  try {
    const fresh = await fetcher();
    try {
      await writeCache(storageKey, JSON.stringify(fresh));
    } catch {
      // Caching is best-effort; ignore storage write failures (quota, etc.).
    }
    return fresh;
  } catch (err) {
    try {
      const cached = await readCache(storageKey);
      if (cached != null) {
        return JSON.parse(cached) as T;
      }
    } catch {
      // Fall through to rethrow the original fetch error.
    }
    throw err;
  }
}
