// ============================================
// LOBBY.JS - PART 1: HELPER FUNCTIONS & CONSTANTS
// ============================================

// ============================================
// CONSTANTS
// ============================================

// Team colors (max 8 teams)
const TEAM_COLORS = [
  { name: 'blue', hex: '#4285F4', label: 'Blå' },
  { name: 'red', hex: '#EA4335', label: 'Röd' },
  { name: 'green', hex: '#34A853', label: 'Grön' },
  { name: 'yellow', hex: '#FBBC04', label: 'Gul' },
  { name: 'purple', hex: '#9C27B0', label: 'Lila' },
  { name: 'orange', hex: '#FF6F00', label: 'Orange' },
  { name: 'pink', hex: '#E91E63', label: 'Rosa' },
  { name: 'teal', hex: '#009688', label: 'Turkos' }
];

// Timer limits (in seconds)
const TIMER_LIMITS = {
  guess: { min: 30, max: 360, default: 90 },
  challenge: { min: 5, max: 30, default: 10 },
  placeChallenge: { min: 10, max: 60, default: 20 },
  pauseBetweenSongs: { min: 5, max: 60, default: 10 }
};

// Max teams allowed
const MAX_TEAMS = 8;

// Max team name length
const MAX_TEAM_NAME_LENGTH = 20;

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Generate a random 6-character game ID
 * Format: ABC123 (uppercase letters and numbers)
 * @returns {string} 6-character game ID
 */
function generateGameId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let id = '';
  
  for (let i = 0; i < 6; i++) {
    const randomIndex = Math.floor(Math.random() * chars.length);
    id += chars.charAt(randomIndex);
  }
  
  console.log('[Lobby] Generated game ID:', id);
  return id;
}

/**
 * Generate a random 6-digit PIN code
 * Format: 123456 (6 numbers)
 * @returns {string} 6-digit PIN
 */
function generatePIN() {
  const pin = Math.floor(100000 + Math.random() * 900000).toString();
  console.log('[Lobby] Generated PIN:', pin);
  return pin;
}

/**
 * Generate a unique team ID
 * Format: team_TIMESTAMP_RANDOM
 * @returns {string} Unique team ID
 */
function generateTeamId() {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000);
  const teamId = `team_${timestamp}_${random}`;
  
  console.log('[Lobby] Generated team ID:', teamId);
  return teamId;
}

/**
 * Get the next available color for a new team
 * @param {Object} existingTeams - Object of existing teams from Firebase
 * @returns {Object} Color object { name, hex, label } or null if all colors used
 */
function getNextAvailableColor(existingTeams) {
  console.log('[Lobby] Finding next available color...');
  
  // Get all colors currently in use
  const usedColors = [];
  if (existingTeams) {
    Object.values(existingTeams).forEach(team => {
      if (team.color) {
        usedColors.push(team.color);
      }
    });
  }
  
  console.log('[Lobby] Colors in use:', usedColors);
  
  // Find first unused color
  const availableColor = TEAM_COLORS.find(color => !usedColors.includes(color.name));
  
  if (availableColor) {
    console.log('[Lobby] Next available color:', availableColor.name);
  } else {
    console.warn('[Lobby] No colors available (max teams reached)');
  }
  
  return availableColor || null;
}

/**
 * Validate team name
 * @param {string} name - Team name to validate
 * @param {Object} existingTeams - Object of existing teams
 * @returns {Object} { valid: boolean, error: string }
 */
function validateTeamName(name, existingTeams) {
  console.log('[Lobby] Validating team name:', name);
  
  // Check if empty
  if (!name || name.trim().length === 0) {
    return { valid: false, error: 'Lagnamn kan inte vara tomt' };
  }
  
  // Check length
  if (name.length > MAX_TEAM_NAME_LENGTH) {
    return { valid: false, error: `Lagnamn max ${MAX_TEAM_NAME_LENGTH} tecken` };
  }
  
  // Check if name already exists (case-insensitive)
  if (existingTeams) {
    const existingNames = Object.values(existingTeams).map(team => 
      team.name.toLowerCase().trim()
    );
    
    if (existingNames.includes(name.toLowerCase().trim())) {
      return { valid: false, error: 'Lagnamnet är redan upptaget' };
    }
  }
  
  console.log('[Lobby] Team name valid');
  return { valid: true, error: null };
}

/**
 * Validate timer value
 * @param {string} timerType - Type of timer (guess, challenge, etc.)
 * @param {number} value - Timer value in seconds
 * @returns {Object} { valid: boolean, error: string, value: number }
 */
