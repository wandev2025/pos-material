// lib/printing/print-iframe.ts
//
// This function was already correct as you wrote it — the once-guards,
// the onload + fallback-timer double-arming, and the onafterprint + 3s
// safety-net cleanup are all sound patterns for document.write iframes.
// Reproduced here unchanged so it lives alongside the rest of the fixed
// printing code.

export function printHtmlViaIframe(html: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement('iframe');

    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.visibility = 'hidden';

    // Guards so print/cleanup run exactly once even if both onload and the
    // fallback timer fire (document.write iframes have unreliable load timing).
    let printed = false;
    let done = false;

    const cleanup = () => {
      if (done) return;
      done = true;
      setTimeout(() => {
        iframe.remove();
        resolve();
      }, 500);
    };

    const doPrint = () => {
      if (printed) return;
      printed = true;

      const win = iframe.contentWindow;
      if (!win) {
        iframe.remove();
        reject(new Error('Cannot create iframe'));
        return;
      }

      try {
        win.focus();
        win.onafterprint = cleanup;
        win.print();
        // Safety net: some browsers never fire onafterprint (e.g. under
        // --kiosk-printing), so always clean up after a grace period.
        setTimeout(cleanup, 3000);
      } catch (err) {
        iframe.remove();
        reject(err);
      }
    };

    // Attach the load handler BEFORE writing the document. For iframes filled
    // via document.write the load event can fire immediately (or not at all),
    // so we also arm a fallback timer and let the once-guard dedupe them.
    iframe.onload = () => {
      setTimeout(doPrint, 200);
    };

    document.body.appendChild(iframe);

    const win = iframe.contentWindow;
    if (!win) {
      iframe.remove();
      reject(new Error('Cannot create iframe'));
      return;
    }

    const doc = win.document;
    doc.open();
    doc.write(html);
    doc.close();

    // Fallback: if onload never fires for the written document, print anyway.
    setTimeout(doPrint, 500);
  });
}