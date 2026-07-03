# Printing

How the POS prints, why it's built this way, and how to make it print **silently with a single click** (no browser dialog, no double-click).

---

## TL;DR

- A web page **cannot print silently on its own** — the browser always shows a print dialog. To get one-click printing you must escape that sandbox.
- The app has a **transport layer**: each document type (struk / faktur / surat jalan) is mapped to a printing **method**, configured per-shop in **Setup → Printer (Hardware)**. If the chosen method isn't available, it automatically falls back down a chain that always ends in the safe browser dialog — so printing **never hard-fails**.
- For this shop's hardware:
  - **Struk → Bixolon SRP-275III**: use **WebSerial** (raw ESC/POS straight to the printer → no dialog, ever). ⚠️ WebSerial only sees **COM/serial ports** — a USB-attached SRP-275III on the normal Bixolon printer driver is *not* a COM port and the picker will be **empty**. Use the serial cable / Bixolon's virtual-COM USB mode, or fall back to WEBUSB (WinUSB swap) or AGENT.
  - **Faktur / Surat Jalan → Epson LX-310**: use **Kiosk** + run the browser with `--kiosk-printing` and set the LX-310 as the **default** printer (→ prints instantly to default, no dialog).
- ⚠️ **Pairing is per browser profile and per URL, not per machine.** Do the pairing **inside the final kiosk-shortcut browser profile, on the final POS URL** — pairing done in your normal browser (or on `localhost` during dev) does not carry over.
- Everything is a **setting**, not code. Swapping printers or paper size is done entirely in Setup.

---

## The core constraint

Browsers deliberately forbid a web page from printing without user confirmation. `window.print()` (and our iframe equivalent) opens the OS/browser **Print** dialog — the panel with "Destination / Save as PDF / Layout / Save". That dialog *is* the "double-click" annoyance: click the print button in the app → dialog → click Save/Print again.

There are only a few ways out of that sandbox, and the app supports them all behind one switch:

| Method (transport) | Silent? | Good for | Needs |
|---|---|---|---|
| **WEBSERIAL** | ✅ always | Struk (ESC/POS) | one-time pair; Chrome/Edge; serial/COM printer |
| **WEBUSB** | ✅ always | Struk (ESC/POS) | one-time pair; Chrome/Edge; **WinUSB driver swap** on Windows |
| **AGENT** | ✅ always | any → a named OS printer | the local `agent/` helper running |
| **KIOSK** | ✅ *with* `--kiosk-printing`, else shows dialog | Faktur / DO (full-page HTML) | browser launched with the flag |
| **DIALOG** | ❌ shows the browser dialog | universal safety net | nothing |

---

## Architecture

```
pos.tsx  ──►  printDocument({ docType, settings, sale, items, config })
                       │   (lib/printing/index.ts)
                       │
        builds HTML (generatePrintHtml) and, for THERMAL, ESC/POS bytes
                       │
        order = [ configured transport, ...fallback chain ]   (dedup)
                       │
        for each transport in order:
            if transport.isAvailable() → transport.print(job) → STOP on success
                       │
        DIALOG is always available and always last → a result is always produced
```

- **`lib/printing/index.ts`** — `printDocument()` orchestrates everything and returns `{ ok, via, tried }`.
- **`lib/printing/types.ts`** — the shared contract: `DocType`, `TransportId`, `DocConfig`, `PrintConfig`, the default config, the fallback chains, and the paper→columns table.
- **`lib/printing/transports/*`** — one file per method (`dialog`, `kiosk`, `webserial`, `webusb`, `agent`) plus `iframePrint.ts` (shared hidden-iframe printer used by KIOSK and DIALOG).
- **`lib/printing/escpos.ts`** — builds the raw ESC/POS receipt for the struk using `@point-of-sale/receipt-printer-encoder`.
- **`lib/printTemplates.ts`** — `generatePrintHtml()` produces the HTML for all three documents (reused by the HTML transports and the in-app preview).
- **`lib/printerStore.ts`** — stores the paired WebUSB/WebSerial device id on the **local machine** (`savePairedDevice` / `getPairedDevice` / `clearPairedDevice`).

### Fallback chains (exact)

```
THERMAL → [ configured ] → WEBSERIAL → WEBUSB → AGENT → KIOSK → DIALOG
FAKTUR  → [ configured ] → KIOSK → AGENT → DIALOG
DO      → [ configured ] → KIOSK → AGENT → DIALOG
```

