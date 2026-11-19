        import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
        import { getDatabase, ref, set, get, update } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-database.js";
        import { getAuth, onAuthStateChanged, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
        import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-functions.js";

        const firebaseConfig = {
            apiKey: "AIzaSyAfv4yGrI7Vj5PaX0A_XFRn0P4U--S9tFA",
            authDomain: "beatlinefirebase.firebaseapp.com",
            databaseURL: "https://notestreamfire.europe-west1.firebasedatabase.app",
            projectId: "beatlinefirebase",
            storageBucket: "beatlinefirebase.firebasestorage.app",
            messagingSenderId: "196231817325",
            appId: "1:196231817325:web:d5603a36a9c2c5f247f764"
        };

        const app = initializeApp(firebaseConfig);
        const db = getDatabase(app);
        const auth = getAuth(app);
        const functions = getFunctions(app, "europe-west1");

        const ADMIN_EMAIL = "timmykarlsson@gmail.com"; // Din admin-mail!

        // Escapes text before it is put into innerHTML, as element content or in a quoted attribute.
        // Reports and user data can be written by others, so they must never be inserted as raw HTML.
        function escapeHtml(value) {
            return String(value)
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#39;");
        }

        // How the origin of a year from resolveSongYear is described
        const YEAR_SOURCE_LABELS = {
            spotify: "Spotifys år stämmer",
            web: "Webbsökning",
            opus: "Opus och webbsökningen är överens"
        };

        // The explanation and the address come from Claude and from web pages, so they are
        // escaped, and an address only becomes a link when it is a plain http(s) address.
        const yearSourceLink = (url, title) => /^https?:\/\//i.test(url || "")
            ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" style="color: var(--primary);">${escapeHtml(title || url)}</a>`
            : "";

        // <year-review-summary>
        /**
         * Sorts the stored year reviews by what would happen to each song in the standard lists.
         * Pure function: it only reads its arguments.
         *
         * lists:    standardLists from the database
         * verified: verifiedTracks from the database, which holds the year the game uses
         * reviews:  yearReviews from the database, written by resolveSongYear
         *
         * Returns counts and lists:
         *   pending        ids of songs that have no review yet, in list order
         *   unchanged      number of songs where the review gives the year the game already has
         *   lockedSame     the same, for songs locked as manually verified
         *   changes        songs whose year would change
         *   lockedDiffers  locked songs where the review gives another year (never changed automatically)
         *   needsReview    songs the review could not settle
         *   resolved       number of songs settled by hand in the review queue; they are in no other group
         *   notFound       songs Spotify does not know, or that have no release date
         *   needsWeb       ids of songs that should get a web search before anything is applied:
         *                  none has been run, and the review from memory was not certain or its
         *                  year differs from the year the game has. A song is also in one of the
         *                  groups above.
         */
        function classifyYearReviews(lists, verified, reviews) {
            const songs = new Map();
            for (const [listName, list] of Object.entries(lists || {})) {
                for (const [trackId, song] of Object.entries((list && list.songs) || {})) {
                    if (!song) continue;
                    if (!songs.has(trackId)) {
                        songs.set(trackId, { id: trackId, title: song.title, artist: song.artist, listYear: song.year, lists: [], listYears: {} });
                    }
                    songs.get(trackId).lists.push(listName);
                    songs.get(trackId).listYears[listName] = song.year;
                }
            }

            const summary = {
                total: songs.size, pending: [], unchanged: 0, lockedSame: 0, resolved: 0,
                changes: [], lockedDiffers: [], needsReview: [], notFound: [], needsWeb: []
            };
            for (const song of songs.values()) {
                const review = reviews ? reviews[song.id] : null;
                if (!review) {
                    summary.pending.push(song.id);
                    continue;
                }
                const cached = verified ? verified[song.id] : null;
                // The game takes the cache's year before the list's year, so that is the current year
                const currentYear = parseInt(cached && cached.year ? cached.year : song.listYear, 10);
                const locked = !!(cached && cached.manuallyVerified === true);
                const entry = { ...song, currentYear, locked, review };

                // A song settled by hand in the review queue is done, whatever its review says
                if (review.resolved) {
                    summary.resolved++;
                    continue;
                }

                if (review.status === "notFound" || review.status === "noSpotifyYear") {
                    summary.notFound.push(entry);
                } else if (review.status === "needsReview") {
                    summary.needsReview.push(entry);
                } else if (review.status === "ok") {
                    const uncertain = !review.memory || review.memory.confidence !== "high";
                    if (!review.web && (uncertain || review.year !== currentYear)) summary.needsWeb.push(song.id);

                    if (review.year === currentYear) {
                        if (locked) summary.lockedSame++; else summary.unchanged++;
                    } else if (locked) {
                        summary.lockedDiffers.push(entry);
                    } else {
                        summary.changes.push(entry);
                    }
                } else {
                    // A status this page does not know is treated as not reviewed
                    summary.pending.push(song.id);
                }
            }

            const largestChangeFirst = (a, b) =>
                Math.abs(b.review.year - b.currentYear) - Math.abs(a.review.year - a.currentYear);
            summary.changes.sort(largestChangeFirst);
            summary.lockedDiffers.sort(largestChangeFirst);
            return summary;
        }

        // The fields of a cache record that come from a year review: the year and what it rests
        // on. title, artist and appliedAt are left out, because they do not come from the review.
        const REVIEW_RECORD_FIELDS = ["year", "source", "explanation", "sourceUrl", "sourceTitle", "spotifyYear", "albumName", "albumType", "releaseDate", "checkedAt"];

        /**
         * Whether a cache record already holds what applying a review would write. Pure function.
         *
         * cached: the record in verifiedTracks, or null
         * record: the record buildYearApplyPlan would write
         */
        function isReviewApplied(cached, record) {
            if (!cached) return false;
            return REVIEW_RECORD_FIELDS.every(field => {
                // The database does not store null, so a missing field is the same as null
                const stored = cached[field] === undefined ? null : cached[field];
                // The year is a string in new records and can be a number in old ones
                return field === "year" ? String(stored) === String(record[field]) : stored === record[field];
            });
        }

        /**
         * Works out what applying the stored year reviews would write. Pure function: it only
         * reads its arguments, and nothing is written until the caller sends the result.
         *
         * A song is applied when its review has status "ok" and the song is not locked as manually
         * verified. It gets a new cache record with the year and where the year came from, and
         * the year is written to every standard list where the song has another year.
         * Locked songs, songs that need review and songs Spotify does not know are never touched.
         * A song whose cache record already holds the review's result gets no new record, so
         * applying in parts or twice leaves the records written earlier as they are.
         *
         * appliedAt: the timestamp stored in the new cache records
         *
         * Returns { cacheUpdates, listUpdates, counts }:
         *   cacheUpdates  { trackId: record }, to be written under verifiedTracks
         *   listUpdates   { listName: { "<trackId>/year": "1982" } }, for standardLists/<list>/songs
         *   counts        applied: songs that get a new cache record, changed: how many of them
         *                 get another year than the game has, alreadyApplied: songs whose cache
         *                 record already holds the review's result, listWrites: years written in
         *                 lists, and how many songs are left alone and why
         */
        function buildYearApplyPlan(lists, verified, reviews, appliedAt) {
            const summary = classifyYearReviews(lists, verified, reviews);
            const cacheUpdates = {};
            const listUpdates = {};
            const counts = {
                total: summary.total, applied: 0, changed: 0, alreadyApplied: 0, listWrites: 0, locked: 0,
                needsReview: summary.needsReview.length, notFound: summary.notFound.length,
                pending: summary.pending.length, needsWeb: summary.needsWeb.length
            };

            const seen = new Set();
            for (const [listName, list] of Object.entries(lists || {})) {
                for (const [trackId, song] of Object.entries((list && list.songs) || {})) {
                    if (!song) continue;
                    const review = reviews ? reviews[trackId] : null;
                    if (!review || review.status !== "ok" || !Number.isInteger(review.year)) continue;

                    const cached = verified ? verified[trackId] : null;
                    const locked = !!(cached && cached.manuallyVerified === true);
                    const firstTime = !seen.has(trackId);
                    seen.add(trackId);
                    if (locked) {
                        if (firstTime) counts.locked++;
                        continue;
                    }

                    const year = String(review.year);
                    if (firstTime) {
                        const record = {
                            title: song.title,
                            artist: song.artist,
                            year: year,
                            manuallyVerified: false,
                            source: review.source || null,
                            explanation: review.explanation || null,
                            sourceUrl: review.sourceUrl || null,
                            sourceTitle: review.sourceTitle || null,
                            spotifyYear: Number.isInteger(review.spotifyYear) ? review.spotifyYear : null,
                            albumName: review.albumName || null,
                            albumType: review.albumType || null,
                            releaseDate: review.releaseDate || null,
                            checkedAt: review.checkedAt || null,
                            appliedAt: appliedAt
                        };
                        if (isReviewApplied(cached, record)) {
                            // Writing it again would only replace the time the year was applied
                            counts.alreadyApplied++;
                        } else {
                            // The same current year as in classifyYearReviews: the cache's, else the first list's
                            const currentYear = parseInt(cached && cached.year ? cached.year : song.year, 10);
                            counts.applied++;
                            if (review.year !== currentYear) counts.changed++;
                            cacheUpdates[trackId] = record;
                        }
                    }
                    if (String(song.year) !== year) {
                        if (!listUpdates[listName]) listUpdates[listName] = {};
                        listUpdates[listName][`${trackId}/year`] = year;
                        counts.listWrites++;
                    }
                }
            }
            return { cacheUpdates, listUpdates, counts };
        }

        /**
         * What importing a playlist into the standard lists writes, once its songs have been
         * reviewed. Pure function, built on the same rules as buildYearApplyPlan: a song whose
         * review has status "ok" and that is not locked gets the review's year and a cache record.
         * Every other song keeps the year the game would use today: the cache's year where
         * there is one, else Spotify's.
         *
         * listName:  the name the list is saved under
         * tracks:    { trackId: { title, artist, year } } as read from Spotify (year is Spotify's)
         * appliedAt: the timestamp stored in the new cache records
         *
         * Returns { songs, cacheUpdates, counts }:
         *   songs         the list's songs with the year to save
         *   cacheUpdates  { trackId: record }, to be written under verifiedTracks
         *   counts        total, applied (new cache records), differsFromSpotify (songs saved with
         *                 another year than Spotify's), toSettle (songs for the review queue),
         *                 notFound and pending (songs without a review)
         */
        function buildImportPlan(listName, tracks, verified, reviews, appliedAt) {
            const songs = {};
            for (const [trackId, track] of Object.entries(tracks || {})) {
                if (!track) continue;
                const cached = verified ? verified[trackId] : null;
                songs[trackId] = { ...track, year: cached && cached.year ? String(cached.year) : track.year };
            }

            const lists = { [listName]: { songs } };
            const summary = classifyYearReviews(lists, verified, reviews);
            const plan = buildYearApplyPlan(lists, verified, reviews, appliedAt);
            for (const [key, year] of Object.entries(plan.listUpdates[listName] || {})) {
                // The keys are "<trackId>/year"
                songs[key.slice(0, key.lastIndexOf("/"))].year = year;
            }

            let differsFromSpotify = 0;
            for (const [trackId, song] of Object.entries(songs)) {
                if (String(song.year) !== String(tracks[trackId].year)) differsFromSpotify++;
            }
            return {
                songs,
                cacheUpdates: plan.cacheUpdates,
                counts: {
                    total: summary.total,
                    applied: plan.counts.applied,
                    differsFromSpotify,
                    toSettle: summary.needsReview.length + summary.lockedDiffers.length,
                    notFound: summary.notFound.length,
                    pending: summary.pending.length
                }
            };
        }

        /**
         * The message shown when an import is done. Pure function.
         *
         * counts:      from buildImportPlan
         * reviewedNow: how many of the songs were reviewed during this import
         * unavailable: how many songs in the playlist Spotify has withdrawn; they were left out
         */
        function importSummaryText(listName, counts, reviewedNow, unavailable = 0) {
            const lines = [
                `Spellistan "${listName}" har lagts till med ${counts.total} låtar.`,
                "",
                `${reviewedNow} granskades nu, ${counts.total - reviewedNow - counts.pending} var redan granskade.`,
                `${counts.differsFromSpotify} har ett annat år än Spotifys.`
            ];
            if (counts.toSettle > 0) {
                lines.push(`${counts.toSettle} måste avgöras för hand. De ligger i fliken Flaggat under "Årtal att avgöra".`);
            }
            if (counts.notFound > 0) {
                lines.push(`${counts.notFound} saknar utgivningsdatum hos Spotify och har inget granskat år.`);
            }
            if (counts.pending > 0) {
                lines.push(`${counts.pending} kunde inte granskas nu och har Spotifys år. Kör "Starta / Fortsätt" i kortet "Granska alla årtal" och sedan "Verkställ".`);
            }
            if (unavailable > 0) {
                lines.push(`${unavailable} låtar i spellistan finns inte längre hos Spotify och togs inte med.`);
            }
            return lines.join("\n");
        }

        // The name of the one list that stands for all playlists imported by users when their
        // songs are reviewed. It is only used on this page and is never written to the database.
        const USER_SONGS_LIST = "Användarnas listor";

        /**
         * The songs in the users' own playlists that are in no standard list, as one list for
         * classifyYearReviews and buildYearApplyPlan. Pure function.
         *
         * The order decides which songs a limited run takes first: songs without a cache record
         * (they have Spotify's year untouched, so they have the most errors), then songs with an
         * unlocked cache record, then songs locked as manually verified.
         * A song that several users have is listed once, with the first title, artist and year
         * found. The year is the one the game would use without a cache record: the user's own
         * year where one is set, else the year stored at import.
         *
         * userPlaylists: userPlaylists from the database, { uid: { listName: { songs } } }
         * Returns { [USER_SONGS_LIST]: { songs } }.
         */
        function collectUserSongs(userPlaylists, standardLists, verified) {
            const inStandardLists = new Set();
            for (const list of Object.values(standardLists || {})) {
                for (const trackId of Object.keys((list && list.songs) || {})) inStandardLists.add(trackId);
            }
            const groups = [{}, {}, {}];
            const seen = new Set();
            for (const userLists of Object.values(userPlaylists || {})) {
                for (const list of Object.values(userLists || {})) {
                    for (const [trackId, song] of Object.entries((list && list.songs) || {})) {
                        if (!song || seen.has(trackId) || inStandardLists.has(trackId)) continue;
                        // The server refuses a whole call if one id in it is not a Spotify track id
                        if (!/^[A-Za-z0-9]{22}$/.test(trackId)) continue;
                        seen.add(trackId);
                        const cached = verified ? verified[trackId] : null;
                        const group = !cached ? 0 : (cached.manuallyVerified === true ? 2 : 1);
                        groups[group][trackId] = { title: song.title, artist: song.artist, year: song.customYear || song.year };
                    }
                }
            }
            return { [USER_SONGS_LIST]: { songs: { ...groups[0], ...groups[1], ...groups[2] } } };
        }

        /**
         * The songs that have to be settled by hand, each with the year the review suggests.
         * Pure function.
         *
         * Three kinds, in this order:
         *   "reported"       a player reported the year from the game (reports is reportedTracks
         *                    from the database). The report starts a new check on the server, so
         *                    the review is normally newer than the report.
         *   "needsReview"    the review could not settle the year
         *   "lockedDiffers"  a song locked as manually verified, where the review gives another year
         * A reported song is listed once, as reported, whatever else is true of it.
         *
         * suggestion is { year, source, explanation, sourceUrl, sourceTitle }, or null when the
         * review has nothing to suggest. It is the review's own year when the review settled one
         * (always so for a locked song), else the web search's year, else the year from memory.
         *
         * Songs outside the standard lists are included when they are reported, when the review
         * could not settle them, or when they are locked and the review gives another year. They
         * come from playlists imported by users, so the title and the artist are the review's or
         * the report's own, lists is empty and a decision only writes the cache.
         */
        function buildYearQueue(lists, verified, reviews, reports) {
            const summary = classifyYearReviews(lists, verified, reviews);

            // Every song in the standard lists, with the lists it is in
            const listSongs = new Map();
            for (const [listName, list] of Object.entries(lists || {})) {
                for (const [trackId, song] of Object.entries((list && list.songs) || {})) {
                    if (!song) continue;
                    if (!listSongs.has(trackId)) {
                        listSongs.set(trackId, { id: trackId, title: song.title, artist: song.artist, listYear: song.year, lists: [], listYears: {} });
                    }
                    listSongs.get(trackId).lists.push(listName);
                    listSongs.get(trackId).listYears[listName] = song.year;
                }
            }

            const reported = [];
            const reportedIds = new Set();
            for (const [trackId, report] of Object.entries(reports || {})) {
                if (!report) continue;
                reportedIds.add(trackId);
                const review = reviews ? (reviews[trackId] || null) : null;
                const cached = verified ? verified[trackId] : null;
                const song = listSongs.get(trackId) || {
                    id: trackId, title: (review && review.title) || report.title, artist: (review && review.artist) || report.artist,
                    listYear: null, lists: [], listYears: {}
                };
                // The year the game uses: the cache's, else the list's, else the year the players saw
                const currentYear = parseInt(cached && cached.year ? cached.year : (song.listYear != null ? song.listYear : report.year), 10);
                reported.push({
                    ...song, currentYear, locked: !!(cached && cached.manuallyVerified === true), review,
                    report: { year: report.year, reportedAt: report.reportedAt }
                });
            }

            const outsideNeedsReview = [];
            const outsideLockedDiffers = [];
            for (const [trackId, review] of Object.entries(reviews || {})) {
                if (!review || review.resolved) continue;
                if (listSongs.has(trackId) || reportedIds.has(trackId)) continue;
                const cached = verified ? verified[trackId] : null;
                const locked = !!(cached && cached.manuallyVerified === true);
                const outside = { id: trackId, title: review.title, artist: review.artist, listYear: null, lists: [], listYears: {}, review };
                if (review.status === "needsReview" && !locked) {
                    // A locked record means the year has already been settled by hand. Without a cache
                    // record the game uses the year in the user's playlist, which is Spotify's.
                    outsideNeedsReview.push({ ...outside, currentYear: parseInt(cached && cached.year ? cached.year : review.spotifyYear, 10), locked: false });
                } else if (review.status === "ok" && locked && Number.isInteger(review.year) && review.year !== parseInt(cached.year, 10)) {
                    outsideLockedDiffers.push({ ...outside, currentYear: parseInt(cached.year, 10), locked: true });
                }
            }

            const withSuggestion = (entry, kind) => {
                const review = entry.review;
                const settled = !!review && review.status === "ok" && Number.isInteger(review.year);
                let suggestion = null;
                if (kind === "lockedDiffers" || (kind === "reported" && settled)) {
                    suggestion = {
                        year: review.year, source: review.source || "manual", explanation: review.explanation || "",
                        sourceUrl: review.sourceUrl || null, sourceTitle: review.sourceTitle || null
                    };
                } else if (review && review.web && Number.isInteger(review.web.year)) {
                    // The address is only kept when it really was one of the search results
                    suggestion = {
                        year: review.web.year, source: "web", explanation: review.web.explanation || "",
                        sourceUrl: review.web.sourceVerified ? (review.web.sourceUrl || null) : null, sourceTitle: null
                    };
                } else if (review && review.memory && Number.isInteger(review.memory.year)) {
                    suggestion = { year: review.memory.year, source: "opus", explanation: "", sourceUrl: null, sourceTitle: null };
                }
                return { ...entry, kind, suggestion, cached: verified ? (verified[entry.id] || null) : null };
            };
            const notReported = entry => !reportedIds.has(entry.id);
            return [
                ...reported.map(entry => withSuggestion(entry, "reported")),
                ...summary.needsReview.filter(notReported).map(entry => withSuggestion(entry, "needsReview")),
                ...outsideNeedsReview.map(entry => withSuggestion(entry, "needsReview")),
                ...summary.lockedDiffers.filter(notReported).map(entry => withSuggestion(entry, "lockedDiffers")),
                ...outsideLockedDiffers.map(entry => withSuggestion(entry, "lockedDiffers"))
            ];
        }

        /**
         * What one decision in the review queue writes. Pure function.
         *
         * entry:      an entry from buildYearQueue
         * choice:     "accept" (the suggested year), "keep" (the year the game has) or "custom"
         * customYear: the year for the choice "custom"
         * decidedAt:  timestamp of the decision
         *
         * Returns null when the choice cannot be made (no suggestion, or not a reasonable year).
         * Otherwise { year, cacheRecord, listUpdates, resolved }:
         *   cacheRecord  the new record for verifiedTracks/<id>, always locked as manually verified
         *   listUpdates  { listName: { "<id>/year": "1987" } } for the lists where the year differs
         *   resolved     stored on the review, so the song leaves the queue for good
         */
        function buildYearDecision(entry, choice, customYear, decidedAt) {
            const review = entry.review || {};
            const cached = entry.cached || {};
            let year;
            let provenance;
            if (choice === "accept") {
                if (!entry.suggestion) return null;
                year = entry.suggestion.year;
                provenance = {
                    source: entry.suggestion.source, explanation: entry.suggestion.explanation || null,
                    sourceUrl: entry.suggestion.sourceUrl || null, sourceTitle: entry.suggestion.sourceTitle || null
                };
            } else if (choice === "keep") {
                year = entry.currentYear;
                // The record keeps what it already says about where its year came from
                provenance = {
                    source: cached.source || "manual", explanation: cached.explanation || null,
                    sourceUrl: cached.sourceUrl || null, sourceTitle: cached.sourceTitle || null
                };
            } else if (choice === "custom") {
                year = customYear;
                provenance = { source: "manual", explanation: null, sourceUrl: null, sourceTitle: null };
            } else {
                return null;
            }

            const maxYear = new Date(decidedAt).getFullYear() + 1;
            if (!Number.isInteger(year) || year < 1900 || year > maxYear) return null;

            const cacheRecord = {
                title: entry.title,
                artist: entry.artist,
                year: String(year),
                manuallyVerified: true,
                source: provenance.source,
                explanation: provenance.explanation,
                sourceUrl: provenance.sourceUrl,
                sourceTitle: provenance.sourceTitle,
                spotifyYear: Number.isInteger(review.spotifyYear) ? review.spotifyYear : null,
                albumName: review.albumName || null,
                albumType: review.albumType || null,
                releaseDate: review.releaseDate || null,
                checkedAt: review.checkedAt || null,
                sourceList: cached.sourceList || null,
                decidedAt: decidedAt
            };
            const listUpdates = {};
            for (const listName of entry.lists || []) {
                if (String((entry.listYears || {})[listName]) !== String(year)) {
                    listUpdates[listName] = { [`${entry.id}/year`]: String(year) };
                }
            }
            return { year, cacheRecord, listUpdates, resolved: { year, choice, at: decidedAt } };
        }

        /**
         * Adds where the year came from to locked songs whose year the review confirms. Pure function.
         *
         * Only for songs locked as manually verified that have no source or explanation yet, and
         * where the review gives the same year as the lock. The year, the lock, the title and the
         * artist are not part of the update, so they cannot change.
         *
         * Returns { updates, count }: updates has keys "<trackId>/<field>" for one update under
         * verifiedTracks, and count is the number of songs.
         */
        function buildLockedEnrichPlan(lists, verified, reviews, enrichedAt) {
            const updates = {};
            const seen = new Set();
            let count = 0;
            for (const list of Object.values(lists || {})) {
                for (const trackId of Object.keys((list && list.songs) || {})) {
                    if (seen.has(trackId)) continue;
                    seen.add(trackId);

                    const review = reviews ? reviews[trackId] : null;
                    const cached = verified ? verified[trackId] : null;
                    if (!review || review.status !== "ok" || review.resolved) continue;
                    if (!cached || cached.manuallyVerified !== true) continue;
                    if (cached.source || cached.explanation) continue;
                    // A review that disagrees with the lock belongs in the review queue
                    if (review.year !== parseInt(cached.year, 10)) continue;
                    if (!review.explanation) continue;

                    const fields = {
                        source: review.source || null,
                        explanation: review.explanation,
                        sourceUrl: review.sourceUrl || null,
                        sourceTitle: review.sourceTitle || null,
                        spotifyYear: Number.isInteger(review.spotifyYear) ? review.spotifyYear : null,
                        albumName: review.albumName || null,
                        albumType: review.albumType || null,
                        releaseDate: review.releaseDate || null,
                        checkedAt: review.checkedAt || null,
                        enrichedAt: enrichedAt
                    };
                    for (const [field, value] of Object.entries(fields)) {
                        if (value !== null) updates[`${trackId}/${field}`] = value;
                    }
                    count++;
                }
            }
            return { updates, count };
        }
        // </year-review-summary>

        document.addEventListener("DOMContentLoaded", () => {
            document.getElementById("adminLoginForm").style.display = "block";
            document.getElementById("adminContent").style.display = "none";

            onAuthStateChanged(auth, (user) => {
                if (user) {
                    if (user.email === ADMIN_EMAIL) {
                        document.getElementById("adminLoginForm").style.display = "none";
                        document.getElementById("adminContent").style.display = "block";
                        document.getElementById("adminNavbar").style.display = "flex";
                        
                        // Ladda inledande data för dashboard
                        loadDashboardStats();
                    } else {
                        alert("Du har inte behörighet att använda denna sida.");
                        window.location.href = "index.html";
                    }
                }
            });

            // Flik-navigering
            const navTabs = document.querySelectorAll('.nav-tab');
            const tabContents = document.querySelectorAll('.tab-content');

            navTabs.forEach(tab => {
                tab.addEventListener('click', () => {
                    // Ta bort active från alla flikar och innehåll
                    navTabs.forEach(t => t.classList.remove('active'));
                    tabContents.forEach(c => c.classList.remove('active'));

                    // Aktivera vald flik och dess innehåll
                    tab.classList.add('active');
                    const targetId = tab.getAttribute('data-target');
                    document.getElementById(targetId).classList.add('active');

                    // Ladda specifik data för fliken
                    if (targetId === 'tab-dashboard') loadDashboardStats();
                    if (targetId === 'tab-playlists') loadPlaylists();
                    if (targetId === 'tab-reports') loadYearQueue();
                    if (targetId === 'tab-users') loadUsers();
                });
            });

            // Dummy-funktioner tills vi implementerar dem ordentligt
            function loadDashboardStats() {
                get(ref(db, 'verifiedTracks')).then(snap => {
                    document.getElementById("statVerified").textContent = snap.exists() ? Object.keys(snap.val()).length : 0;
                });
                get(ref(db, 'standardLists')).then(snap => {
                    if (snap.exists()) {
                        const lists = snap.val();
                        document.getElementById("statPlaylists").textContent = Object.keys(lists).length;
                        
                        const uniqueSongs = new Set();
                        for (const key in lists) {
                            if (lists[key].songs) {
                                Object.keys(lists[key].songs).forEach(trackId => uniqueSongs.add(trackId));
                            }
                        }
                        const totalSongs = uniqueSongs.size;
                        document.getElementById("statTotalSongs").textContent = totalSongs;
                    } else {
                        document.getElementById("statPlaylists").textContent = 0;
                        document.getElementById("statTotalSongs").textContent = 0;
                    }
                });
                get(ref(db, 'users')).then(snap => {
                    document.getElementById("statUsers").textContent = snap.exists() ? Object.keys(snap.val()).length : 0;
                });
            }

            function loadPlaylists() {
                const tbody = document.getElementById("playlistsTableBody");
                tbody.innerHTML = '<tr><td colspan="3" style="text-align: center;">Laddar spellistor...</td></tr>';

                get(ref(db, 'standardLists')).then(snap => {
                    tbody.innerHTML = '';
                    if (!snap.exists()) {
                        tbody.innerHTML = '<tr><td colspan="3" style="text-align: center;">Inga spellistor inlagda ännu.</td></tr>';
                        return;
                    }

                    const lists = snap.val();
                    for (const [listName, listData] of Object.entries(lists)) {
                        const songCount = listData.songs ? Object.keys(listData.songs).length : 0;
                        const tr = document.createElement("tr");

                        tr.innerHTML = `
                            <td style="font-weight: 500;">${escapeHtml(listName)}</td>
                            <td>${songCount} låtar</td>
                            <td style="display: flex; gap: 8px;">
                                <button class="btn-info view-btn" data-id="${escapeHtml(listName)}" style="padding: 6px 12px; font-size: 13px;">🔍 Visa Låtar</button>
                                <button class="btn-secondary rename-btn" data-id="${escapeHtml(listName)}" style="padding: 6px 12px; font-size: 13px;">✏️ Döp om</button>
                                <button class="btn-danger delete-btn" data-id="${escapeHtml(listName)}" style="padding: 6px 12px; font-size: 13px;">🗑️ Ta bort</button>
                            </td>
                        `;
                        
                        // Ta bort spellista
                        tr.querySelector(".delete-btn").addEventListener("click", async (e) => {
                            const name = e.target.getAttribute("data-id");
                            if (confirm(`Är du helt säker på att du vill radera spellistan "${name}"? Detta går inte att ångra!`)) {
                                try {
                                    await set(ref(db, `standardLists/${name}`), null);
                                    loadPlaylists(); // Ladda om
                                    loadDashboardStats();
                                } catch (err) {
                                    alert("Fel vid borttagning: " + err);
                                }
                            }
                        });

                        // Döp om spellista
                        tr.querySelector(".rename-btn").addEventListener("click", async (e) => {
                            const oldName = e.target.getAttribute("data-id");
                            const newName = prompt("Ange nytt namn för spellistan:", oldName);
                            if (newName && newName.trim() !== "" && newName !== oldName) {
                                try {
                                    const dataSnap = await get(ref(db, `standardLists/${oldName}`));
                                    if (dataSnap.exists()) {
                                        await set(ref(db, `standardLists/${newName}`), dataSnap.val());
                                        await set(ref(db, `standardLists/${oldName}`), null);
                                        loadPlaylists();
                                    }
                                } catch (err) {
                                    alert("Fel vid namnbyte: " + err);
                                }
                            }
                        });

                        // Visa detaljer
                        tr.querySelector(".view-btn").addEventListener("click", (e) => {
                            const name = e.target.getAttribute("data-id");
                            openPlaylistDetailsModal(name, listData.songs || {});
                        });

                        tbody.appendChild(tr);
                    }
                }).catch(err => {
                    tbody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: red;">Kunde inte hämta listor: ${escapeHtml(err.message)}</td></tr>`;
                });
            }
            
            function openPlaylistDetailsModal(playlistName, songsObj) {
                const modal = document.getElementById("playlistDetailsModal");
                document.getElementById("detailsModalTitle").textContent = `Låtar i: ${playlistName}`;
                const tbody = document.getElementById("detailsModalList");
                tbody.innerHTML = "";
                
                document.getElementById("closeDetailsModal").onclick = () => {
                    modal.style.display = "none";
                };

                for (const [trackId, track] of Object.entries(songsObj)) {
                    const tr = document.createElement("tr");
                    const googleQuery = encodeURIComponent(`${track.artist} ${track.title} release year`);

                    // A second row under the song, shown when AI-Sök has an answer
                    const infoTr = document.createElement("tr");
                    infoTr.style.display = "none";
                    const infoCell = document.createElement("td");
                    infoCell.colSpan = 4;
                    infoCell.style.cssText = "padding: 4px 12px 14px; font-size: 13px; color: var(--text-muted); border-top: none;";
                    infoTr.appendChild(infoCell);

                    // The latest accepted answer from resolveSongYear for this song, until it is saved
                    let pendingResult = null;

                    const showYearInfo = (result) => {
                        const album = `${escapeHtml(result.albumName || "okänt album")}, ${escapeHtml(result.albumType || "okänd typ")}`;
                        let html;
                        if (result.status === "ok") {
                            html = `<strong>${escapeHtml(YEAR_SOURCE_LABELS[result.source] || result.source)}:</strong> ${escapeHtml(result.explanation || "")}`;
                            if (result.source !== "spotify") html += ` (Spotify: ${escapeHtml(result.spotifyYear)}, ${album})`;
                            const link = yearSourceLink(result.sourceUrl, result.sourceTitle);
                            if (link) html += ` · Källa: ${link}`;
                        } else {
                            const parts = [`Spotify: ${escapeHtml(result.spotifyYear)} (${album})`];
                            if (result.memory) parts.push(`Opus ur minnet: ${escapeHtml(result.memory.year)} (${escapeHtml(result.memory.confidence)})`);
                            if (result.web) {
                                let webPart = `Webbsökning: ${escapeHtml(result.web.year)} (stöd: ${escapeHtml(result.web.support)})`;
                                if (result.web.explanation) webPart += ` – ${escapeHtml(result.web.explanation)}`;
                                const link = result.web.sourceVerified ? yearSourceLink(result.web.sourceUrl, null) : "";
                                if (link) webPart += ` ${link}`;
                                parts.push(webPart);
                            }
                            html = `<strong>Behöver granskas.</strong> ${parts.join(" · ")}`;
                        }
                        infoCell.innerHTML = html;
                        infoTr.style.display = "";
                    };

                    // The cache record for this song. If the year in the field is still the one the
                    // review gave, its source and explanation are saved with it. A year typed by hand
                    // is saved as manual, without them.
                    const buildVerifiedRecord = (year) => {
                        const record = {
                            title: track.title,
                            artist: track.artist,
                            year: year,
                            manuallyVerified: true,
                            sourceList: playlistName,
                            source: "manual",
                            checkedAt: Date.now()
                        };
                        if (pendingResult && String(pendingResult.year) === String(year)) {
                            record.source = pendingResult.source;
                            record.explanation = pendingResult.explanation || null;
                            record.sourceUrl = pendingResult.sourceUrl || null;
                            record.sourceTitle = pendingResult.sourceTitle || null;
                            record.spotifyYear = pendingResult.spotifyYear;
                            record.albumName = pendingResult.albumName || null;
                            record.albumType = pendingResult.albumType || null;
                            record.releaseDate = pendingResult.releaseDate || null;
                        }
                        return record;
                    };

                    // The titles and artists come from Spotify, and a song can also have been put
                    // in by a script, so nothing from the list is inserted as raw HTML
                    tr.innerHTML = `
                        <td style="font-weight: 500;">${escapeHtml(track.title)}</td>
                        <td style="color: var(--text-muted);">${escapeHtml(track.artist)}</td>
                        <td>
                            <input type="number" class="edit-year-input" data-track="${escapeHtml(trackId)}" value="${escapeHtml(track.year)}" style="width: 70px; text-align: center; padding: 6px; border-radius: 4px; border: 1px solid var(--border); background: rgba(0,0,0,0.3); color: #fff; font-weight: bold;">
                        </td>
                        <td style="display: flex; gap: 8px; flex-wrap: wrap;">
                            <button class="btn-success save-year-btn" style="padding: 6px 10px; font-size: 13px; display: none;">Spara</button>
                            <button class="btn-primary ai-scan-btn" data-track="${escapeHtml(trackId)}" style="padding: 6px 10px; font-size: 13px;">🤖 AI-Sök</button>
                            <a href="https://www.google.com/search?q=${googleQuery}" target="_blank" class="btn-info" style="text-decoration: none; padding: 6px 10px; font-size: 13px; border-radius: 8px;">🔍 Google</a>
                            <button class="btn-danger del-track-btn" data-track="${escapeHtml(trackId)}" style="padding: 6px 10px; font-size: 13px;">🗑️ Ta bort</button>
                        </td>
                    `;

                    const input = tr.querySelector(".edit-year-input");
                    const saveBtn = tr.querySelector(".save-year-btn");

                    // Visa Spara-knappen om värdet ändras
                    input.addEventListener("input", () => {
                        saveBtn.style.display = "inline-block";
                    });

                    // Spara nytt årtal
                    saveBtn.addEventListener("click", async () => {
                        const newYear = input.value;
                        try {
                            saveBtn.textContent = "...";
                            saveBtn.disabled = true;
                            // Spara i standardList
                            await set(ref(db, `standardLists/${playlistName}/songs/${trackId}/year`), newYear);
                            // Spara i cache!
                            await set(ref(db, `verifiedTracks/${trackId}`), buildVerifiedRecord(newYear));
                            // Ta ev bort flaggningar (om det finns)
                            await set(ref(db, `flaggedTracks/${trackId}`), null);
                            
                            saveBtn.style.display = "none";
                            saveBtn.textContent = "Spara";
                            saveBtn.disabled = false;
                            input.style.borderColor = "var(--success)";
                            setTimeout(() => input.style.borderColor = "var(--border)", 2000);
                        } catch (err) {
                            alert("Kunde inte spara årtal: " + err);
                            saveBtn.textContent = "Spara";
                            saveBtn.disabled = false;
                        }
                    });

                    // Ta bort låt från listan
                    tr.querySelector(".del-track-btn").addEventListener("click", async () => {
                        if (confirm(`Vill du ta bort "${track.title}" från listan?`)) {
                            try {
                                await set(ref(db, `standardLists/${playlistName}/songs/${trackId}`), null);
                                tr.remove();
                                infoTr.remove();
                            } catch (err) {
                                alert("Kunde inte ta bort låten: " + err);
                            }
                        }
                    });

                    // AI-Sök: Spotify's year reviewed by Claude, with a web search when the year changes.
                    // The server reads the track from Spotify itself, so only the id is sent.
                    tr.querySelector(".ai-scan-btn").addEventListener("click", async (e) => {
                        const btn = e.target;
                        btn.disabled = true;
                        btn.textContent = "Söker...";
                        try {
                            // A web search can take a while, so the default limit of 70 s is raised
                            const resolveSongYear = httpsCallable(functions, 'resolveSongYear', { timeout: 300000 });
                            const response = await resolveSongYear({ trackIds: [trackId] });
                            const result = response && response.data && Array.isArray(response.data.results)
                                ? response.data.results[0]
                                : null;

                            if (result && result.status === "ok") {
                                pendingResult = result;
                                input.value = result.year;
                                saveBtn.style.display = "inline-block"; // Trigger save button
                                showYearInfo(result);
                                btn.textContent = "AI Hittade!";
                                btn.style.background = "var(--success)";
                            } else if (result && result.status === "needsReview") {
                                // No year is suggested: the field keeps its value and the answers are shown
                                pendingResult = null;
                                showYearInfo(result);
                                btn.textContent = "Behöver granskas";
                                btn.style.background = "var(--warning)";
                            } else if (result && (result.status === "notFound" || result.status === "noSpotifyYear")) {
                                btn.textContent = "Kunde ej hitta";
                                btn.style.background = "var(--danger)";
                            } else {
                                btn.textContent = "Fel!";
                            }
                        } catch (err) {
                            console.error(err);
                            btn.textContent = "Fel!";
                        }
                        setTimeout(() => {
                            btn.disabled = false;
                            btn.textContent = "🤖 AI-Sök";
                            btn.style.background = "var(--primary)";
                        }, 3000);
                    });

                    tbody.appendChild(tr);
                    tbody.appendChild(infoTr);
                }

                modal.style.display = "block";
            }

            function loadUsers() {
                const tbody = document.getElementById("usersTableBody");
                tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">Laddar användare...</td></tr>';

                get(ref(db, 'users')).then(snap => {
                    tbody.innerHTML = '';
                    if (!snap.exists()) {
                        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">Inga användare hittades.</td></tr>';
                        return;
                    }

                    const users = snap.val();
                    for (const [uid, data] of Object.entries(users)) {
                        const email = data.email || "Okänd e-post";
                        const lastLoginRaw = data.lastLogin || "";
                        const lastLogin = lastLoginRaw ? new Date(lastLoginRaw).toLocaleString("sv-SE") : "Aldrig";
                        
                        // Räkna inloggningsdagar
                        const loginsObj = data.logins || {};
                        const loginDaysCount = Object.keys(loginsObj).length;
                        
                        // Formatera historik för tooltip/alert
                        let historyStr = "";
                        if(loginDaysCount > 0) {
                            historyStr = Object.keys(loginsObj).sort().reverse().join("\n");
                        } else {
                            historyStr = "Ingen historik";
                        }

                        const tr = document.createElement("tr");
                        tr.innerHTML = `
                            <td style="font-weight: 500;">${escapeHtml(email)}</td>
                            <td style="color: var(--text-muted); font-size: 13px; font-family: monospace;">${escapeHtml(uid)}</td>
                            <td>${escapeHtml(lastLogin)}</td>
                            <td>
                                <button class="btn-info view-history-btn" style="padding: 6px 12px; font-size: 13px;" data-history="${escapeHtml(historyStr)}">📅 Historik (${loginDaysCount} dgr)</button>
                                <button class="btn-danger delete-user-btn" data-uid="${escapeHtml(uid)}" style="padding: 6px 12px; font-size: 13px; margin-left: 5px;">🗑️ Ta bort data</button>
                            </td>
                        `;
                        
                        tr.querySelector(".view-history-btn").addEventListener("click", (e) => {
                            const hist = e.target.getAttribute("data-history");
                            alert("Inloggningshistorik (unika dagar):\n\n" + hist);
                        });

                        tr.querySelector(".delete-user-btn").addEventListener("click", async (e) => {
                            const delUid = e.target.getAttribute("data-uid");
                            if (confirm(`Är du helt säker på att du vill radera all speldata för användaren ${delUid}? Detta går inte att ångra!`)) {
                                try {
                                    await set(ref(db, `users/${delUid}`), null);
                                    await set(ref(db, `userPlaylists/${delUid}`), null);
                                    tr.remove();
                                    loadDashboardStats();
                                } catch(err) {
                                    alert("Fel vid borttagning: " + err.message);
                                }
                            }
                        });

                        tbody.appendChild(tr);
                    }
                }).catch(err => {
                    tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: red;">Kunde inte hämta användare: ${escapeHtml(err.message)}</td></tr>`;
                });
            }

            // Cache Search Logic
            document.getElementById("cacheSearchBtn").addEventListener("click", performCacheSearch);
            document.getElementById("cacheSearchInput").addEventListener("keypress", (e) => {
                if (e.key === 'Enter') performCacheSearch();
            });

            async function performCacheSearch() {
                const query = document.getElementById("cacheSearchInput").value.trim().toLowerCase();
                const btn = document.getElementById("cacheSearchBtn");
                const tbody = document.getElementById("cacheSearchTableBody");
                const container = document.getElementById("cacheSearchResultsContainer");

                if (!query) {
                    alert("Skriv in något att söka på.");
                    return;
                }

                btn.textContent = "Söker...";
                btn.disabled = true;
                container.style.display = "block";
                tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">Hämtar data...</td></tr>';

                try {
                    const snap = await get(ref(db, 'verifiedTracks'));
                    if (!snap.exists()) {
                        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">Cachen är tom.</td></tr>';
                        btn.textContent = "Sök";
                        btn.disabled = false;
                        return;
                    }

                    const tracks = snap.val();
                    let results = [];

                    for (const [id, t] of Object.entries(tracks)) {
                        const searchString = `${t.title} ${t.artist} ${t.year} ${id}`.toLowerCase();
                        if (searchString.includes(query)) {
                            results.push({ id, ...t });
                        }
                    }

                    if (results.length === 0) {
                        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">Inga träffar hittades.</td></tr>';
                        btn.textContent = "Sök";
                        btn.disabled = false;
                        return;
                    }

                    // Sortera resultat (exakt titel-match först, sen alfabetiskt)
                    results.sort((a, b) => {
                        const aTitle = (a.title || "").toLowerCase();
                        const bTitle = (b.title || "").toLowerCase();
                        if (aTitle === query) return -1;
                        if (bTitle === query) return 1;
                        return aTitle.localeCompare(bTitle);
                    });

                    // Begränsa till max 100 träffar för att undvika frysning
                    if (results.length > 100) {
                        results = results.slice(0, 100);
                        // Visa notis om trunkering?
                    }

                    tbody.innerHTML = '';
                    results.forEach(track => {
                        const tr = document.createElement("tr");
                        const statusTag = track.manuallyVerified ? 
                            '<span style="background:var(--success); padding:2px 6px; border-radius:4px; font-size:10px; color:#fff;">Låst</span>' : 
                            '<span style="background:rgba(255,255,255,0.1); padding:2px 6px; border-radius:4px; font-size:10px; color:#ccc;">Auto</span>';
                        
                        // A cache record can hold what a player reported from the game: the title,
                        // the artist and the record's own key. None of it is inserted as raw HTML.
                        tr.innerHTML = `
                            <td style="font-weight: 500;">${escapeHtml(track.title || "Okänd")}</td>
                            <td style="color: var(--text-muted);">${escapeHtml(track.artist || "Okänd")}</td>
                            <td>
                                <input type="number" class="cache-year-input" data-track="${escapeHtml(track.id)}" value="${escapeHtml(track.year || "")}" style="width: 70px; text-align: center; padding: 6px; border-radius: 4px; border: 1px solid var(--border); background: rgba(0,0,0,0.3); color: #fff; font-weight: bold;">
                            </td>
                            <td>${statusTag}</td>
                            <td style="display: flex; gap: 8px;">
                                <button class="btn-success cache-save-btn" style="padding: 6px 10px; font-size: 13px; display: none;">Spara</button>
                                <button class="btn-danger cache-del-btn" data-track="${escapeHtml(track.id)}" style="padding: 6px 10px; font-size: 13px;">🗑️ Ta bort</button>
                            </td>
                        `;

                        const input = tr.querySelector(".cache-year-input");
                        const saveBtn = tr.querySelector(".cache-save-btn");

                        input.addEventListener("input", () => {
                            saveBtn.style.display = "inline-block";
                        });

                        saveBtn.addEventListener("click", async () => {
                            saveBtn.disabled = true;
                            saveBtn.textContent = "...";
                            try {
                                await update(ref(db, `verifiedTracks/${track.id}`), {
                                    year: input.value,
                                    manuallyVerified: true
                                });
                                // Uppdatera även i alla standardlistor där den ingår
                                await updatePlaylistsWithNewYear(track.id, input.value);
                                
                                saveBtn.style.display = "none";
                                saveBtn.disabled = false;
                                saveBtn.textContent = "Spara";
                                input.style.borderColor = "var(--success)";
                                setTimeout(() => input.style.borderColor = "var(--border)", 2000);
                            } catch (e) {
                                alert("Kunde inte spara: " + e.message);
                                saveBtn.disabled = false;
                                saveBtn.textContent = "Spara";
                            }
                        });

                        tr.querySelector(".cache-del-btn").addEventListener("click", async () => {
                            if (confirm(`Vill du verkligen ta bort "${track.title}" från Cachen? Den kommer läsas in igen vid nästa städning om den finns i en lista.`)) {
                                try {
                                    await set(ref(db, `verifiedTracks/${track.id}`), null);
                                    tr.remove();
                                } catch (e) {
                                    alert("Misslyckades: " + e.message);
                                }
                            }
                        });

                        tbody.appendChild(tr);
                    });

                } catch (err) {
                    alert("Fel vid sökning: " + err.message);
                } finally {
                    btn.textContent = "Sök";
                    btn.disabled = false;
                }
            }

            async function updatePlaylistsWithNewYear(trackId, newYear) {
                const snap = await get(ref(db, 'standardLists'));
                if (snap.exists()) {
                    const lists = snap.val();
                    const updates = {};
                    for (const [listName, listData] of Object.entries(lists)) {
                        if (listData.songs && listData.songs[trackId]) {
                            updates[`standardLists/${listName}/songs/${trackId}/year`] = newYear;
                        }
                    }
                    if (Object.keys(updates).length > 0) {
                        await update(ref(db), updates);
                    }
                }
            }

            document.getElementById("adminLoginBtn").addEventListener("click", () => {
                const email = document.getElementById("adminEmail").value;
                const password = document.getElementById("adminPassword").value;

                signInWithEmailAndPassword(auth, email, password)
                    .then((userCredential) => {
                        const user = userCredential.user;
                        if (user.email === ADMIN_EMAIL) {
                            document.getElementById("adminLoginForm").style.display = "none";
                            document.getElementById("adminContent").style.display = "block";
                        } else {
                            alert("Du har inte behörighet att använda denna sida.");
                            window.location.href = "index.html";
                        }
                    })
                    .catch((error) => {
                        alert("Fel vid inloggning: " + error.message);
                    });
            });

            document.getElementById("addStandardPlaylistButton").addEventListener("click", async () => {
                const rawPlaylistName = document.getElementById("standardPlaylistName").value.trim();
                // Bug #7: Sanitera förbjudna Firebase-tecken (.#$[]/)
                const playlistName = rawPlaylistName.replace(/[.#$\[\]/]/g, '_');
                if (playlistName !== rawPlaylistName) {
                    console.warn(`Spellistenamn sanererat: "${rawPlaylistName}" → "${playlistName}"`);
                }
                const playlistLink = document.getElementById("standardPlaylistLink").value.trim();
                if (!playlistName || !playlistLink) {
                    alert("Fyll i både spellistans namn och länk!");
                    return;
                }
                // The import reviews songs with the same server function as the card "Granska alla
                // årtal", so the two must not run at the same time
                if (yearReviewRunning) {
                    alert("En årtalsgranskning pågår redan. Vänta tills den är klar, eller stoppa den, och försök igen.");
                    return;
                }

                const addBtn = document.getElementById("addStandardPlaylistButton");
                const progressContainer = document.getElementById("importProgressContainer");
                const progressText = document.getElementById("importProgressText");
                const progressCount = document.getElementById("importProgressCount");
                const progressBar = document.getElementById("importProgressBar");
                const resetImportUi = () => {
                    addBtn.disabled = false;
                    addBtn.textContent = "Lägg till";
                    progressContainer.style.display = 'none';
                };

                addBtn.disabled = true;
                addBtn.textContent = 'Laddar låtar...';
                progressContainer.style.display = 'block';
                progressBar.style.width = '0%';
                progressText.textContent = 'Hämtar från Spotify...';
                progressCount.textContent = '';

                let tracks;
                let unavailable = 0;
                try {
                    ({ tracks, unavailable } = await fetchSpotifyPlaylist(playlistLink));
                } catch (e) {
                    alert("Misslyckades hämta spellistan: " + e.message);
                    resetImportUi();
                    return;
                }

                if (!tracks || Object.keys(tracks).length === 0) {
                    alert("Ingen data hämtades från spellistan. Kontrollera att länken är korrekt!");
                    resetImportUi();
                    return;
                }

                yearReviewRunning = true;
                yearReviewStartBtn.disabled = true;
                yearReviewWebBtn.disabled = true;
                yearReviewApplyBtn.disabled = true;

                try {
                    const readCacheAndReviews = async () => {
                        const [verifiedSnap, reviewsSnap] = await Promise.all([
                            get(ref(db, "verifiedTracks")),
                            get(ref(db, "yearReviews"))
                        ]);
                        return { verified: verifiedSnap.val() || {}, reviews: reviewsSnap.val() || {} };
                    };

                    progressText.textContent = 'Läser cachen och tidigare granskningar...';
                    let state = await readCacheAndReviews();

                    // Songs without a stored review are sent to the server. A song that was reviewed
                    // before, for another list or in an import that was interrupted, is not paid for again.
                    const toReview = classifyYearReviews({ [playlistName]: { songs: tracks } }, state.verified, state.reviews).pending;
                    let reviewedNow = 0;
                    if (toReview.length > 0) {
                        progressText.textContent = 'Granskar årtalen...';
                        addBtn.textContent = `Granskar ${toReview.length} låtar...`;
                        const showProgress = (progress) => {
                            const handled = progress.done + progress.failed;
                            progressCount.textContent = `${handled} / ${progress.total}`;
                            progressBar.style.width = `${Math.round((handled / progress.total) * 100)}%`;
                        };
                        const run = await resolveYearsInBatches(toReview, { webWhenUncertain: true }, showProgress, () => false);
                        reviewedNow = run.done;
                        state = await readCacheAndReviews();
                    }

                    progressText.textContent = 'Sparar...';
                    progressCount.textContent = '';
                    progressBar.style.width = '100%';
                    addBtn.textContent = 'Sparar...';

                    const plan = buildImportPlan(playlistName, tracks, state.verified, state.reviews, Date.now());

                    // The cache first, so the explanations are in place when the list shows up in the game
                    const cacheIds = Object.keys(plan.cacheUpdates);
                    for (let i = 0; i < cacheIds.length; i += APPLY_CHUNK_SIZE) {
                        const chunk = {};
                        for (const id of cacheIds.slice(i, i + APPLY_CHUNK_SIZE)) chunk[id] = plan.cacheUpdates[id];
                        await update(ref(db, "verifiedTracks"), chunk);
                    }
                    await set(ref(db, `standardLists/${playlistName}`), { songs: plan.songs });

                    alert(importSummaryText(playlistName, plan.counts, reviewedNow, unavailable));
                    document.getElementById("standardPlaylistName").value = '';
                    document.getElementById("standardPlaylistLink").value = '';
                } catch (e) {
                    console.error("[Import] Importen avbröts:", e);
                    alert("Importen avbröts: " + e.message + "\n\nListan är inte sparad. Granskningar som hann bli klara är sparade och körs inte om, så det går att importera listan igen.");
                } finally {
                    yearReviewRunning = false;
                    yearReviewStartBtn.disabled = false;
                    yearReviewWebBtn.disabled = false;
                    yearReviewApplyBtn.disabled = !yearReviewCanApply;
                    resetImportUi();
                }
            });

            async function fetchSpotifyPlaylist(playlistUrl) {
                let input = playlistUrl.trim();

                // Bug #9: Detektera fel URL-typ innan API-anrop
                if (input.includes("/album/") || input.includes("spotify:album:")) {
                    throw new Error("Det där är en albumlänk, inte en spellista.\n\nGå till en Spotify-spellista, kopiera dess länk och försök igen.");
                }
                if (input.includes("/track/") || input.includes("spotify:track:")) {
                    throw new Error("Det där är en låtlänk, inte en spellista.\n\nGå till en Spotify-spellista, kopiera dess länk och försök igen.");
                }

                let playlistId = input;
                if (playlistId.includes("/playlist/")) {
                    playlistId = playlistId.split("/playlist/")[1].split("?")[0];
                } else if (playlistId.includes("spotify:playlist:")) {
                    playlistId = playlistId.split("spotify:playlist:")[1].split("?")[0];
                }

                // Spotify-genererade listor har alltid ID som börjar med 37i9dQ
                if (playlistId.startsWith("37i9dQ")) {
                    throw new Error("Det här är en personlig spellista genererad av Spotify (t.ex. Discover Weekly, Daily Mix eller Release Radar).\n\nSådana listor är privata och kan inte importeras. Skapa en egen spellista i Spotify, lägg till låtarna och importera den istället.");
                }

                const token = await getBackendSpotifyToken();
                let tracks = {};
                let unavailable = 0;
                let nextUrl = `https://api.spotify.com/v1/playlists/${playlistId}/tracks`;

                while (nextUrl) {
                    const response = await fetch(nextUrl, {
                        headers: { "Authorization": `Bearer ${token}` }
                    });

                    if (!response.ok) {
                        if (response.status === 403 || response.status === 404) {
                            throw new Error("Spellistan är privat eller finns inte.\n\nSe till att spellistan är publik i Spotify: öppna spellistan → klicka de tre prickarna (···) → Dela → markera 'Offentlig'.");
                        }
                        throw new Error(`Spotify svarade med ett oväntat fel (Status: ${response.status}). Kontrollera att länken är korrekt och försök igen.`);
                    }

                    const data = await response.json();
                    data.items.forEach(item => {
                        // Bug #6: Skip null tracks (local files, deleted songs)
                        if (!item.track || !item.track.id) return;
                        // A song Spotify has withdrawn comes back as an empty shell: no name, no artist
                        // and the date "0000". It cannot be played or reviewed, so it is left out and counted.
                        if (typeof item.track.name !== "string" || item.track.name.trim() === "") {
                            unavailable++;
                            return;
                        }
                        const trackId = item.track.id;
                        tracks[trackId] = {
                            title: item.track.name,
                            artist: item.track.artists.map(artist => artist.name).join(", "),
                            year: item.track.album.release_date ? item.track.album.release_date.substring(0, 4) : null
                        };
                    });
                    nextUrl = data.next;
                }
                return { tracks, unavailable };
            }

            async function getBackendSpotifyToken() {
                try {
                    const getSpotifyTokenFn = httpsCallable(functions, 'getSpotifyToken');
                    const result = await getSpotifyTokenFn();
                    return result.data.access_token;
                } catch (error) {
                    console.error("Fel vid hämtning av token via Firebase backend:", error);
                    return null;
                }
            }

            // --- YEAR REVIEW OF ALL SONGS ---
            // Runs resolveSongYear over the songs in the standard lists, or over the songs that are
            // only in the users' own playlists. The server stores every result in yearReviews, which
            // the game does not read, so nothing here changes the game until the years are applied.
            const REVIEW_BATCH_SIZE = 10;      // resolveSongYear accepts at most 10 ids per call
            const REVIEW_PARALLEL_CALLS = 2;
            let yearReviewRunning = false;
            let yearReviewStopRequested = false;
            // True when the latest summary showed that there is something to apply. For the standard
            // lists that takes a review of every song; the users' songs may be reviewed in parts.
            let yearReviewCanApply = false;

            const yearReviewCountsEl = document.getElementById("yearReviewCounts");
            const yearReviewStatusEl = document.getElementById("yearReviewStatus");
            const yearReviewSummaryEl = document.getElementById("yearReviewSummary");
            const yearReviewStartBtn = document.getElementById("yearReviewStartBtn");
            const yearReviewWebBtn = document.getElementById("yearReviewWebBtn");
            const yearReviewStopBtn = document.getElementById("yearReviewStopBtn");
            const yearReviewSummaryBtn = document.getElementById("yearReviewSummaryBtn");
            const yearReviewApplyBtn = document.getElementById("yearReviewApplyBtn");
            const yearReviewApplyBox = document.getElementById("yearReviewApplyBox");
            const yearReviewScopeEl = document.getElementById("yearReviewScope");

            // Which songs the card works on: "standard" for the standard lists, "users" for the songs
            // in the users' own playlists that are in no standard list
            const currentYearScope = () => (yearReviewScopeEl.value === "users" ? "users" : "standard");

            // Reads what the review works on. For "users", lists is one made-up list with the users'
            // songs (see collectUserSongs); the review queue always asks for "standard".
            async function loadYearReviewData(scope = "standard") {
                const [listsSnap, verifiedSnap, reviewsSnap, userSnap] = await Promise.all([
                    get(ref(db, "standardLists")),
                    get(ref(db, "verifiedTracks")),
                    get(ref(db, "yearReviews")),
                    scope === "users" ? get(ref(db, "userPlaylists")) : Promise.resolve(null)
                ]);
                const standardLists = listsSnap.val();
                const verified = verifiedSnap.val();
                const lists = scope === "users" ? collectUserSongs(userSnap.val(), standardLists, verified) : standardLists;
                return { scope, lists, verified, reviews: reviewsSnap.val() };
            }

            async function loadYearReviewSummary(scope) {
                const data = await loadYearReviewData(scope);
                return classifyYearReviews(data.lists, data.verified, data.reviews);
            }

            // Changing which songs the card works on makes what is shown stale
            yearReviewScopeEl.addEventListener("change", () => {
                closeYearApplyBox();
                yearReviewSummaryEl.innerHTML = "";
                yearReviewStatusEl.textContent = "";
                yearReviewCountsEl.textContent = 'Tryck på "Visa sammanställning" för att läsa läget.';
                yearReviewWebBtn.textContent = "Sök på osäkra";
                yearReviewCanApply = false;
                yearReviewApplyBtn.disabled = true;
            });

            // One table of songs. columns: [{ title, cell: entry => html }]. Every value is escaped by the cell functions.
            function yearReviewTable(heading, entries, columns) {
                if (entries.length === 0) return "";
                const head = columns.map(column => `<th>${column.title}</th>`).join("");
                const rows = entries.map(entry => `<tr>${columns.map(column => `<td>${column.cell(entry)}</td>`).join("")}</tr>`).join("");
                return `<h4 style="margin: 20px 0 8px;">${heading} (${entries.length})</h4>
                    <div style="overflow: auto; max-height: 420px;"><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
            }

            function renderYearReviewSummary(summary, scope) {
                const reviewed = summary.total - summary.pending.length;
                const where = scope === "users" ? "användarnas listor (utanför standardlistorna)" : "standardlistorna";
                yearReviewCountsEl.textContent = `${summary.total} låtar i ${where} · ${reviewed} granskade · ${summary.pending.length} kvar`;
                yearReviewWebBtn.textContent = `Sök på osäkra (${summary.needsWeb.length})`;
                // For the standard lists applying is only offered when every song has been reviewed.
                // The users' songs may be reviewed in parts, so there it takes one reviewed song.
                yearReviewCanApply = scope === "users" ? reviewed > 0 : (summary.total > 0 && summary.pending.length === 0);
                yearReviewApplyBtn.disabled = yearReviewRunning || !yearReviewCanApply;

                const songColumns = [
                    { title: "Artist", cell: entry => escapeHtml(entry.artist) },
                    { title: "Titel", cell: entry => escapeHtml(entry.title) }
                ];
                const explanationCell = entry => {
                    const review = entry.review;
                    const link = yearSourceLink(review.sourceUrl, review.sourceTitle);
                    return `<strong>${escapeHtml(YEAR_SOURCE_LABELS[review.source] || review.source)}:</strong> ${escapeHtml(review.explanation || "")}${link ? ` · ${link}` : ""}`;
                };
                const changeColumns = [
                    ...songColumns,
                    { title: "Nu", cell: entry => escapeHtml(entry.currentYear) },
                    { title: "Nytt", cell: entry => `<strong>${escapeHtml(entry.review.year)}</strong>` },
                    { title: "Källa och förklaring", cell: explanationCell }
                ];
                const reviewColumns = [
                    ...songColumns,
                    { title: "Nu", cell: entry => escapeHtml(entry.currentYear) + (entry.locked ? " (låst)" : "") },
                    { title: "Spotify", cell: entry => `${escapeHtml(entry.review.spotifyYear)} (${escapeHtml(entry.review.albumName || "okänt album")})` },
                    { title: "Opus ur minnet", cell: entry => entry.review.memory ? `${escapeHtml(entry.review.memory.year)} (${escapeHtml(entry.review.memory.confidence)})` : "inget svar" },
                    { title: "Webbsökning", cell: entry => {
                        const web = entry.review.web;
                        if (!web) return "inget svar";
                        const link = web.sourceVerified ? yearSourceLink(web.sourceUrl, null) : "";
                        return `${escapeHtml(web.year)} (stöd: ${escapeHtml(web.support)}) ${escapeHtml(web.explanation || "")} ${link}`;
                    } }
                ];
                const notFoundColumns = [
                    ...songColumns,
                    { title: "Nu", cell: entry => escapeHtml(entry.currentYear) },
                    { title: "Orsak", cell: entry => entry.review.status === "noSpotifyYear" ? "Spotify har inget utgivningsdatum för albumet" : "Spotify känner inte igen låtens id" }
                ];

                yearReviewSummaryEl.innerHTML = `
                    <ul style="margin: 12px 0 0 20px; line-height: 1.7;">
                        <li>Oförändrat år: <strong>${summary.unchanged}</strong></li>
                        <li>Året ändras: <strong>${summary.changes.length}</strong></li>
                        <li>Behöver granskas: <strong>${summary.needsReview.length}</strong></li>
                        <li>Avgjorda för hand i fliken Flaggat: <strong>${summary.resolved}</strong></li>
                        <li>Låsta av dig, samma år som granskningen: <strong>${summary.lockedSame}</strong></li>
                        <li>Låsta av dig, granskningen säger ett annat år: <strong>${summary.lockedDiffers.length}</strong></li>
                        <li>Hittades inte hos Spotify: <strong>${summary.notFound.length}</strong></li>
                        <li>Väntar på extra webbsökning (osäkra, eller annat år än spelets utan källa): <strong>${summary.needsWeb.length}</strong></li>
                    </ul>
                    ${yearReviewTable("Året ändras", summary.changes, changeColumns)}
                    ${yearReviewTable("Behöver granskas", summary.needsReview, reviewColumns)}
                    ${yearReviewTable("Låsta av dig där granskningen säger ett annat år", summary.lockedDiffers, changeColumns)}
                    ${yearReviewTable("Hittades inte hos Spotify", summary.notFound, notFoundColumns)}
                `;
            }

            yearReviewSummaryBtn.addEventListener("click", async () => {
                yearReviewSummaryBtn.disabled = true;
                try {
                    if (!yearReviewRunning) yearReviewStatusEl.textContent = "Läser läget...";
                    const scope = currentYearScope();
                    renderYearReviewSummary(await loadYearReviewSummary(scope), scope);
                    if (!yearReviewRunning) yearReviewStatusEl.textContent = "";
                } catch (err) {
                    console.error("[Årtalsgranskning] Kunde inte läsa läget:", err);
                    yearReviewStatusEl.textContent = "Kunde inte läsa läget: " + err.message;
                }
                yearReviewSummaryBtn.disabled = false;
            });

            yearReviewStopBtn.addEventListener("click", () => {
                yearReviewStopRequested = true;
                yearReviewStopBtn.disabled = true;
                yearReviewStatusEl.textContent = "Stoppar när de pågående anropen är klara...";
            });

            /**
             * Sends track ids to resolveSongYear, ten per call and two calls at a time. The server
             * stores every result in yearReviews. A call that fails is tried once more; songs that
             * still fail are left without a review, so the next run takes them again.
             *
             * requestOptions: extra fields for the request, such as { forceWeb: true }
             * onProgress:     called with { done, failed, total } at the start and after every call
             * shouldStop:     () => true to stop before the next call
             *
             * Returns { done, failed, stopped }. stopped is true when songs were left because
             * shouldStop said so.
             */
            async function resolveYearsInBatches(ids, requestOptions, onProgress, shouldStop) {
                const batches = [];
                for (let i = 0; i < ids.length; i += REVIEW_BATCH_SIZE) batches.push(ids.slice(i, i + REVIEW_BATCH_SIZE));

                // A batch with web searches can take a few minutes, so the default limit of 70 s is raised
                const resolveSongYear = httpsCallable(functions, 'resolveSongYear', { timeout: 540000 });
                let done = 0;
                let failed = 0;
                let nextBatch = 0;
                const reportProgress = () => onProgress({ done, failed, total: ids.length });

                const runBatch = async (batchIds) => {
                    for (let attempt = 1; attempt <= 2; attempt++) {
                        try {
                            const response = await resolveSongYear({ trackIds: batchIds, store: true, ...requestOptions });
                            const results = response && response.data && Array.isArray(response.data.results) ? response.data.results : null;
                            if (!results) throw new Error("Svaret saknar resultat.");
                            const failedHere = results.filter(result => result.status === "error").length;
                            failed += failedHere;
                            done += batchIds.length - failedHere;
                            return;
                        } catch (err) {
                            console.error(`[Årtalsgranskning] Anrop misslyckades (försök ${attempt}/2):`, err);
                            if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 5000));
                        }
                    }
                    failed += batchIds.length;
                };

                const worker = async () => {
                    while (nextBatch < batches.length && !shouldStop()) {
                        const batchIds = batches[nextBatch++];
                        await runBatch(batchIds);
                        reportProgress();
                    }
                };
                reportProgress();
                await Promise.all(Array.from({ length: Math.min(REVIEW_PARALLEL_CALLS, batches.length) }, worker));

                return { done, failed, stopped: nextBatch < batches.length };
            }

            /**
             * Runs resolveSongYear over a set of songs and stores the results.
             * pickIds:         summary => ids of the songs to run, from the current state
             * forceWeb:        true runs the web search for every song, also where Claude keeps the year
             * nothingToDoText: shown when pickIds gives no songs
             */
            async function runYearReview(pickIds, forceWeb, nothingToDoText) {
                if (yearReviewRunning) return;
                const limit = parseInt(document.getElementById("yearReviewLimit").value, 10);
                if (!Number.isInteger(limit) || limit < 1) {
                    yearReviewStatusEl.textContent = "Ange hur många låtar som ska granskas.";
                    return;
                }

                // The songs are the ones chosen when the run starts; the choice is locked meanwhile
                const scope = currentYearScope();
                yearReviewRunning = true;
                yearReviewStopRequested = false;
                yearReviewScopeEl.disabled = true;
                yearReviewStartBtn.disabled = true;
                yearReviewWebBtn.disabled = true;
                yearReviewApplyBtn.disabled = true;
                yearReviewApplyBox.style.display = "none";
                pendingYearApply = null;
                yearReviewStopBtn.disabled = false;

                try {
                    yearReviewStatusEl.textContent = "Läser läget...";
                    const before = await loadYearReviewSummary(scope);
                    renderYearReviewSummary(before, scope);

                    const todo = pickIds(before).slice(0, limit);
                    if (todo.length === 0) {
                        yearReviewStatusEl.textContent = nothingToDoText;
                        return;
                    }

                    const showProgress = (progress) => {
                        yearReviewStatusEl.textContent = `Granskar... ${progress.done + progress.failed} / ${progress.total}` + (progress.failed > 0 ? ` (${progress.failed} misslyckade)` : "");
                    };
                    // The users' songs get the web search in the same run when the review is not
                    // certain, like an import. The standard lists keep their two runs.
                    let requestOptions = {};
                    if (forceWeb) requestOptions = { forceWeb: true };
                    else if (scope === "users") requestOptions = { webWhenUncertain: true };
                    const run = await resolveYearsInBatches(todo, requestOptions, showProgress, () => yearReviewStopRequested);

                    renderYearReviewSummary(await loadYearReviewSummary(scope), scope);
                    yearReviewStatusEl.textContent = `${run.stopped ? "Stoppad" : "Klar"}: ${run.done} låtar granskade` + (run.failed > 0 ? `, ${run.failed} misslyckades och körs om nästa gång.` : ".");
                } catch (err) {
                    console.error("[Årtalsgranskning] Körningen avbröts:", err);
                    yearReviewStatusEl.textContent = "Körningen avbröts: " + err.message;
                } finally {
                    yearReviewRunning = false;
                    yearReviewScopeEl.disabled = false;
                    yearReviewStartBtn.disabled = false;
                    yearReviewWebBtn.disabled = false;
                    yearReviewApplyBtn.disabled = !yearReviewCanApply;
                    yearReviewStopBtn.disabled = true;
                }
            }

            yearReviewStartBtn.addEventListener("click", () =>
                runYearReview(summary => summary.pending, false, "Alla låtar är redan granskade."));
            yearReviewWebBtn.addEventListener("click", () =>
                runYearReview(summary => summary.needsWeb, true, "Inga låtar väntar på extra webbsökning."));

            // --- APPLY THE REVIEWED YEARS ---
            // The only part of the year review that changes what the game uses. For the standard lists
            // it writes the reviewed years to verifiedTracks and standardLists, after a backup of both
            // has been downloaded. For the users' songs it writes verifiedTracks only: the game takes
            // the cache's year before the playlist's, so the users' own playlists are left as they are.
            // Writing the same plan twice gives the same result, so an interrupted run can be repeated.
            const APPLY_CHUNK_SIZE = 200;
            // The data and the plan shown in the confirmation box, until the user confirms or cancels
            let pendingYearApply = null;

            // Saves what is about to be changed, as it was read, to a file on this computer
            function downloadYearBackup(data) {
                const createdAt = new Date().toISOString();
                const fileName = `notestream-sakerhetskopia-${createdAt.slice(0, 16).replace(/[:T]/g, "-")}.json`;
                const backup = data.scope === "users"
                    ? {
                        createdAt: createdAt,
                        note: "verifiedTracks as it was before the reviewed years for the users' songs were applied",
                        verifiedTracks: data.verified
                    }
                    : {
                        createdAt: createdAt,
                        note: "verifiedTracks and standardLists as they were before the reviewed years were applied",
                        verifiedTracks: data.verified,
                        standardLists: data.lists
                    };
                const url = URL.createObjectURL(new Blob([JSON.stringify(backup)], { type: "application/json" }));
                const link = document.createElement("a");
                link.href = url;
                link.download = fileName;
                document.body.appendChild(link);
                link.click();
                link.remove();
                setTimeout(() => URL.revokeObjectURL(url), 60000);
                return fileName;
            }

            function closeYearApplyBox() {
                pendingYearApply = null;
                yearReviewApplyBox.style.display = "none";
                yearReviewApplyBox.innerHTML = "";
            }

            // First click: read the current state and show exactly what would be written
            yearReviewApplyBtn.addEventListener("click", async () => {
                if (yearReviewRunning) return;
                yearReviewApplyBtn.disabled = true;
                try {
                    yearReviewStatusEl.textContent = "Läser läget...";
                    const scope = currentYearScope();
                    const data = await loadYearReviewData(scope);
                    const plan = buildYearApplyPlan(data.lists, data.verified, data.reviews, Date.now());
                    const counts = plan.counts;
                    yearReviewStatusEl.textContent = "";

                    if (scope === "standard" && counts.pending > 0) {
                        yearReviewStatusEl.textContent = `${counts.pending} låtar är inte granskade än. Kör "Starta / Fortsätt" först.`;
                        return;
                    }
                    // The plan's list for the users' songs is made up on this page, so its list
                    // writes do not count there
                    const nothingToWrite = counts.applied === 0 && (scope === "users" || counts.listWrites === 0);
                    if (nothingToWrite) {
                        yearReviewStatusEl.textContent = counts.alreadyApplied > 0
                            ? "Alla granskade låtar är redan verkställda."
                            : "Det finns inga granskade låtar att verkställa än.";
                        return;
                    }

                    pendingYearApply = { data, plan };
                    const warning = counts.needsWeb > 0
                        ? `<p style="color: var(--warning); margin: 8px 0;">${counts.needsWeb} låtar väntar på extra webbsökning. De verkställs ändå om du fortsätter.</p>`
                        : "";
                    // What is written besides the cache, what is left alone, and what is backed up
                    const listLine = scope === "users"
                        ? `<li>Användarnas egna listor ändras inte: spelet tar cachens år före listans</li>`
                        : `<li><strong>${counts.listWrites}</strong> år skrivs i ${Object.keys(plan.listUpdates).length} standardlistor</li>`;
                    const untouchedParts = [
                        `${counts.locked} låsta låtar`,
                        `${counts.needsReview} som behöver granskas`,
                        `${counts.notFound} som inte hittades hos Spotify`
                    ];
                    if (counts.alreadyApplied > 0) untouchedParts.push(`${counts.alreadyApplied} som redan är verkställda`);
                    if (scope === "users" && counts.pending > 0) untouchedParts.push(`${counts.pending} som inte är granskade än`);
                    const untouched = untouchedParts.slice(0, -1).join(", ") + " och " + untouchedParts[untouchedParts.length - 1];
                    const backupText = scope === "users" ? "cachen" : "cachen och listorna";
                    // Only numbers and fixed text are put into this box
                    yearReviewApplyBox.innerHTML = `
                        <p style="font-weight: 600; margin-bottom: 8px;">Det här skrivs om du verkställer:</p>
                        <ul style="margin: 0 0 8px 20px; line-height: 1.7;">
                            <li><strong>${counts.applied}</strong> låtar får en ny post i cachen, med år, källa och förklaring</li>
                            <li><strong>${counts.changed}</strong> av dem får ett annat år än spelet har idag</li>
                            ${listLine}
                        </ul>
                        <p style="margin-bottom: 8px;">Rörs inte: ${untouched}.</p>
                        ${warning}
                        <p style="margin-bottom: 12px;">En säkerhetskopia av ${backupText} laddas ner till den här datorn innan något skrivs.</p>
                        <button id="yearReviewApplyConfirmBtn" class="btn-success" style="white-space: nowrap;">Ja, verkställ</button>
                        <button id="yearReviewApplyCancelBtn" class="btn-secondary" style="white-space: nowrap;">Avbryt</button>
                    `;
                    yearReviewApplyBox.style.display = "block";
                    document.getElementById("yearReviewApplyConfirmBtn").addEventListener("click", applyYearReviews);
                    document.getElementById("yearReviewApplyCancelBtn").addEventListener("click", closeYearApplyBox);
                } catch (err) {
                    console.error("[Årtalsgranskning] Kunde inte ta fram vad som ska skrivas:", err);
                    yearReviewStatusEl.textContent = "Kunde inte läsa läget: " + err.message;
                } finally {
                    yearReviewApplyBtn.disabled = yearReviewRunning;
                }
            });

            // Second click: download the backup, then write the plan that was shown
            async function applyYearReviews() {
                if (!pendingYearApply || yearReviewRunning) return;
                const { data, plan } = pendingYearApply;
                closeYearApplyBox();

                yearReviewRunning = true;
                yearReviewScopeEl.disabled = true;
                yearReviewStartBtn.disabled = true;
                yearReviewWebBtn.disabled = true;
                yearReviewApplyBtn.disabled = true;

                try {
                    const backupFile = downloadYearBackup(data);

                    const ids = Object.keys(plan.cacheUpdates);
                    let written = 0;
                    for (let i = 0; i < ids.length; i += APPLY_CHUNK_SIZE) {
                        const chunk = {};
                        for (const id of ids.slice(i, i + APPLY_CHUNK_SIZE)) chunk[id] = plan.cacheUpdates[id];
                        await update(ref(db, "verifiedTracks"), chunk);
                        written += Object.keys(chunk).length;
                        yearReviewStatusEl.textContent = `Skriver cachen... ${written} / ${ids.length}`;
                    }

                    // The plan's list for the users' songs is made up on this page and is never
                    // written: only the standard lists get their years updated
                    if (data.scope === "standard") {
                        for (const [listName, updates] of Object.entries(plan.listUpdates)) {
                            yearReviewStatusEl.textContent = `Skriver listan "${listName}"...`;
                            await update(ref(db, `standardLists/${listName}/songs`), updates);
                        }
                    }

                    renderYearReviewSummary(await loadYearReviewSummary(data.scope), data.scope);
                    yearReviewStatusEl.textContent = `Klart: ${plan.counts.applied} låtar verkställda, ${plan.counts.changed} fick ett nytt år. Säkerhetskopia: ${backupFile}`;
                } catch (err) {
                    console.error("[Årtalsgranskning] Verkställandet avbröts:", err);
                    yearReviewStatusEl.textContent = "Verkställandet avbröts: " + err.message + ". Tryck på Verkställ igen för att skriva resten.";
                } finally {
                    yearReviewRunning = false;
                    yearReviewScopeEl.disabled = false;
                    yearReviewStartBtn.disabled = false;
                    yearReviewWebBtn.disabled = false;
                    yearReviewApplyBtn.disabled = !yearReviewCanApply;
                }
            }

            // --- REVIEW QUEUE: years that have to be settled by hand ---
            // Songs reported from the game, songs the year review could not settle, and locked songs
            // where it gives another year. Every decision locks the song, writes the year to all its
            // lists and marks the review as resolved, so the song leaves the queue for good. A report
            // is removed with the decision, or thrown away without changing anything.
            const yearQueueTitleEl = document.getElementById("yearQueueTitle");
            const yearQueueStatusEl = document.getElementById("yearQueueStatus");
            const yearQueueListEl = document.getElementById("yearQueueList");
            const yearEnrichBtn = document.getElementById("yearEnrichBtn");
            const yearEnrichBox = document.getElementById("yearEnrichBox");
            const ENRICH_CHUNK_SIZE = 500;
            // The updates shown in the confirmation box, until the user confirms or cancels
            let pendingYearEnrich = null;

            function updateYearQueueCount() {
                const left = yearQueueListEl.querySelectorAll(".year-queue-row").length;
                yearQueueTitleEl.textContent = `Årtal att avgöra (${left})`;
                if (left === 0) yearQueueStatusEl.textContent = "Inga låtar väntar på beslut.";
            }

            // One song in the queue. Everything from the database, from Claude or from a web page is escaped.
            function renderYearQueueEntry(entry) {
                // A reported song has no review when its check has not run
                const review = entry.review || {};
                const memory = review.memory;
                const web = review.web;
                const isReport = entry.kind === "reported";
                const row = document.createElement("div");
                row.className = "year-queue-row";
                row.style.cssText = "border: 1px solid var(--border); border-radius: 8px; padding: 12px; margin-bottom: 10px;";

                let kindText = "Låst av dig, granskningen säger ett annat år";
                if (entry.kind === "needsReview") kindText = "Granskningen kunde inte avgöra året";
                if (isReport) {
                    const reportedAt = Number.isFinite(entry.report.reportedAt) ? new Date(entry.report.reportedAt).toLocaleString("sv-SE") : "okänd tid";
                    kindText = `Rapporterad i spelet som fel årtal (${escapeHtml(entry.report.year)}) · ${escapeHtml(reportedAt)}`;
                }
                let webText = "ingen sökning";
                if (web) {
                    webText = `${escapeHtml(web.year)} (stöd: ${escapeHtml(web.support)})`;
                    if (web.explanation) webText += ` – ${escapeHtml(web.explanation)}`;
                    const link = web.sourceVerified ? yearSourceLink(web.sourceUrl, null) : "";
                    if (link) webText += ` ${link}`;
                    // A report starts a new search, unless the song was searched in the last 30 days or
                    // the day's limit is reached. Then the search shown here is older than the report.
                    if (isReport && Number.isFinite(review.checkedAt) && Number.isFinite(entry.report.reportedAt) && review.checkedAt < entry.report.reportedAt) {
                        webText += " (sökningen gjordes före rapporten)";
                    }
                }
                // When the check for a reported song gives the year the game already has, there is one
                // button: it keeps the year and saves the check's source with it
                const confirmsYear = isReport && !!entry.suggestion && entry.suggestion.year === entry.currentYear;
                const acceptButton = entry.suggestion && !confirmsYear
                    ? `<button class="btn-success year-queue-accept" style="white-space: nowrap;">Godta ${escapeHtml(entry.suggestion.year)}</button>`
                    : "";
                const discardButton = isReport
                    ? `<button class="btn-danger year-queue-discard" style="white-space: nowrap;" title="Tar bort rapporten utan att ändra något i spelet">Kasta rapporten</button>`
                    : "";
                const whereText = entry.lists.length > 0
                    ? `Finns i: ${escapeHtml(entry.lists.join(", "))}`
                    : "Finns inte i någon standardlista (importerad av en användare)";
                const spotifyText = review.spotifyYear != null
                    ? `${escapeHtml(review.spotifyYear)} (${escapeHtml(review.albumName || "okänt album")}, ${escapeHtml(review.albumType || "okänd typ")})`
                    : "ingen uppgift";
                // A report can be written by anyone, so its year may be unreadable. Then there is no
                // year to keep, only one to accept or to type in.
                const hasCurrentYear = Number.isInteger(entry.currentYear);
                const keepButton = hasCurrentYear
                    ? `<button class="btn-secondary year-queue-keep" style="white-space: nowrap;">Behåll ${escapeHtml(entry.currentYear)}</button>`
                    : "";

                row.innerHTML = `
                    <div style="font-weight: 600;">${escapeHtml(entry.artist)} – ${escapeHtml(entry.title)}</div>
                    <div style="color: var(--text-muted); font-size: 13px; margin: 4px 0 8px;">${kindText} · ${whereText}</div>
                    <div style="font-size: 14px; line-height: 1.6; margin-bottom: 10px;">
                        <div><strong>Idag:</strong> ${hasCurrentYear ? escapeHtml(entry.currentYear) : "okänt"}${entry.locked ? " (låst)" : ""}</div>
                        <div><strong>Spotify:</strong> ${spotifyText}</div>
                        <div><strong>Opus ur minnet:</strong> ${memory ? `${escapeHtml(memory.year)} (${escapeHtml(memory.confidence)})` : "inget svar"}</div>
                        <div><strong>Webbsökning:</strong> ${webText}</div>
                    </div>
                    <div class="flex-row" style="align-items: center; flex-wrap: wrap; gap: 8px;">
                        ${acceptButton}
                        ${keepButton}
                        <input type="number" class="year-queue-input" placeholder="Annat år" style="width: 110px;">
                        <button class="btn-info year-queue-custom" style="white-space: nowrap;">Spara annat år</button>
                        ${discardButton}
                        <span class="year-queue-row-status" style="font-size: 13px; color: var(--warning);"></span>
                    </div>
                `;

                const rowStatusEl = row.querySelector(".year-queue-row-status");
                const setButtonsDisabled = (disabled) => {
                    row.querySelectorAll("button").forEach(button => { button.disabled = disabled; });
                };
                const decide = async (choice) => {
                    const customYear = parseInt(row.querySelector(".year-queue-input").value, 10);
                    const decision = buildYearDecision(entry, choice, customYear, Date.now());
                    if (!decision) {
                        rowStatusEl.textContent = "Ange ett giltigt årtal.";
                        return;
                    }
                    setButtonsDisabled(true);
                    rowStatusEl.textContent = "Sparar...";
                    try {
                        // The resolved mark is written after the year: if anything before it fails, the song stays in the queue
                        await set(ref(db, `verifiedTracks/${entry.id}`), decision.cacheRecord);
                        for (const [listName, updates] of Object.entries(decision.listUpdates)) {
                            await update(ref(db, `standardLists/${listName}/songs`), updates);
                        }
                        await set(ref(db, `yearReviews/${entry.id}/resolved`), decision.resolved);
                        // The report is settled with the song, and is removed last for the same reason
                        if (isReport) await set(ref(db, `reportedTracks/${entry.id}`), null);
                        row.remove();
                        updateYearQueueCount();
                    } catch (err) {
                        console.error("[Granskningskö] Kunde inte spara beslutet:", err);
                        rowStatusEl.textContent = "Kunde inte spara: " + err.message;
                        setButtonsDisabled(false);
                    }
                };

                const acceptBtn = row.querySelector(".year-queue-accept");
                if (acceptBtn) acceptBtn.addEventListener("click", () => decide("accept"));
                const keepBtn = row.querySelector(".year-queue-keep");
                if (keepBtn) keepBtn.addEventListener("click", () => decide(confirmsYear ? "accept" : "keep"));
                row.querySelector(".year-queue-custom").addEventListener("click", () => decide("custom"));

                // Removes the report and nothing else. The queue is read again afterwards, because the
                // song may still belong in it for another reason.
                const discardBtn = row.querySelector(".year-queue-discard");
                if (discardBtn) {
                    discardBtn.addEventListener("click", async () => {
                        setButtonsDisabled(true);
                        rowStatusEl.textContent = "Tar bort rapporten...";
                        try {
                            await set(ref(db, `reportedTracks/${entry.id}`), null);
                            await loadYearQueue();
                        } catch (err) {
                            console.error("[Granskningskö] Kunde inte ta bort rapporten:", err);
                            rowStatusEl.textContent = "Kunde inte ta bort rapporten: " + err.message;
                            setButtonsDisabled(false);
                        }
                    });
                }
                return row;
            }

            async function loadYearQueue() {
                yearQueueStatusEl.textContent = "Läser kön...";
                yearEnrichBox.style.display = "none";
                pendingYearEnrich = null;
                try {
                    const [data, reportsSnap] = await Promise.all([loadYearReviewData(), get(ref(db, "reportedTracks"))]);
                    const queue = buildYearQueue(data.lists, data.verified, data.reviews, reportsSnap.val());
                    yearQueueListEl.innerHTML = "";
                    for (const entry of queue) yearQueueListEl.appendChild(renderYearQueueEntry(entry));
                    yearQueueStatusEl.textContent = "";
                    updateYearQueueCount();

                    const enrich = buildLockedEnrichPlan(data.lists, data.verified, data.reviews, Date.now());
                    yearEnrichBtn.textContent = `Lägg till källa och förklaring på låsta låtar (${enrich.count})...`;
                    yearEnrichBtn.disabled = enrich.count === 0;
                } catch (err) {
                    console.error("[Granskningskö] Kunde inte läsa kön:", err);
                    yearQueueStatusEl.textContent = "Kunde inte läsa kön: " + err.message;
                }
            }

            document.getElementById("yearQueueRefreshBtn").addEventListener("click", loadYearQueue);

            function closeYearEnrichBox() {
                pendingYearEnrich = null;
                yearEnrichBox.style.display = "none";
                yearEnrichBox.innerHTML = "";
            }

            // First click: show how many locked songs would get a source and an explanation
            yearEnrichBtn.addEventListener("click", async () => {
                yearEnrichBtn.disabled = true;
                try {
                    const data = await loadYearReviewData();
                    const plan = buildLockedEnrichPlan(data.lists, data.verified, data.reviews, Date.now());
                    if (plan.count === 0) {
                        yearQueueStatusEl.textContent = "Inga låsta låtar saknar källa och förklaring.";
                        return;
                    }
                    pendingYearEnrich = plan;
                    // Only numbers and fixed text are put into this box
                    yearEnrichBox.innerHTML = `
                        <p style="margin-bottom: 8px;"><strong>${plan.count}</strong> låsta låtar får källa och förklaring från granskningen. Det gäller bara låtar där granskningen ger samma år som ditt.</p>
                        <p style="margin-bottom: 12px;">Året och låset ändras inte, och inte heller titel eller artist.</p>
                        <button id="yearEnrichConfirmBtn" class="btn-success" style="white-space: nowrap;">Ja, lägg till</button>
                        <button id="yearEnrichCancelBtn" class="btn-secondary" style="white-space: nowrap;">Avbryt</button>
                    `;
                    yearEnrichBox.style.display = "block";
                    document.getElementById("yearEnrichConfirmBtn").addEventListener("click", applyYearEnrich);
                    document.getElementById("yearEnrichCancelBtn").addEventListener("click", closeYearEnrichBox);
                } catch (err) {
                    console.error("[Granskningskö] Kunde inte läsa läget:", err);
                    yearQueueStatusEl.textContent = "Kunde inte läsa läget: " + err.message;
                } finally {
                    yearEnrichBtn.disabled = false;
                }
            });

            // Second click: write the fields that were counted. Only new fields are written, never year or lock.
            async function applyYearEnrich() {
                if (!pendingYearEnrich) return;
                const plan = pendingYearEnrich;
                closeYearEnrichBox();
                yearEnrichBtn.disabled = true;
                try {
                    const keys = Object.keys(plan.updates);
                    for (let i = 0; i < keys.length; i += ENRICH_CHUNK_SIZE) {
                        const chunk = {};
                        for (const key of keys.slice(i, i + ENRICH_CHUNK_SIZE)) chunk[key] = plan.updates[key];
                        await update(ref(db, "verifiedTracks"), chunk);
                        yearQueueStatusEl.textContent = `Skriver... ${Math.min(i + ENRICH_CHUNK_SIZE, keys.length)} / ${keys.length} fält`;
                    }
                    yearQueueStatusEl.textContent = `Klart: ${plan.count} låsta låtar fick källa och förklaring.`;
                    yearEnrichBtn.textContent = "Lägg till källa och förklaring på låsta låtar (0)...";
                } catch (err) {
                    console.error("[Granskningskö] Kunde inte lägga till källa och förklaring:", err);
                    yearQueueStatusEl.textContent = "Avbröts: " + err.message + ". Tryck på knappen igen för att skriva resten.";
                    yearEnrichBtn.disabled = false;
                }
            }

            // The queue is loaded at sign-in, so the number in its heading is there at once
            onAuthStateChanged(auth, (user) => {
                if (user && user.email === ADMIN_EMAIL) loadYearQueue();
            });

        });
