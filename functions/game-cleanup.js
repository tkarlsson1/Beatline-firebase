// Which games the scheduled cleanup removes, and how it goes through them.
//
// Nothing here talks to Firebase: the caller passes in the functions that list, read and remove
// games (see cleanupOldGames in index.js), so the decisions can be run on their own.

const GAME_MAX_AGE_MS = 6 * 60 * 60 * 1000;

// createdAt is written by the device that creates the game, so its clock decides the value. A
// clock that is ahead is accepted up to a day. A date further into the future is not a real
// game: it would otherwise never be old enough to be removed.
const FUTURE_TOLERANCE_MS = 24 * 60 * 60 * 1000;

// How many games are read and removed at the same time
const CLEANUP_CONCURRENCY = 10;

/**
 * Why a game is removed, or null when it stays.
 *
 * createdAt: games/<id>/createdAt as stored, of any type or missing
 * now:       the server's clock in milliseconds
 * Returns "old" (created more than six hours ago), "noCreatedAt" (missing or not a number, so
 * its age cannot be told) or "future" (dated more than a day ahead), else null.
 */
function reasonToRemoveGame(createdAt, now) {
  if (typeof createdAt !== "number" || !Number.isFinite(createdAt)) return "noCreatedAt";
  if (createdAt > now + FUTURE_TOLERANCE_MS) return "future";
  if (createdAt < now - GAME_MAX_AGE_MS) return "old";
  return null;
}

/**
 * The ids of all games. The first way of listing is tried, and the second one is used if it
 * fails, so that the cleanup still runs.
 *
 * Returns { ids, listedBy } where listedBy is "keys" or "fallback".
 */
async function listGameIdsWithFallback(listKeysOnly, listByReadingAll, logError) {
  try {
    return { ids: await listKeysOnly(), listedBy: "keys" };
  } catch (error) {
    logError("[Cleanup] Could not list the games by key, reading all of them instead:", error);
    return { ids: await listByReadingAll(), listedBy: "fallback" };
  }
}

/**
 * Goes through the games and removes the ones that should not be kept. Every game is handled
 * on its own: one that cannot be read or removed is counted as failed and the rest go on.
 *
 * ids:           the game ids
 * readCreatedAt: async (id) => the stored createdAt of that game
 * removeGame:    async (id) => removes the game
 * now:           the server's clock in milliseconds
 * logError:      (message, error) => void
 * Returns { games, kept, old, noCreatedAt, future, failed }.
 */
async function removeOutdatedGames({ ids, readCreatedAt, removeGame, now, logError }) {
  const counts = { games: ids.length, kept: 0, old: 0, noCreatedAt: 0, future: 0, failed: 0 };
  let next = 0;
  const worker = async () => {
    while (next < ids.length) {
      const id = ids[next++];
      try {
        const reason = reasonToRemoveGame(await readCreatedAt(id), now);
        if (reason === null) {
          counts.kept++;
          continue;
        }
        await removeGame(id);
        counts[reason]++;
      } catch (error) {
        counts.failed++;
        logError(`[Cleanup] Game ${id} could not be handled:`, error);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CLEANUP_CONCURRENCY, ids.length) }, worker));
  return counts;
}

module.exports = {
  GAME_MAX_AGE_MS,
  FUTURE_TOLERANCE_MS,
  reasonToRemoveGame,
  listGameIdsWithFallback,
  removeOutdatedGames
};
