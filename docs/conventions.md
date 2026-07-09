# Conventions

Patterns this codebase follows. Match them when adding or changing code — consistency here is
deliberate (most screens were generated against one contract).

## Screen anatomy

A `app/(tabs)/<name>.tsx` screen typically:

1. Imports: `useProfile`, `useOnline`, `formatRupiah` (from `lib/format`), `parseNum` (from
   `lib/number`), `supabase`, Feather icons.
2. `const { width } = useWindowDimensions(); const isDesktop = width > 900;` (POS uses `> 1100`).
3. `const isManager = profile?.role === 'SUPERADMIN' || profile?.role === 'OWNER';`
4. Local `useState` for data + form; load in `useEffect` via `supabase.from(...)` (manager screens
   guard the load on `isManager`).
5. **Manager guard before the main render:** `if (!isManager) return <View style={styles.center}><Text style={styles.denied}>Akses Owner Diperlukan</Text></View>;`
   (Put hooks ABOVE this early return — never call a hook conditionally after it.)
6. Desktop multi-column / mobile stacked layout; `StyleSheet.create` at the bottom.

## Theme tokens

- Primary red `#DC2626` (dark `#991B1B`); near-black `#0F172A`; slate text `#1F2937 / #64748B`;
  muted `#94A3B8`; borders `#E2E8F0 / #E5E7EB`; surfaces `#F8FAFC / #F9FAFB / #FFF`.
- Status colors: PAID/positive green `#16A34A` on `#F0FDF4`/`#DCFCE7`; PARTIAL amber `#B45309` on
  `#FEF3C7`; UNPAID/negative red `#991B1B`/`#DC2626` on `#FEE2E2`/`#FEF2F2`.
- White rounded cards, **Feather** icons, uppercase tracked section labels.

## Shared helpers — use them, don't re-roll

- **`formatRupiah(n)`** from `lib/format.ts` — the single IDR formatter (one cached `Intl` instance,
  rounds). Do **not** paste `new Intl.NumberFormat('id-ID', …)` into a screen.
  *(Some older files predate this and still have a local copy; migrate them toward the shared one,
  don't add new copies.)*
- **`parseNum(str)`** from `lib/number.ts` — parse every user-entered numeric field with this (it
  tolerates `.`/`,` and junk). Never `Number(input)` directly.
- Dates: `new Date(iso).toLocaleString('id-ID', …)` (a shared date helper would be a fine future
  addition).

## Data access rules

- **Atomic multi-write → Postgres RPC.** Any operation that changes more than one row (a sale + its
  items + stock; a return + restock + refund; a purchase + stock + cost) **must** be one
  `supabase.rpc(...)` call, not a sequence of client writes. Add a new `create or replace function`
  to the right `db/*.sql` file. See [database.md](database.md).
- Single-row CRUD can use `insert/update/delete` directly.
- Independent reads → batch with `Promise.all` (see `pembelian`/`pelanggan`/`retur` loaders).

## Offline pattern

```tsx
import { useOnline } from '../../lib/offline/OfflineContext';
const online = useOnline();

// in JSX — disable the write/submit button:
<TouchableOpacity disabled={!online || saving} style={[styles.btn, !online && styles.btnDisabled]} onPress={save}>
  …
</TouchableOpacity>
{!online && <Text style={styles.offlineHint}>Tidak ada koneksi — penyimpanan dinonaktifkan.</Text>}

// and ALWAYS early-return in the handler too (disabled only covers the UI):
const save = async () => { if (!online) return; … };
```
For reads that should still render offline, wrap the fetch in `cachedFetch('stable:key', fetcher)`
from `lib/offline/cache.ts` (include filter/identity values in the key). Live search boxes are not
cached.

## Web / React Native Web notes

- Remove the focus ring on web inputs with `outlineStyle: 'none' as any` in the `TextInput` style.
- Need a real DOM element on web (e.g. an `<iframe>`) inside RN? Use
  `createElement('iframe', { … } as any)` guarded by `Platform.OS === 'web'`. For printing custom
  HTML, prefer the existing `printHtmlViaIframe` from `lib/printing`.
- `100vh`/web-only CSS values go through `Platform.OS === 'web' ? ({ … } as any) : null`.
- Browser-only deps (WebUSB/WebSerial, the ESC/POS encoder) are **dynamically imported** inside
  functions and guarded, so they never break the native bundle. Keep that.

## React / Expo notes

- `reactCompiler` is on — components auto-memoize. Manual `useMemo`/`useCallback` is fine where it
  clarifies intent (e.g. derived totals) but not required for perf.
- `typedRoutes` is on — `router.push('/(tabs)/<name>' as any)` is the accepted idiom here.
- Language of all user-facing copy: **Bahasa Indonesia**.

## Anti-patterns (don't)

- ❌ Re-implementing `formatRupiah` / debounced search / status pills / the offline button in each
  screen. Reach for the shared helper, or extract one if it doesn't exist yet.
- ❌ Client-side multi-step writes for an operation that must be atomic — use an RPC.
- ❌ Editing `db/atomic_pos.sql`/`business_features.sql` without telling the user to re-run it.
- ❌ `git add -A` / sweeping the user's parallel WIP into your commit. Stage explicit paths.
- ❌ Trusting client role checks for security — they're UX gating; the DB boundary is RLS
  (see the security note in [database.md](database.md)).

## Definition of done

`./node_modules/.bin/tsc --noEmit` is clean, the change matches these conventions, and any DB change
is noted for the user to re-run. There is no automated test suite — verify by clicking through
`npm run web` when feasible.
