(function () {
  if (!window.ns) window.ns = {};

  // (Valfritt) Registrera service worker här om du inte redan gör det på annat ställe.
  // För att undvika dubbelregistrering: låt denna vara "best-effort".
  if ('serviceWorker' in navigator) {
    // Om samma register-anrop finns i en annan fil är det ofarligt – webbläsaren återanvänder.
    navigator.serviceWorker.register('/service-worker.js').catch(() => {});
  }

  // Hjälpare: hämta nuvarande användar-ID (stöd både ns.auth och gammal window.auth)
  function getUid() {
    // Firebase via vår nya modul:
    const uidFromNs = window.ns?.currentUser?.uid;
    if (uidFromNs) return uidFromNs;

    // Bakåtkompat: om något fortfarande använder window.auth:
    const uidFromLegacy = window.auth?.currentUser?.uid || window.window?.auth?.currentUser?.uid;
    if (uidFromLegacy) return uidFromLegacy;

    return null;
  }

  // Exponera ett litet API om något i legacy-koden ropar på auth
  window.ns.getUid = getUid;

  // (Exempel) – om du behöver kräva login i vissa vyer:
  // sätt window.ns.requireLogin = true i din init, och använd getUid()
  // för att avgöra om UI:t ska visa "du måste logga in".
})();
