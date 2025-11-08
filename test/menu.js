// ============================================
// HAMBURGER MENU
// ============================================

document.addEventListener("DOMContentLoaded", function() {
  const menuContainer = document.createElement("div");
  menuContainer.id = "menuContainer";
  menuContainer.style.position = "fixed";
  menuContainer.style.top = "10px";
  menuContainer.style.right = "2vw";
  menuContainer.style.zIndex = "9999";
  menuContainer.style.width = "60px";
  
  const menuButton = document.createElement("button");
  menuButton.id = "menuButton";
  menuButton.innerHTML = "&#9776;";
  menuButton.style.background = "none";
  menuButton.style.border = "none";
  menuButton.style.color = "#fff";
  menuButton.style.fontSize = "2rem";
  menuButton.style.cursor = "pointer";
  menuButton.style.zIndex = "9999";
  menuContainer.appendChild(menuButton);
  
  const dropdownMenu = document.createElement("div");
  dropdownMenu.id = "dropdownMenu";
  dropdownMenu.style.display = "none";
  dropdownMenu.style.position = "absolute";
  dropdownMenu.style.right = "0";
  dropdownMenu.style.top = "2.5rem";
  dropdownMenu.style.background = "#032934";
  dropdownMenu.style.border = "1px solid #fff";
  dropdownMenu.style.borderRadius = "4px";
  dropdownMenu.style.zIndex = "9999";
  dropdownMenu.style.width = "max-content";
  
  const lasForstLink = document.createElement("a");
  lasForstLink.href = "#";
  lasForstLink.textContent = "Läs först";
  lasForstLink.addEventListener("click", (e) => {
    e.preventDefault();
    document.getElementById("readmeModal").style.display = "block";
    dropdownMenu.style.display = "none";
  });
  dropdownMenu.appendChild(lasForstLink);
  
  const startpageLink = document.createElement("a");
  startpageLink.href = "#";
  startpageLink.textContent = "Startsida";
  startpageLink.addEventListener("click", (e) => {
    e.preventDefault();
    goToFilter();
    dropdownMenu.style.display = "none";
  });
  dropdownMenu.appendChild(startpageLink);
  
  const managePlaylistsLink = document.createElement("a");
  managePlaylistsLink.href = "#";
  managePlaylistsLink.textContent = "Hantera spellistor";
  managePlaylistsLink.addEventListener("click", (e) => {
    e.preventDefault();
    window.openManagePlaylists && window.openManagePlaylists();
    dropdownMenu.style.display = "none";
  });
  dropdownMenu.appendChild(managePlaylistsLink);
  
  const logoutLink = document.createElement("a");
  logoutLink.href = "#";
  logoutLink.textContent = "Logga ut";
  logoutLink.addEventListener("click", (e) => {
    e.preventDefault();
    window.firebaseSignOut(window.auth)
      .then(() => {
        console.log("Utloggad!");
        document.getElementById("loginModal").style.display = "flex";
        dropdownMenu.style.display = "none";
      })
      .catch((error) => {
        console.error("Fel vid utloggning:", error);
      });
  });
  dropdownMenu.appendChild(logoutLink);
  
  menuContainer.appendChild(dropdownMenu);
  document.body.appendChild(menuContainer);
  
  menuButton.addEventListener("click", () => {
    dropdownMenu.style.display = dropdownMenu.style.display === "block" ? "none" : "block";
  });
  
  document.addEventListener("click", (event) => {
    if (!menuContainer.contains(event.target)) {
      dropdownMenu.style.display = "none";
    }
  });
});
