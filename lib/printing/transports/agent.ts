// lib/printing/transports/agent.ts
// Talks to a local print-helper agent (e.g. the bridge on localhost:3001).
// THERMAL jobs are sent as base64 raw ESC/POS bytes; FAKTUR/DO jobs are sent
// as HTML for the agent to render to a full-page printer.

import { AGENT_URL } from '../types';
import type { DocConfig, PrintJob, Transport } from '../types';

const B64 =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

// Pure-JS base64 so this works in both web and native runtimes (Hermes has no
// global btoa).
function base64FromBytes(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out +=
      B64[(n >> 18) & 63] +
      B64[(n >> 12) & 63] +
      B64[(n >> 6) & 63] +
      B64[n & 63];
  }
  const rem = bytes.length - i;
  if (rem === 1) {
    const n = bytes[i] << 16;
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + '==';
  } else if (rem === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + '=';
  }
  return out;
}

async function pingOk(path: string): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 800);
  try {
    const res = await fetch(AGENT_URL + path, { signal: ctrl.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// Liveness probe for the Setup status indicator (single request).
export async function pingAgent(): Promise<boolean> {
  if (await pingOk('/health')) return true;
  return pingOk('/list');
}

export async function listAgentPrinters(): Promise<{ name: string }[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 800);
  try {
    const res = await fetch(AGENT_URL + '/list', { signal: ctrl.signal });
    if (!res.ok) return [];
    const data: any = await res.json();
    const arr = Array.isArray(data)
      ? data
      : Array.isArray(data?.printers)
        ? data.printers
        : [];
    return arr
      .map((p: any) => (typeof p === 'string' ? { name: p } : { name: String(p?.name ?? '') }))
      .filter((p: { name: string }) => p.name.length > 0);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export const agentTransport: Transport = {
  id: 'AGENT',

  async isAvailable(_cfg: DocConfig): Promise<boolean> {
    if (await pingOk('/health')) return true;
    return pingOk('/list');
  },

  async print(job: PrintJob): Promise<void> {
    let body: any;
    if (job.docType === 'THERMAL') {
      if (!job.escpos) throw new Error('agent: no ESC/POS data for THERMAL');
      body = {
        printer: job.config.printer,
        format: 'raw',
        data: base64FromBytes(job.escpos),
      };
    } else {
      body = {
        printer: job.config.printer,
        format: 'html',
        data: job.html,
      };
    }

    const res = await fetch(AGENT_URL + '/print', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error('agent: print failed (' + res.status + ')');
  },
};
