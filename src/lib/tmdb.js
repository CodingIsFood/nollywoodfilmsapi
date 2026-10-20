/**
 * Minimal The Movie Database (TMDB) v3 client.
 *
 * Mirrors the logic of the former offline `tmdb scraper.py`:
 *   - Discover Nigerian ("with_origin_country=NG") movies by primary release year
 *   - Discover Nigerian TV shows by first air date year
 *   - Fetch details + credits for every title, then flatten into the fields the
 *     `films` table expects.
 *
 * Auth: TMDB v4 read access token (Bearer). Env var: TMDB_API_TOKEN
 */

const BASE_URL = 'https://api.themoviedb.org/3';
const IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';

// TMDB applies a soft rate limit; we keep the same pacing as the old scraper.
const REQUEST_DELAY_MS = 250;

export class TmdbError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'TmdbError';
    this.status = status;
  }
}

function getToken() {
  const token = process.env.TMDB_API_TOKEN;
  if (!token) {
    throw new TmdbError('TMDB_API_TOKEN is not configured', 500);
  }
  return token;
}

async function tmdbGet(path, params = {}) {
  const url = new URL(`${BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, {
      headers: {
        accept: 'application/json',
        Authorization: `Bearer ${getToken()}`,
      },
      // TMDB data changes slowly; don't let Next.js cache these calls forever.
      cache: 'no-store',
    });

    // Retry on rate limiting and transient server errors.
    if ((res.status === 429 || res.status >= 500) && attempt < 2) {
      const retryAfter = parseInt(res.headers.get('retry-after') || '0', 10);
      const waitMs = retryAfter > 0 ? retryAfter * 1000 : 1000 * (attempt + 1);
      await sleep(waitMs);
      continue;
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new TmdbError(`TMDB ${path} failed (${res.status}): ${body.slice(0, 200)}`, res.status);
    }

    return res.json();
  }

  throw new TmdbError(`TMDB ${path} failed after retries`, 503);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Walk every page of a discover endpoint. `onPage(results)` is awaited per page
 * so callers can stream work instead of buffering everything in memory.
 */
async function discoverAll(endpoint, baseParams, onPage, maxPages = 500) {
  let page = 1;
  let totalPages = 1;
  let fetched = 0;

  while (page <= totalPages && page <= maxPages) {
    const data = await tmdbGet(endpoint, { ...baseParams, page });
    totalPages = data.total_pages || 1;
    const results = data.results || [];
    if (results.length === 0) break;

    await onPage(results);
    fetched += results.length;

    if (page >= totalPages) break;
    page += 1;
    await sleep(REQUEST_DELAY_MS);
  }

  return fetched;
}

/**
 * Drop rows we cannot meaningfully store in the `films` table,
 * and normalise TMDB's "empty" placeholders.
 */
function cleanText(value) {
  if (!value) return '';
  const trimmed = String(value).trim();
  if (!trimmed) return '';
  const lower = trimmed.toLowerCase();
  if (lower === 'unknown' || lower === 'n/a') return '';
  return trimmed;
}

function uniq(list) {
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const cleaned = cleanText(item);
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
  }
  return out;
}

function posterUrlFor(posterPath) {
  return posterPath ? `${IMAGE_BASE}${posterPath}` : '';
}

/**
 * Map a discovered movie/TV item + its details/credits to our DB shape.
 */
function mapMovie(details, credits, targetYear) {
  const cast = uniq((credits.cast || []).slice(0, 10).map((c) => c.name));
  const directors = uniq((credits.crew || []).filter((c) => c.job === 'Director').map((c) => c.name));
  const producers = uniq((credits.crew || []).filter((c) => c.job === 'Producer').map((c) => c.name));
  const companies = uniq((details.production_companies || []).map((c) => c.name));

  const year =
    details.release_date && details.release_date.length >= 4
      ? parseInt(details.release_date.slice(0, 4), 10)
      : targetYear;

  return {
    tmdbId: details.id,
    type: 'Movie',
    title: cleanText(details.title),
    releaseYear: year || null,
    description: cleanText(details.overview),
    productionCompany: companies,
    directedBy: directors,
    producedBy: producers,
    cast,
    posterUrl: posterUrlFor(details.poster_path),
  };
}

function mapTv(details, credits, targetYear) {
  const cast = uniq((credits.cast || []).slice(0, 10).map((c) => c.name));
  const creators = uniq((details.created_by || []).map((c) => c.name));

  // Executive producers live inside aggregate credits' per-person `jobs` array.
  const execProducers = [];
  for (const member of credits.crew || []) {
    for (const job of member.jobs || []) {
      if (job.job && job.job.includes('Executive Producer')) {
        execProducers.push(member.name);
        break;
      }
    }
  }

  const networks = (details.networks || []).map((n) => n.name);
  const prodCompanies = (details.production_companies || []).map((p) => p.name);
  const companies = uniq([...networks, ...prodCompanies]);

  const year =
    details.first_air_date && details.first_air_date.length >= 4
      ? parseInt(details.first_air_date.slice(0, 4), 10)
      : targetYear;

  return {
    tmdbId: details.id,
    type: 'TV Show',
    title: cleanText(details.name),
    releaseYear: year || null,
    description: cleanText(details.overview),
    productionCompany: companies,
    directedBy: creators, // creators used as director equivalent (same as legacy scraper)
    producedBy: uniq(execProducers),
    cast,
    posterUrl: posterUrlFor(details.poster_path),
  };
}

/**
 * Fetch one Nigerian movie/TV year range from TMDB.
 *
 * @param {object} opts
 * @param {number} opts.startYear - inclusive start year (primary_release_year / first_air_date_year)
 * @param {number} opts.endYear - inclusive end year
 * @param {(item: object) => Promise<void>} opts.onItem - called for every mapped title
 * @param {(info: object) => void} [opts.onProgress] - optional progress callback
 * @returns {Promise<{considered: number, skipped: number}>}
 */
export async function fetchNigerianContent({ startYear, endYear, onItem, onProgress }) {
  let considered = 0;
  let skipped = 0;
  const years = [];
  for (let y = startYear; y <= endYear; y++) years.push(y);

  for (const year of years) {
    // ---- Movies ----
    await discoverAll(
      '/discover/movie',
      {
        primary_release_year: year,
        language: 'en-US',
        include_adult: 'false',
        include_video: 'false',
        sort_by: 'popularity.desc',
        with_origin_country: 'NG',
      },
      async (results) => {
        for (const movie of results) {
          considered++;
          try {
            const [details, credits] = await Promise.all([
              tmdbGet(`/movie/${movie.id}`, { language: 'en-US' }),
              tmdbGet(`/movie/${movie.id}/credits`, { language: 'en-US' }),
            ]);
            const item = mapMovie(details, credits, year);
            if (!item.title) {
              skipped++;
            } else {
              await onItem(item);
            }
          } catch (err) {
            skipped++;
            if (onProgress) onProgress({ level: 'warn', message: `Movie ${movie.id} failed: ${err.message}` });
          }
          await sleep(REQUEST_DELAY_MS);
          if (onProgress && considered % 10 === 0) {
            onProgress({ level: 'info', message: `Year ${year}: processed ${considered} titles so far` });
          }
        }
      }
    );

    // ---- TV Shows ----
    await discoverAll(
      '/discover/tv',
      {
        first_air_date_year: year,
        language: 'en-US',
        include_adult: 'false',
        sort_by: 'popularity.desc',
        with_origin_country: 'NG',
      },
      async (results) => {
        for (const show of results) {
          considered++;
          try {
            const [details, credits] = await Promise.all([
              tmdbGet(`/tv/${show.id}`, { language: 'en-US' }),
              tmdbGet(`/tv/${show.id}/aggregate_credits`, { language: 'en-US' }),
            ]);
            const item = mapTv(details, credits, year);
            if (!item.title) {
              skipped++;
            } else {
              await onItem(item);
            }
          } catch (err) {
            skipped++;
            if (onProgress) onProgress({ level: 'warn', message: `TV ${show.id} failed: ${err.message}` });
          }
          await sleep(REQUEST_DELAY_MS);
          if (onProgress && considered % 10 === 0) {
            onProgress({ level: 'info', message: `Year ${year}: processed ${considered} titles so far` });
          }
        }
      }
    );
  }

  return { considered, skipped };
}

export { BASE_URL as TMDB_BASE_URL, IMAGE_BASE as TMDB_IMAGE_BASE };
