# POS Material - Local Print Agent

A small HTTP server that lets the POS Material app print **silently to a named
printer** from the machine where the printer is attached. It replaces the old
"download a `.bat` file" approach with a real, installable Node package.

The app talks to it through the `AGENT` transport
(`lib/printing/transports/agent.ts`, base URL `http://localhost:3001`). The
agent is one link in an automatic fallback chain — if it is **offline the app
falls back to the normal browser print dialog**, so printing never hard-fails.

## Prerequisites

- **Node.js 18+**
- **Windows** (raw/named-printer printing and the bundled `pdf-to-printer`
  helper target Windows)
- **Google Chrome or Microsoft Edge** installed — required only for the
  `html` format, which is rendered to PDF in headless mode. (You can also point
  the agent at a specific browser with the `CHROME_PATH` environment variable.)

## Install & run

```bash
cd agent
npm install
npm start
```

You should see:

```
POS print agent listening on http://localhost:3001
```

Leave this window open while you use the app. (To auto-start it on login, add a
Task Scheduler entry or a shortcut to `npm start` in your Startup folder.)

## Endpoints

All endpoints are CORS-enabled for every origin (the agent only ever listens on
localhost) and each request is logged to the console.

| Method | Path      | Description |
| ------ | --------- | ----------- |
| `GET`  | `/health` | Liveness check. Returns `{ "ok": true }`. |
| `GET`  | `/list`   | Lists installed printers as `[{ "name": "..." }]` via `pdf-to-printer`. |
| `GET`  | `/ports`  | Port/device discovery for Setup's detection hint. See below. |
| `POST` | `/print`  | Prints a document. Body: `{ printer, format, data }`. |

### `GET /ports`

Returns what the OS can actually see, so the app can tell the user whether
pairing will work **before** they open the browser picker:

```json
{
  "serial": [{ "path": "COM3", "vendorId": "1504", "productId": "0011", "manufacturer": "BIXOLON" }],
  "usb":    [{ "name": "USB Printing Support", "service": "usbprint", "vendorId": "1504", "productId": "0011" }]
}
```

- **`serial`** — every serial/COM port, via the `serialport` package
  (cross-platform). Includes USB-to-serial / virtual-COM devices, with USB
  vendor/product metadata where available. This is what **WebSerial** can see.
- **`usb`** — **Windows only**: USB devices bound to the `usbprint` or `WINUSB`
  driver service (queried from PnP via PowerShell). The `service` field is the
  diagnosis: `usbprint` = normal Windows printer driver → invisible to
  WebSerial and **unclaimable by WebUSB** (needs the Zadig/WinUSB swap);
  `WINUSB` = ready for WebUSB. Empty on macOS/Linux.

The endpoint never 500s — if one half fails it reports `serialError` /
`usbError` alongside whatever the other half found.

### `POST /print` formats

`data` is the document payload; `printer` is the target printer/share name.

- **`raw`** — `data` is **base64-encoded ESC/POS bytes**. Used for THERMAL
  receipts. The bytes are written to a temp `.bin` and copied verbatim to the
  printer (see limitation below).
- **`pdf`** — `data` is a **base64-encoded PDF**. Written to a temp `.pdf` and
  printed to `printer`.
- **`html`** — `data` is an **HTML string**. Written to a temp `.html`,
  rendered to PDF with headless Chrome/Edge
  (`--headless --disable-gpu --no-margins --print-to-pdf=...`), then printed to
  `printer`. Used for FAKTUR and DO (Surat Jalan) documents.

All temp files are cleaned up after each request.

Success responds `{ "ok": true }`; failures respond with a non-2xx status and
`{ "ok": false, "error": "..." }`.

## Known limitation: raw printing to a named printer

Sending **raw ESC/POS bytes to a *named* Windows printer** without a native
spooler binding is inherently **best-effort**. This agent does it by copying the
bytes to the printer's Windows share:

```
copy /b <temp.bin> \\localhost\<ShareName>
```

For this to work the thermal printer must be **shared in Windows** with a share
name that **exactly matches** the `printer` value sent by the app
(Printer properties → *Sharing* → *Share this printer*).

> **Recommended thermal path:** for reliable, driver-free ESC/POS printing use
> the **WebUSB** or **WebSerial** transports directly from the browser. The
> agent's `raw` path exists only as a fallback for environments where WebUSB /
> WebSerial are unavailable.

`pdf` and `html` printing go through `pdf-to-printer` and do not have this
limitation.

## Recommended setup

> **Everything below is just today's default deployment. Nothing about a
> specific printer is hardcoded** — the transport, target device and paper size
> for each document (THERMAL / FAKTUR / DO) are all stored in settings and
> changed from the app's **Setup → Printers** screen. Swapping a printer brand,
> moving to an 80 mm thermal, or re-pairing a device is a settings operation
> only, no code change and no agent change required.

Current hardware:

- **struk (THERMAL receipt) — Bixolon SRP-275III** (impact, ESC/POS, 76 mm =
  40 columns, USB + Serial).
  - Install the **Bixolon driver** and share/name the printer in Windows.
  - Print via this agent using the **`raw`** format to its Windows name
    (share name must match the `printer` value — see the limitation above),
    **or** drive it directly from the app over **WebSerial / WebUSB** (the
    recommended, driver-free thermal path).
- **faktur / DO (Surat Jalan) — Epson LX-310** (80-column dot matrix, USB).
  - Install the **Epson driver** and name the printer in Windows.
  - Print via this agent using the **`html`** format (or **`pdf`**) to its
    Windows name, **or** set it as the browser's default printer and use the
    app's **kiosk** transport (Chrome/Edge launched with `--kiosk-printing`
    prints silently).

To switch to different hardware or a different paper width (58 / 76 / 80 mm),
just change the per-document transport, device and paper profile in the app's
Setup screen — the agent serves whatever named printer the app asks for.

## Offline behaviour

If the agent is not running, the app's `AGENT` transport reports unavailable and
the fallback chain continues to the next transport — ultimately the browser
print **dialog** — so the user can always still print.