The configured transport is tried first. The rest are a safety net. Because `DIALOG.isAvailable()` is always `true` and it's always last, `printDocument` can never return "nothing happened".

---

## The two documents and the two printers

| Document | Printer | Tech | Print path |
|---|---|---|---|
| **Struk / receipt** (`THERMAL`) | **Bixolon SRP-275III** | 9-pin **impact**, 76 mm roll, ESC/POS, USB+Serial | raw ESC/POS via **WebSerial / WebUSB / Agent** |
| **Faktur** (`FAKTUR`) | **Epson LX-310** | 9-pin dot-matrix, 80-col, ESC/P, USB | full-page **HTML** via **Kiosk / Agent** |
| **Surat Jalan** (`DO`) | **Epson LX-310** (shared) | same as Faktur | full-page **HTML** via **Kiosk / Agent** |

> The SRP-275III is a **Bixolon** model (often mistaken for Epson) and is **impact, not thermal** — it uses a ribbon. It is ESC/POS-compatible, so the raw path works the same as any thermal receipt printer. Install **Bixolon's** Windows driver for it, and **Epson's** for the LX-310.

Receipt-style printers (ESC/POS) can be driven raw byte-for-byte. Full-page documents (rich HTML tables, signatures) cannot be expressed as ESC/POS, so they go through the browser's renderer (Kiosk) or are rendered to PDF by the Agent.

---

## The transports in detail

### DIALOG (default, universal fallback)
Prints the document HTML through a hidden `<iframe>` and calls `print()`. Without the kiosk flag this shows the normal browser **Print** dialog (the screenshot you saw). It can never be popup-blocked and never fails — that's why it's the terminal fallback. **It is the default for the struk out of the box**, which is exactly why you currently see the dialog: nothing has been configured yet.

### KIOSK
Identical mechanism to DIALOG (hidden iframe → `print()`), but intended to be paired with the browser's `--kiosk-printing` flag so the dialog is skipped and it prints **silently to the default printer**. This is the path for **Faktur / Surat Jalan** on the LX-310.

### WEBSERIAL  ← recommended for the struk *(when the printer is a COM port)*
Talks to the printer over the Web Serial API (`navigator.serial`) and writes raw ESC/POS bytes directly. **No browser print system involved → no dialog, instant.** On Windows it uses the OS serial/COM driver, so it **avoids the WinUSB driver swap** that WebUSB needs. Identity is keyed by `usbVendorId:usbProductId` (Web Serial exposes no serial number).

