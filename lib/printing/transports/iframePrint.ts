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

    iframe.onload = () => {
      setTimeout(() => {
        try {
          win.focus();

          const cleanup = () => {
            setTimeout(() => {
              iframe.remove();
              resolve();
            }, 500);
          };

          win.onafterprint = cleanup;

          win.print();

          setTimeout(cleanup, 3000);
        } catch (err) {
          iframe.remove();
          reject(err);
        }
      }, 200);
    };
  });
}