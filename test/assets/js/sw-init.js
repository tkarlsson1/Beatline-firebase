// assets/js/sw-init.js
export function initSW(){
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('/service-worker.js').catch(()=>{});
  }
}
