// ============================================
// UI EVENT HANDLERS
// ============================================

document.addEventListener("DOMContentLoaded", function() {
  // Modal toggle handlers
  const showRegisterBtn = document.getElementById("showRegister");
  const showLoginBtn = document.getElementById("showLogin");
  if (showRegisterBtn) {
    showRegisterBtn.addEventListener("click", () => {
      document.getElementById("loginModal").style.display = "none";
      document.getElementById("registerModal").style.display = "flex";
    });
  }
  if (showLoginBtn) {
    showLoginBtn.addEventListener("click", () => {
      document.getElementById("registerModal").style.display = "none";
      document.getElementById("loginModal").style.display = "flex";
    });
  }
  
  // Readme Modal
  const readmeModal = document.getElementById("readmeModal");
  const closeBtn = document.querySelector(".closeBtn");
  closeBtn.addEventListener("click", function() {
    readmeModal.style.display = "none";
  });
  window.addEventListener("click", function(event) {
    if (event.target == readmeModal) {
      readmeModal.style.display = "none";
    }
  });
  
  // Edit Year Modal handlers
  document.getElementById("saveYearButton").addEventListener("click", function() {
    const newYear = document.getElementById("newYearInput").value.trim();
    if (!/^\d{4}$/.test(newYear)) {
      alert("Ange ett giltigt årtal med 4 siffror.");
      return;
    }
    updateCustomYear(window.currentPlaylistName, window.currentSpotifyID, newYear)
      .then(() => {
        closeEditYearModal();
      })
      .catch((error) => {
        console.error("Fel vid uppdatering av customYear:", error);
      });
  });
  
  document.getElementById("closeModal").addEventListener("click", function() {
    closeEditYearModal();
  });
});
