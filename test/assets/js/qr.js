// assets/js/qr.js
// Lazy-load qrcode library from CDN only when needed.
export async function generateQR(container, text){
  // If offline, fallback to text
  try{
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js');
    /* global QRCode */
    new QRCode(container, {
      text,
      width: Math.min(320, container.clientWidth || 320),
      height: Math.min(320, container.clientWidth || 320),
      correctLevel: QRCode.CorrectLevel.M
    });
  }catch(e){
    container.textContent = text;
  }
}

function loadScript(src){
  return new Promise((resolve, reject)=>{
    const s = document.createElement('script');
    s.src = src; s.async = true; s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}