**The catch: Web Serial only enumerates serial/COM ports.** A printer plugged in over **USB** with its normal Windows *printer* driver (Bixolon's included) is a USB printer-class device handled by `usbprint.sys` — it is **not a COM port**, so the pairing picker shows an **empty list**. The SRP-275III appears as a COM port only if it is:
- connected via its **RS-232 serial cable** (the SRP-275III has both USB and serial), or
- connected via USB with Bixolon's **"Virtual COM (USB2Serial)" mode / VCOM driver** installed, or
- behind any USB-to-serial adapter the OS gives a COM port.

Check **Device Manager → Ports (COM & LPT)**: if the printer isn't listed there, WebSerial cannot see it — use WEBUSB (with the WinUSB swap) or AGENT instead. (If the local agent is running, Setup does this check for you: the **Port Terdeteksi** hint on the method card lists the COM ports the OS reports, or warns when there are none.)

### WEBUSB
Same idea over the WebUSB API (`navigator.usb`), keyed by the device **serial number** (preferred) and reconnected silently via `navigator.usb.getDevices()`. The catch on Windows: WebUSB can only claim a printer if its interface uses the **WinUSB** driver. If Windows loaded the normal printer-class/vendor driver, you must swap it (e.g. with **Zadig**) — which then removes the printer from the normal Windows print spooler. Prefer **WebSerial** unless WebUSB is the only option.

### AGENT
Talks to a small local HTTP helper (`agent/`, `http://localhost:3001`) that prints to a **named OS printer**. The web app sends the job; the agent prints it: `raw` ESC/POS for the struk, or `html`/`pdf` (rendered via headless Chrome) for full-page docs. Use this if you want to route to OS printers by name without WebSerial/WebUSB, or from a non-Chromium browser. Costs you a background process to keep running.

---

## Configuration model

Configuration lives in two places:

1. **Shop-wide** → `print_settings.print_config` (a `jsonb` column). Shape:
   ```json
   {
     "THERMAL": { "transport": "WEBSERIAL", "paper": "76mm" },
     "FAKTUR":  { "transport": "KIOSK" },
     "DO":      { "transport": "KIOSK" }
   }
   ```
   - `transport`: one of `WEBUSB | WEBSERIAL | AGENT | KIOSK | DIALOG`
   - `printer`: the OS printer name (only used by the `AGENT` transport)
   - `paper`: `58mm | 76mm | 80mm` (THERMAL only) → text columns `32 | 40 | 48`
   - Default (`DEFAULT_PRINT_CONFIG`): struk = `DIALOG`/`76mm`, faktur & DO = `KIOSK`.

2. **Local** → the paired WebUSB/WebSerial device id, stored in `localStorage` via `printerStore`, alongside the device-permission grant the browser records when you pick the device. **Both are scoped to the browser profile AND the origin (URL)** — not the machine. Consequences:
   - Different cashier PCs pair their own printers (good — that's the intent).
   - A browser launched with `--user-data-dir=…` is a **different profile** → it has no pairing. Pair inside it.
   - Moving from `http://localhost:8081` (dev) to the production URL is a **different origin** → pair again.
   - Chrome and Edge don't share pairings either.

### The Setup screen

**Setup → Printer (Hardware)** renders one editable card per document with:

- **Metode** — pick the transport.
- **Pilih Printer (Agent)** — appears when method is `AGENT`; lists OS printers from the agent.
- **Port Terdeteksi / Perangkat USB Terdeteksi (via Agent)** — appears when method is `WEBUSB`/`WEBSERIAL` and the local agent is running: shows the COM ports (WEBSERIAL) or USB printer devices + their driver (WEBUSB) the OS can actually see, *before* you try pairing. "Tidak ada COM port" here explains an empty pairing picker; a `usbprint` USB device explains why WebUSB can't claim it. Purely a hint — pairing works without the agent.
- **Perangkat Terpasang** + **Pasang Printer** / **Lupakan** — appears when method is `WEBUSB`/`WEBSERIAL`; pairs or forgets the device.
- **Ukuran Kertas** — `58 / 76 / 80 mm` (struk only).
- **Test Print** — prints a small dummy document through the exact same pipeline.
- **SIMPAN MAPPING** — saves `print_config` to the database.

Because every field is editable here, **swapping a printer or changing paper size is a Setup operation — never a code change.**

---

## `--kiosk-printing` explained

This is the single most important thing for silent full-page printing.

### What it is
`--kiosk-printing` is a **command-line flag** for Chrome / Chromium / Edge. When the browser is started with it, any `window.print()` call (including our hidden-iframe print) **skips the print preview dialog entirely and prints immediately to the system default printer**. No "Save as PDF", no Layout choice, no second click.

- Without the flag: app print → **dialog** → user clicks Save/Print. (Two actions — the thing you want to avoid.)
- With the flag: app print → **printed.** (One action.)

It does **not** require full-screen kiosk mode (`--kiosk`). The two flags are independent; you only need `--kiosk-printing` for silent printing.

### Why we still need it (even with WebSerial)
WebSerial/WebUSB give silent printing for the **struk** because they bypass the browser's print system with raw bytes. But **Faktur and Surat Jalan are full-page HTML** — there is no raw byte stream for those; they must go through the browser's renderer. `--kiosk-printing` is what makes *that* path silent.

### The default-printer rule (important)
Kiosk printing always sends to the **system default printer** — you cannot pick a printer per job. So:

- Set the **Epson LX-310 as the Windows default printer** (Settings → Bluetooth & devices → Printers & scanners → LX-310 → Set as default; and turn **off** "Let Windows manage my default printer").
- The **struk does not use kiosk** (it uses WebSerial raw), so there is **no conflict** — the LX-310 being default only affects the full-page docs.
- Set the LX-310's **paper/form size** in its Windows driver defaults (e.g. the continuous form / half-folio you use), because kiosk printing uses the printer's default paper.

### Set it up on Windows
Edit the browser shortcut's **Target** to append the flag, and use a **separate profile** so the flag isn't ignored by an already-running browser instance:

**Chrome:**
```
"C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk-printing --user-data-dir="C:\pos-profile" https://your-pos-url
```

**Edge:**
```
"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --kiosk-printing --user-data-dir="C:\pos-profile" https://your-pos-url
```

Then **always open the POS from this shortcut.**

### Gotchas
- **An already-running browser ignores new flags.** If Chrome is already open (same profile), launching the shortcut just opens a tab in the existing, non-kiosk process. The `--user-data-dir` above forces a separate instance so the flag always applies. (Alternatively, fully quit Chrome first.)
- **A separate profile starts empty.** No logins, no `localStorage`, no device permissions — so any WebSerial/WebUSB pairing done in your normal browser does **not** exist here. Do the pairing (and the Supabase login) from inside this shortcut's window.
- **It affects every print in that window** — fine for a dedicated POS machine; don't use that shortcut for general browsing.
- **Secure context** — WebSerial/WebUSB and reliable printing need `https://` (or `http://localhost` in development).

---

## Recommended setup for this shop (step by step)

> **Order matters.** Create and use the kiosk-printing shortcut **first**, and do all pairing from
> inside it. Pairing is stored per browser profile + URL; a printer paired in your everyday browser
> simply does not exist in the `--user-data-dir` kiosk profile.

1. **Run** `db/print_settings.sql` (Supabase Dashboard → SQL Editor). Idempotent: creates the
   `print_settings` table if needed, adds the `print_config` column and seeds defaults.
2. **Install drivers** on the POS PC: Bixolon driver for the SRP-275III, Epson driver for the
   LX-310. Set the **LX-310 as the default printer**.
3. **Decide how the SRP-275III connects** (this decides the struk method):
   - **Serial/COM path (preferred):** connect the serial cable, or install Bixolon's virtual-COM
     USB mode. Confirm the printer shows under **Device Manager → Ports (COM & LPT)** → you'll use
     **WEBSERIAL**.
   - **No COM port available:** use **WEBUSB** (one-time Zadig WinUSB swap) or **AGENT**.
4. **Create the kiosk shortcut** (`--kiosk-printing --user-data-dir=…`, see above) and **open the
   POS from it**. Log in. From now on, always use this shortcut.
5. **Struk (inside the kiosk browser):** Setup → Printer (Hardware) → **Struk / Thermal** → Metode =
   **WEBSERIAL** (or the fallback from step 3) → **Pasang Printer** → choose the SRP-275III →
   Ukuran Kertas = **76mm** → **Test Print** → **SIMPAN MAPPING**.
6. **Faktur & Surat Jalan:** leave Metode = **KIOSK** on both (the default) → **SIMPAN MAPPING**.
7. Done: struk prints raw and instant; faktur/DO print silently to the LX-310. No dialog, single click.

---

## Pairing & silent reconnect

- **Pairing** must happen from a button press (browser requirement) — that's the **Pasang Printer** button. It shows the OS device/port picker; you choose the printer once.
- The chosen device id is stored locally. On every later print, the transport **reconnects silently** (`navigator.usb.getDevices()` / `navigator.serial.getPorts()`) with **no picker** — this is the "recognise the device and print straight away" behaviour.
- **Pairing is scoped to the browser profile + origin**, because both halves of it live in the browser: the device id in `localStorage`, the permission grant in the profile's site settings. Pair once **per profile per URL** — concretely: inside the kiosk shortcut's profile, on the production URL. Switching profile, browser, or URL means pairing again (30 seconds, one time).
- **Forget** (Lupakan) clears the stored id so you can pair a different unit — this is how you swap hardware.
- **Browser support:** WebSerial/WebUSB are **Chromium-only** (Chrome / Edge). Not Safari, not Firefox. They also require a **secure context** (`https://` or `localhost`).

---

## ESC/POS & paper width

The struk is generated as raw ESC/POS by `buildThermalEscPos()` using `@point-of-sale/receipt-printer-encoder`. The **column count is derived from the paper setting** (`PAPER_COLUMNS`):

| Paper | Columns |
|---|---|
| 58 mm | 32 |
| 76 mm (SRP-275III) | 40 |
| 80 mm thermal | 48 |

Nothing is hardcoded — change **Ukuran Kertas** in Setup and the receipt re-flows to the new width. This is what lets you move to a true 80 mm thermal later with no code change.

> Note: the WebSerial/WebUSB transports are implemented **directly on `navigator.serial` / `navigator.usb`** (reconnect-by-serial, claim the printer-class bulk-OUT endpoint). We do **not** depend on the `@point-of-sale/webusb-receipt-printer` package — only the encoder is a dependency.

---

## The local Agent (optional)

Folder: `agent/`. A small Node + Express server on `http://localhost:3001`.

| Endpoint | Purpose |
|---|---|
| `GET /health` | liveness check used by Setup's status indicator |
| `GET /list` | enumerate OS printers (for the AGENT printer chooser) |
| `GET /ports` | enumerate serial/COM ports (`serialport`) + Windows USB printer devices with their bound driver (`usbprint` vs `WINUSB`) — powers Setup's detection hint |
| `POST /print` | `{ printer, format, data }` — `format`: `raw` (base64 ESC/POS) / `pdf` (base64) / `html` (rendered to PDF via headless Chrome, then printed) |

Run it on the POS PC:
```
cd agent
npm install
npm start
```
Use the AGENT transport when you want to route to OS printers by name (or print from a non-Chromium browser). The old downloadable `.bat` "driver" still exists in Setup but the `agent/` folder is the recommended, more robust replacement. Note: raw-to-named-printer on Windows is best-effort — WebSerial/WebUSB is the preferred struk path.

---

## In-app preview

In the print modal (after a sale, or via the history **reprint** button), each option has an **eye** button. It opens a preview of **exactly what will be printed**:

- **Web:** the real `generatePrintHtml(...)` output for that document + the actual sale, rendered in an `<iframe>` (true WYSIWYG).
- **Native:** the layout previews from `components/PrintPreviews.tsx`.

The preview has a **Cetak Sekarang** button that prints through the same `printDocument` pipeline. The preview is in-app and separate from the OS print dialog.

---

## File map

| Path | What |
|---|---|
| `lib/printing/index.ts` | `printDocument()` + transport registry + re-exports |
| `lib/printing/types.ts` | contract, defaults, fallback chains, paper→columns |
| `lib/printing/escpos.ts` | ESC/POS receipt builder |
| `lib/printing/transports/iframePrint.ts` | shared hidden-iframe printer |
| `lib/printing/transports/{dialog,kiosk,webserial,webusb,agent}.ts` | the five transports |
| `lib/printTemplates.ts` | `generatePrintHtml()` (HTML for all docs) |
| `lib/printerStore.ts` | paired-device persistence |
| `app/(tabs)/setup.tsx` | the Printer (Hardware) configuration UI |
| `app/(tabs)/pos.tsx` | calls `printDocument`; print modal + preview |
| `components/PrintPreviews.tsx` | native preview components |
| `db/print_settings.sql` | `print_settings` table + `print_config jsonb` + seeded defaults |
| `agent/` | optional local print server |

---

## Troubleshooting

- **Still getting the browser Print dialog for the struk** → the struk is still on `DIALOG`. Set it to **WEBSERIAL** and pair (Setup → Printer (Hardware)).
- **Dialog still shows for Faktur/DO** → the browser isn't running with `--kiosk-printing`, or another (non-kiosk) browser instance was already open. Launch via the dedicated `--user-data-dir` shortcut.
- **Kiosk prints to the wrong printer** → kiosk always uses the **system default**; set the LX-310 as default and disable "Let Windows manage my default printer".
- **The WebSerial picker is empty / printer "not detected"** → Windows exposes no COM port for it. A USB printer on the normal printer driver is **not** a serial device. Check Device Manager → Ports (COM & LPT); use the serial cable / Bixolon virtual-COM mode, or switch to WEBUSB/AGENT. (The pairing toast now says exactly this.)
- **Paired before, but now "Belum ada perangkat" / falls back to dialog** → you're in a different browser profile or on a different URL than where you paired (typical after switching to the `--user-data-dir` kiosk shortcut, or from `localhost` to production). Pairing is profile+origin-local — re-pair from inside the browser/URL you actually use at the counter.
- **Pairing fails with a toast** → the toast now reports the real cause: unsupported browser (need Chrome/Edge), insecure context (need `https://` or `localhost` — a LAN IP over `http://` won't work), cancelled/empty picker, or the underlying browser error (name + message) for anything else.
- **WebUSB can't claim the printer (Windows)** → the printer is on the vendor/printer-class driver; switch to **WebSerial**, or do the WinUSB (Zadig) swap, or use the **Agent**.
- **Receipt text wraps / misaligned** → wrong **Ukuran Kertas**; the SRP-275III is **76mm (40 columns)**.
- **Safari / Firefox** → no WebSerial/WebUSB; those transports fall back to KIOSK/DIALOG. Use Chrome/Edge on the POS.

---

## Swapping hardware or paper later

All in **Setup → Printer (Hardware)**, no code change:

- **New struk printer** → Metode card → **Lupakan** the old device → **Pasang Printer** for the new one → adjust **Ukuran Kertas** if the width changed → **SIMPAN MAPPING**.
- **Move to a real 80 mm thermal** → set **Ukuran Kertas = 80mm** (and re-pair if it's a new device).
- **Different faktur printer** → set it as the Windows default (kiosk) or pick it under the **AGENT** method.
