// ============================================
// NOTESTREAM - SONG POOL (new lobby)
// Which songs the chosen playlists and years give, and what starting a game writes.
// Pure functions: they only read their arguments, so the same code gives the number
// shown in the lobby and the deck the game is started with.
// ============================================

(function (root) {
  "use strict";

  const DEFAULT_MIN_YEAR = 1950;

  // The year the game uses for a song: the verified cache first, then the user's own
  // correction, then the year stored in the list.
  function songYear(spotifyId, song, verified) {
    const cached = verified ? verified[spotifyId] : null;
    const raw = cached && cached.year ? cached.year : (song.customYear || song.year);
    return parseInt(raw, 10);
  }

  // The lists as the database stores them can come back as arrays or with holes
  function songsOf(list) {
    return list && list.songs ? Object.entries(list.songs).filter(([, song]) => !!song) : [];
  }

  // The names chosen for a game. The database returns an array as an array or as an object.
  function normalizePlaylists(playlists) {
    if (!playlists) return [];
    const names = Array.isArray(playlists) ? playlists : Object.values(playlists);
    return names.filter(name => typeof name === "string" && name !== "");
  }

  function normalizeYearRange(yearRange, thisYear) {
    const min = parseInt(yearRange && yearRange.min, 10);
    const max = parseInt(yearRange && yearRange.max, 10);
    return {
      min: Number.isInteger(min) ? min : DEFAULT_MIN_YEAR,
      max: Number.isInteger(max) ? max : thisYear
    };
  }

  function inRange(year, yearRange) {
    return year >= yearRange.min && year <= yearRange.max;
  }

  /**
   * The list names to choose from, sorted. A user's list with the same name as a standard
   * list is not shown on its own: choosing the name takes the songs from both.
   *
   * data: { standardLists, userLists }
   * Returns { standard: [name], user: [name] }.
   */
  function listNames(data) {
    const bySwedish = (a, b) => a.localeCompare(b, "sv");
    const standard = Object.keys(data.standardLists || {}).sort(bySwedish);
    const user = Object.keys(data.userLists || {}).filter(name => !standard.includes(name)).sort(bySwedish);
    return { standard, user };
  }

  /**
   * How many songs each list has within the years, for the numbers next to the list names.
   *
   * data: { standardLists, userLists, verified }
   * Returns { name: count } for every name from listNames.
   */
  function countSongsPerList(data, yearRange) {
    const counts = {};
    const names = listNames(data);
    for (const name of [...names.standard, ...names.user]) {
      const ids = new Set();
      for (const lists of [data.standardLists, data.userLists]) {
        for (const [spotifyId, song] of songsOf(lists ? lists[name] : null)) {
          if (inRange(songYear(spotifyId, song, data.verified), yearRange)) ids.add(spotifyId);
        }
      }
      counts[name] = ids.size;
    }
    return counts;
  }

  /**
   * The songs a game is played with: every song in the chosen lists whose year is within the
   * range. A song that is in several chosen lists is taken once.
   *
   * data:      { standardLists, userLists, verified }
   * playlists: the chosen list names
   * yearRange: { min, max }
   * Returns [{ spotifyId, title, artist, year }] in list order (not shuffled).
   */
  function buildSongPool(data, playlists, yearRange) {
    const pool = [];
    const taken = new Set();
    for (const name of normalizePlaylists(playlists)) {
      for (const lists of [data.standardLists, data.userLists]) {
        for (const [spotifyId, song] of songsOf(lists ? lists[name] : null)) {
          if (taken.has(spotifyId)) continue;
          const year = songYear(spotifyId, song, data.verified);
          if (!inRange(year, yearRange)) continue;
          taken.add(spotifyId);
          pool.push({ spotifyId, title: song.title, artist: song.artist, year });
        }
      }
    }
    return pool;
  }

  // Fisher-Yates. random is passed in so that tests can make the order predictable.
  function shuffleSongs(songs, random) {
    const next = random || Math.random;
    const shuffled = songs.slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  /**
   * What starting a game writes. The same fields and rules as the current lobby, so that
   * game.html cannot tell which lobby started the game: every team gets a random song from
   * the deck as its starting card, a random team begins, and the first song is the top of
   * the deck.
   *
   * teamIds:  the ids of the teams in the lobby
   * songs:    the shuffled deck
   * settings: games/<id>/settings
   * Returns { "games/<id>/...": value } for one update of the database root.
   */
  function buildGameStart(gameId, teamIds, songs, settings, random) {
    const next = random || Math.random;
    const updates = {};

    teamIds.forEach(teamId => {
      const startingCard = songs[Math.floor(next() * songs.length)];
      updates[`games/${gameId}/teams/${teamId}/timeline`] = {
        0: {
          spotifyId: startingCard.spotifyId,
          title: startingCard.title,
          artist: startingCard.artist,
          year: startingCard.year,
          position: 0,
          revealed: true
        }
      };
    });

    const startingTeamId = teamIds[Math.floor(next() * teamIds.length)];
    const timers = (settings && settings.timers) || {};
    const seconds = (value, fallback) => (value ? parseInt(value, 10) : fallback);

    updates[`games/${gameId}/status`] = "playing";
    updates[`games/${gameId}/songs`] = songs;
    updates[`games/${gameId}/currentRound`] = 1;
    updates[`games/${gameId}/currentTeam`] = startingTeamId;
    updates[`games/${gameId}/startingTeam`] = startingTeamId;
    updates[`games/${gameId}/currentSongIndex`] = 0;
    updates[`games/${gameId}/currentSong`] = songs[0];
    updates[`games/${gameId}/guessingTime`] = seconds(timers.guess, 90);
    updates[`games/${gameId}/betweenSongsTime`] = seconds(timers.pauseBetweenSongs, 10);
    updates[`games/${gameId}/challengeTime`] = seconds(timers.challenge, 10);
    updates[`games/${gameId}/placeChallengeTime`] = seconds(timers.placeChallenge, 20);
    return updates;
  }

  const api = {
    DEFAULT_MIN_YEAR,
    songYear,
    normalizePlaylists,
    normalizeYearRange,
    listNames,
    countSongsPerList,
    buildSongPool,
    shuffleSongs,
    buildGameStart
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.NotestreamSongPool = api;
})(typeof window !== "undefined" ? window : globalThis);
