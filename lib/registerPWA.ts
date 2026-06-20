import { Platform } from 'react-native';

export function registerPWA() {
  if (Platform.OS !== 'web') return;

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => console.log('SW registered'))
        .catch((err) => console.log('SW error', err));
    });
  }
}