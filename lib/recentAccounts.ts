// Accounts that have logged in on THIS device, for quick re-login on a shared
// counter PC. We store only email/name/role — never passwords. Web-only
// (localStorage); a no-op elsewhere.
export type RecentAccount = { email: string; name: string; role: string };

const KEY = 'pos.recentAccounts';
const hasLS = () => typeof window !== 'undefined' && !!window.localStorage;

export function getRecentAccounts(): RecentAccount[] {
  if (!hasLS()) return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as RecentAccount[]) : [];
  } catch {
    return [];
  }
}

export function rememberAccount(acc: RecentAccount) {
  if (!hasLS() || !acc.email) return;
  const list = getRecentAccounts().filter(a => a.email.toLowerCase() !== acc.email.toLowerCase());
  list.unshift(acc);
  window.localStorage.setItem(KEY, JSON.stringify(list.slice(0, 6)));
}

export function forgetAccount(email: string) {
  if (!hasLS()) return;
  const list = getRecentAccounts().filter(a => a.email.toLowerCase() !== email.toLowerCase());
  window.localStorage.setItem(KEY, JSON.stringify(list));
}