function validateTimer(timerType, value) {
  console.log(`[Lobby] Validating timer ${timerType}:`, value);
  
  const limits = TIMER_LIMITS[timerType];
  
  if (!limits) {
    return { valid: false, error: 'Ogiltig timer-typ', value: null };
  }
  
  // Parse value
  const numValue = parseInt(value);
  
  if (isNaN(numValue)) {
    return { valid: false, error: 'Värdet måste vara ett tal', value: null };
  }
  
  // Check limits
  if (numValue < limits.min) {
    return { 
      valid: false, 
      error: `Minst ${limits.min} sekunder`, 
      value: null 
    };
  }
  
  if (numValue > limits.max) {
    return { 
      valid: false, 
      error: `Max ${limits.max} sekunder`, 
      value: null 
    };
  }
  
  console.log(`[Lobby] Timer ${timerType} valid:`, numValue);
  return { valid: true, error: null, value: numValue };
}

/**
 * Check if lobby is full
 * @param {Object} existingTeams - Object of existing teams
 * @returns {boolean} True if lobby is full
 */
function isLobbyFull(existingTeams) {
  const teamCount = existingTeams ? Object.keys(existingTeams).length : 0;
  const isFull = teamCount >= MAX_TEAMS;
  
  console.log(`[Lobby] Team count: ${teamCount}/${MAX_TEAMS}, Full: ${isFull}`);
  return isFull;
}

/**
 * Generate QR code for joining game
 * @param {string} gameId - Game ID
 * @param {string} elementId - ID of DOM element to render QR code in
 */
function generateLobbyQRCode(gameId, elementId) {
  console.log('[Lobby] Generating QR code for game:', gameId);
  
  const joinUrl = `https://www.notestream.se/test/join.html?game=${gameId}`;
  const qrElement = document.getElementById(elementId);
  
  if (!qrElement) {
    console.error('[Lobby] QR code element not found:', elementId);
    return;
  }
  
  // Clear existing QR code
  qrElement.innerHTML = '';
  
  // Generate new QR code (requires qrcode.js library)
  if (typeof QRCode !== 'undefined') {
    new QRCode(qrElement, {
      text: joinUrl,
      width: 200,
      height: 200,
      colorDark: '#000000',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.H
    });
    
    console.log('[Lobby] QR code generated successfully');
  } else {
    console.error('[Lobby] QRCode library not loaded');
    qrElement.innerHTML = '<p style="color: red;">QR-kod kunde inte genereras</p>';
  }
}

/**
 * Copy text to clipboard
 * @param {string} text - Text to copy
 * @param {string} label - Label for success message
 */
function copyToClipboard(text, label) {
  console.log(`[Lobby] Copying to clipboard: ${label}`);
  
  navigator.clipboard.writeText(text)
    .then(() => {
      console.log(`[Lobby] Copied ${label} to clipboard`);
      showNotification(`${label} kopierat!`, 'success');
    })
    .catch(err => {
      console.error(`[Lobby] Failed to copy ${label}:`, err);
      showNotification(`Kunde inte kopiera ${label}`, 'error');
    });
}

/**
 * Show notification message
 * @param {string} message - Message to show
 * @param {string} type - Type of notification (success, error, info)
 */
function showNotification(message, type = 'info') {
  console.log(`[Lobby] Notification (${type}):`, message);
  
  // Create notification element
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 15px 20px;
    background: ${type === 'success' ? '#34A853' : type === 'error' ? '#EA4335' : '#4285F4'};
    color: white;
    border-radius: 8px;
    font-weight: bold;
    z-index: 10000;
    animation: slideIn 0.3s ease-out;
  `;
  
  document.body.appendChild(notification);
  
  // Remove after 3 seconds
  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease-out';
    setTimeout(() => {
      document.body.removeChild(notification);
    }, 300);
  }, 3000);
}

// ============================================
// EXPORT FUNCTIONS (for testing)
// ============================================
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    generateGameId,
    generatePIN,
    generateTeamId,
    getNextAvailableColor,
    validateTeamName,
    validateTimer,
    isLobbyFull,
    generateLobbyQRCode,
    copyToClipboard,
    showNotification,
    TEAM_COLORS,
    TIMER_LIMITS,
    MAX_TEAMS,
    MAX_TEAM_NAME_LENGTH
  };
}

// ============================================
// LOGGING
// ============================================
console.log('[Lobby] lobby.js Part 1 loaded successfully');
console.log('[Lobby] Constants:', {
  MAX_TEAMS,
  MAX_TEAM_NAME_LENGTH,
  TEAM_COLORS: TEAM_COLORS.length,
  TIMER_LIMITS
});
