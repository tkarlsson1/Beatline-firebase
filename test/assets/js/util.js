// assets/js/util.js
export function safeHTML(str){
  return String(str).replace(/<script/gi,'&lt;script').replace(/<\/script>/gi,'&lt;/script>');
}
