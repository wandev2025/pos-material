// POS Material - Local Print Agent
// -----------------------------------------------------------------------------
// A tiny HTTP server that the web/native app talks to (via the AGENT transport)
// when it wants the OS to print silently to a *named* printer.
//
// It replaces the old fragile "download a .bat and eval a node one-liner"
// approach with a real, versioned package you `npm install && npm start`.
//
// Endpoints (all CORS-enabled, all logged):
//   GET  /health -> { ok: true }
//   GET  /list   -> [{ name }]                    (installed printers)
//   POST /print  -> { printer, format, data }     (format: 'raw' | 'pdf' | 'html')
//
// Transport contract (see lib/printing/transports/agent.ts):
//   - THERMAL    sends format 'raw'  with base64 ESC/POS bytes
//   - FAKTUR/DO  send  format 'html' with the document HTML
//   - 'pdf' is also accepted for completeness (base64 PDF bytes)
//
// IMPORTANT - raw printing limitation (read agent/README.md):
//   Sending RAW bytes to a *named* Windows printer without a native spooler
//   binding is best-effort. We do it by copying the bytes to the printer's
//   Windows share (`copy /b <tmp.bin> \\localhost\<ShareName>`), which requires
//   the printer to be shared under a name that matches `printer`. The robust,
//   recommended path for ESC/POS thermal printing is WebUSB / WebSerial from
//   the browser; the AGENT raw path exists only as a fallback.
// -----------------------------------------------------------------------------

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import cors from 'cors';
import express from 'express';
import ptp from 'pdf-to-printer';

const PORT = 3001;

const app = express();
app.use(cors()); // allow all origins - the agent only ever runs on localhost
app.use(express.json({ limit: '25mb' })); // HTML/PDF/base64 payloads can be large

// --- brief request logging -------------------------------------------------
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// --- helpers ---------------------------------------------------------------

// Run a child process and resolve when it exits 0, reject otherwise.
function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { windowsHide: true });
    let stderr = '';
    child.stderr?.on('data', d => (stderr += d.toString()));
    child.on('error', reject);
    child.on('close', code =>
      code === 0 ? resolve() : reject(new Error(`${cmd} exited with code ${code}${stderr ? `: ${stderr.trim()}` : ''}`))
    );
  });
}

// Locate a locally installed Chrome or Edge to render HTML -> PDF headlessly.
function findBrowser() {
  const env = process.env;
  const candidates = [
    env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Google\\Chrome\\Application\\chrome.exe'),
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Microsoft\\Edge\\Application\\msedge.exe'),
  ].filter(Boolean);
  return candidates.find(p => existsSync(p)) || null;
}

// Build a unique temp file path with the given extension.
function tmpPath(ext) {
  return path.join(os.tmpdir(), `pos-print-${randomUUID()}.${ext}`);
}

// Best-effort delete; never throws.
async function cleanup(...files) {
  for (const f of files) {
    if (!f) continue;
    try {
      await fs.unlink(f);
    } catch {
      /* ignore */
    }
  }
}

// --- routes ----------------------------------------------------------------

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/list', async (_req, res) => {
  try {
    const printers = await ptp.getPrinters();
    // Normalise to the { name } shape the app expects.
    res.json((printers || []).map(p => ({ name: p.name })));
  } catch (e) {
    console.error('list error:', e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post('/print', async (req, res) => {
  const { printer, format, data } = req.body || {};

  if (!format || data == null) {
    return res.status(400).json({ ok: false, error: 'Missing "format" or "data".' });
  }

  try {
    switch (format) {
      case 'raw':
        await printRaw(printer, data);
        break;
      case 'pdf':
        await printPdf(printer, data);
        break;
      case 'html':
        await printHtml(printer, data);
        break;
      default:
        return res.status(400).json({ ok: false, error: `Unknown format "${format}" (expected raw|pdf|html).` });
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('print error:', e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// --- format handlers -------------------------------------------------------

// RAW ESC/POS bytes -> named printer. Best-effort (see file header / README).
async function printRaw(printer, base64) {
  if (!printer) throw new Error('RAW printing requires a "printer" (share) name.');
  const bin = tmpPath('bin');
  try {
    await fs.writeFile(bin, Buffer.from(base64, 'base64'));
    // copy /b sends the file verbatim (no driver re-processing) to the printer's
    // Windows share. The printer must be shared with a share name == `printer`.
    // copy is a cmd builtin, so we invoke it through cmd /c. Passing args as an
    // array keeps names-with-spaces intact without manual quoting.
    const share = `\\\\localhost\\${printer}`;
    await run('cmd', ['/c', 'copy', '/b', bin, share]);
  } finally {
    await cleanup(bin);
  }
}

// base64 PDF -> temp .pdf -> print to named printer.
async function printPdf(printer, base64) {
  const pdf = tmpPath('pdf');
  try {
    await fs.writeFile(pdf, Buffer.from(base64, 'base64'));
    await ptp.print(pdf, printer ? { printer } : {});
  } finally {
    await cleanup(pdf);
  }
}

// HTML string -> temp .html -> headless Chrome/Edge --print-to-pdf -> print.
async function printHtml(printer, html) {
  const browser = findBrowser();
  if (!browser) {
    throw new Error(
      'No Chrome/Edge found for HTML->PDF rendering. Install Google Chrome or Microsoft Edge, ' +
        'or set CHROME_PATH to the browser executable.'
    );
  }
  const htmlFile = tmpPath('html');
  const pdf = tmpPath('pdf');
  try {
    await fs.writeFile(htmlFile, html, 'utf8');
    // Headless render to PDF. Unknown flags (e.g. --no-margins) are ignored
    // safely by Chrome; they are kept per the agent spec.
    await run(browser, ['--headless', '--disable-gpu', '--no-margins', `--print-to-pdf=${pdf}`, htmlFile]);
    await ptp.print(pdf, printer ? { printer } : {});
  } finally {
    await cleanup(htmlFile, pdf);
  }
}

// --- start -----------------------------------------------------------------

app.listen(PORT, () => {
  console.log(`POS print agent listening on http://localhost:${PORT}`);
  console.log('Endpoints: GET /health, GET /list, POST /print');
  const browser = findBrowser();
  console.log(browser ? `HTML rendering via: ${browser}` : 'WARNING: no Chrome/Edge found (HTML printing disabled).');
});
