// assets/js/auth.js
export function initAuth(){
  const loginBtn = document.getElementById('loginBtn');
  if(loginBtn){
    loginBtn.addEventListener('click', ()=>{
      alert('Auth-modul kopplas in senare (Firebase/Anonymous/Email).');
    });
  }
}
