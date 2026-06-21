// lib/printing/transports/iframePrint.ts
// Shared web primitive: print arbitrary HTML through a hidden iframe.
// This is the most robust "can-never-be-popup-blocked" way to print on the web —
// unlike window.open it needs no popup permission and survives an awaited build
// step before it. With Chrome/Edge launched as `--kiosk-printing` it prints
// silently; otherwise it surfaces the normal browser print dialog (the intended
// visible fallback). The promise resolves once the print job has been dispatched;
// the iframe is cleaned up on `afterprint` (with a safety timeout) so a cancelled
// dialog can never leave it dangling.

export async function printHtmlViaIframe(html: string): Promise<void> {
  if (typeof document === 'undefined') {
    throw new Error('iframePrint: no document');
  }

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  Object.assign(iframe.style, {
    position: 'fixed',
    right: '0',
    bottom: '0',
    width: '0',
    height: '0',
    border: '0',
  } as CSSStyleDeclaration);
  document.body.appendChild(iframe);

  const win = iframe.contentWindow;
  const doc = win?.document;
  if (!win || !doc) {
    iframe.remove();
    throw new Error('iframePrint: iframe document unavailable');
  }

  doc.open();
  doc.write(html);
  doc.close();

  const remove = () => {
    try {
      iframe.remove();
    } catch {
      /* already gone */
    }
  };
  // Remove once the print dialog/job completes.
  win.onafterprint = remove;

  await new Promise<void>((resolve, reject) => {
    const fire = () => {
      try {
        win.focus();
        win.print();
        // Safety net: afterprint may not fire if the dialog is dismissed.
        setTimeout(remove, 60000);
        resolve();
      } catch (e) {
        remove();
        reject(e);
      }
    };
    // Ensure the written document is laid out before printing.
    if (doc.readyState === 'complete') {
      setTimeout(fire, 0);
    } else {
      win.onload = fire;
    }
  });
}
