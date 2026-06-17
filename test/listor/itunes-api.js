// iTunes Search API Helper
// Används för att hämta original-releaseår (mer exakt än Spotify/MusicBrainz)

const ITUNES_API_BASE = 'https://itunes.apple.com/search';

/**
 * Normalize artist name for search
 */
function normalizeArtistForSearch(artistName) {
  if (!artistName) return '';
  
  return artistName
    .toLowerCase()
    .split(/\sfeat\.?\s/i)[0]
    .split(/\sft\.?\s/i)[0]
    .split(/\s&\s/)[0]
    .replace(/[^\w\s]/g, '')
    .trim();
}

/**
 * Normalize title for search
 */
function normalizeTitleForSearch(title) {
  return title
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/\[.*?\]/g, '')
    .replace(/feat\..*/gi, '')
    .replace(/ft\..*/gi, '')
    .replace(/[^\w\s]/g, '')
    .trim();
}

/**
 * Sök efter låt på iTunes och hämta tidigaste release-året
 */
async function getTrackInfo(artist, title) {
  if (!artist || !title) return { found: false };

  try {
    const cleanArtist = normalizeArtistForSearch(artist);
    const cleanTitle = normalizeTitleForSearch(title);
    
    const query = `${cleanArtist} ${cleanTitle}`;
    // Vi hämtar upp till 15 resultat för att öka chansen att hitta originalalbumet
    const url = `${ITUNES_API_BASE}?term=${encodeURIComponent(query)}&entity=song&limit=15`;
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`iTunes API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.results || data.results.length === 0) {
      return { found: false };
    }
    
    // Fallback: Use MusicBrainz string similarity if available, otherwise simple includes
    const isMatch = (str1, str2) => {
        if (window.musicBrainz && window.musicBrainz.stringSimilarity) {
            return window.musicBrainz.stringSimilarity(str1, str2) > 0.6;
        }
        return str1.includes(str2) || str2.includes(str1);
    };

    // Filtrera resultaten så de hyfsat matchar artisten
    const matchingResults = data.results.filter(result => {
       const resultArtist = normalizeArtistForSearch(result.artistName);
       return isMatch(cleanArtist, resultArtist);
    });

    const resultsToUse = matchingResults.length > 0 ? matchingResults : data.results;

    // Hitta det äldsta årtalet
    let earliestYear = null;
    let earliestDate = null;
    let bestResult = null;
    
    resultsToUse.forEach(result => {
      // Skippa karaoke, tribute och covers om vi söker efter originalartisten
      const trackLower = result.trackName.toLowerCase();
      const artistLower = result.artistName.toLowerCase();
      if (trackLower.includes('karaoke') || artistLower.includes('karaoke') || 
          artistLower.includes('tribute') || artistLower.includes('cover')) {
          return;
      }

      if (result.releaseDate) {
        const year = parseInt(result.releaseDate.substring(0, 4));
        if (!earliestYear || year < earliestYear) {
          earliestYear = year;
          earliestDate = result.releaseDate;
          bestResult = result;
        }
      }
    });

    if (!earliestYear) {
      return { found: false };
    }

    return {
      found: true,
      year: earliestYear,
      releaseDate: earliestDate,
      artist: bestResult.artistName,
      title: bestResult.trackName,
      album: bestResult.collectionName,
      data: bestResult
    };
    
  } catch (error) {
    console.error('iTunes API error:', error);
    return { found: false, error: error.message };
  }
}

window.itunesApi = {
  getTrackInfo
};
