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

  const darkModeLink = document.createElement("a");
  darkModeLink.href = "#";
  darkModeLink.id = "darkModeToggle";
  darkModeLink.textContent = "Mörkt läge";
  darkModeLink.addEventListener("click", (e) => {
    e.preventDefault();
    toggleDarkMode();
    dropdownMenu.style.display = "none";
  });
  dropdownMenu.appendChild(darkModeLink);

  const spotifyLink = document.createElement("a");
  spotifyLink.href = "#";
  spotifyLink.id = "spotifyConnectionLink";
  spotifyLink.textContent = "Connect Spotify";
  spotifyLink.addEventListener("click", (e) => {
    e.preventDefault();
    handleSpotifyConnection();
    dropdownMenu.style.display = "none";
  });
  dropdownMenu.appendChild(spotifyLink);

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

  // Initialize dark mode from localStorage
  const isDarkMode = localStorage.getItem("darkMode") === "true";
  if (isDarkMode) {
    document.body.classList.add("dark-mode");
    darkModeLink.textContent = "Ljust läge";
  }

  // Update Spotify connection status
  updateSpotifyConnectionStatus();

  // Listen for Spotify player ready event
  window.addEventListener('spotifyPlayerReady', () => {
    updateSpotifyConnectionStatus();
  });
});

// ============================================
// DARK MODE TOGGLE
// ============================================
function toggleDarkMode() {
  const isDarkMode = document.body.classList.toggle("dark-mode");
  localStorage.setItem("darkMode", isDarkMode);

  const darkModeToggle = document.getElementById("darkModeToggle");
  if (darkModeToggle) {
    darkModeToggle.textContent = isDarkMode ? "Ljust läge" : "Mörkt läge";
  }
}

// ============================================
// SPOTIFY CONNECTION
// ============================================
function handleSpotifyConnection() {
  if (window.spotifyAuth && window.spotifyAuth.isAuthenticated()) {
    // Already connected - show status or offer to disconnect
    const shouldDisconnect = confirm('Spotify is already connected. Do you want to disconnect?');
    if (shouldDisconnect) {
      window.spotifyAuth.logout();
      if (window.spotifyPlayer) {
        window.spotifyPlayer.disconnect();
      }
      updateSpotifyConnectionStatus();
      alert('Disconnected from Spotify');
    }
  } else {
    // Not connected - start OAuth flow
    if (window.spotifyAuth) {
      window.spotifyAuth.authorize();
    } else {
      alert('Spotify authentication not available. Please reload the page.');
    }
  }
}

function updateSpotifyConnectionStatus() {
  const spotifyLink = document.getElementById("spotifyConnectionLink");
  if (!spotifyLink) return;

  if (window.spotifyAuth && window.spotifyAuth.isAuthenticated()) {
    // Check if player is also ready
    const playerReady = window.spotifyPlayer && window.spotifyPlayer.getDeviceId();
    if (playerReady) {
      spotifyLink.textContent = "Spotify Connected ✓";
      spotifyLink.style.color = "#1DB954"; // Spotify green
    } else {
      spotifyLink.textContent = "Spotify Connecting...";
      spotifyLink.style.color = "#FFA500"; // Orange
    }
  } else {
    spotifyLink.textContent = "Connect Spotify";
    spotifyLink.style.color = ""; // Reset to default
  }
}
