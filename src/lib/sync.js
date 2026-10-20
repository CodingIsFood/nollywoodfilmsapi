/**
 * TMDB auto-sync engine.
 *
 * Responsibilities:
 *   - Ensure the small helper tables used for sync state exist.
 *   - Merge TMDB records into the `films` table using the SAME policy as the
 *     manual CSV bulk upload (title + year match => fill empty fields only;
 *     title match with a different year => disambiguate as "Title (Year)").
 *   - Record a run history so the admin dashboard can show what happened.
 *   - Guard against overlapping runs with a Postgres advisory lock (safe when a
 *     provider retries a cron invocation).
 */

import crypto from 'crypto';
import { pool } from '@/lib/db';
import { fetchNigerianContent } from '@/lib/tmdb';

const ADVISORY_LOCK_KEY = 918273645; // arbitrary constant for pg_advisory_lock

let schemaReady = null;

export async function ensureSyncSchema() {
  if (schemaReady) return schemaReady;

  schemaReady = (async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tmdb_sync_runs (
        id VARCHAR(255) PRIMARY KEY,
        status TEXT NOT NULL,               -- 'running' | 'success' | 'failed' | 'locked'
        trigger TEXT NOT NULL,              -- 'cron' | 'manual'
        start_year INTEGER,
        end_year INTEGER,
        considered INTEGER DEFAULT 0,
        added INTEGER DEFAULT 0,
        updated INTEGER DEFAULT 0,
        skipped INTEGER DEFAULT 0,
        error_count INTEGER DEFAULT 0,
        error_message TEXT,
        started_at TIMESTAMP DEFAULT NOW(),
        finished_at TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS tmdb_sync_state (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS tmdb_film_map (
        tmdb_id INTEGER NOT NULL,
        media_type TEXT NOT NULL,           -- 'movie' | 'tv'
        film_id VARCHAR(255) NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (tmdb_id, media_type)
      );
    `);
  })().catch((err) => {
    // Allow a retry on the next call if the first attempt failed (e.g. transient DB error).
    schemaReady = null;
    throw err;
  });

  return schemaReady;
}

export async function getSyncEnabled() {
  await ensureSyncSchema();
  const res = await pool.query(`SELECT value FROM tmdb_sync_state WHERE key = 'enabled'`);
  if (res.rowCount === 0) return true; // default: enabled
  return res.rows[0].value === 'true';
}

export async function setSyncEnabled(enabled) {
  await ensureSyncSchema();
  await pool.query(
    `INSERT INTO tmdb_sync_state (key, value) VALUES ('enabled', $1)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [enabled ? 'true' : 'false']
  );
}

export async function getLatestRuns(limit = 10) {
  await ensureSyncSchema();
  const res = await pool.query(
    `SELECT * FROM tmdb_sync_runs ORDER BY started_at DESC LIMIT $1`,
    [limit]
  );
  return res.rows.map((row) => ({
    id: row.id,
    status: row.status,
    trigger: row.trigger,
    startYear: row.start_year,
    endYear: row.end_year,
    considered: row.considered,
    added: row.added,
    updated: row.updated,
    skipped: row.skipped,
    errorCount: row.error_count,
    errorMessage: row.error_message,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  }));
}

/**
 * Default year range for a scheduled run: "the current year".
 * TMDB sometimes lists a Nigerian title before/after its stated year, so we
 * also sweep the immediately preceding year to pick up late additions.
 */
export function defaultYearRange(now = new Date()) {
  const currentYear = now.getUTCFullYear();
  return { startYear: currentYear - 1, endYear: currentYear };
}

function toArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === 'string' && value.trim()) return value.split(',').map((s) => s.trim()).filter(Boolean);
  return [];
}

/**
 * Merge a single TMDB item into the films table.
 * @returns {Promise<'added'|'updated'|'skipped'>}
 */
async function mergeItem(client, item) {
  const { rows: matches } = await client.query(
    `SELECT id, title, release_year, description, production_company, directed_by,
            produced_by, "cast", poster_url
       FROM films
      WHERE LOWER(TRIM(title)) = LOWER(TRIM($1))
         OR LOWER(TRIM(REGEXP_REPLACE(title, '\\s*\\(\\d{4}\\)\\s*$', ''))) = LOWER(TRIM($1))`,
    [item.title]
  );

  const sameYear = matches.find((row) => {
    const rowYear = row.release_year == null ? '' : String(row.release_year);
    const itemYear = item.releaseYear == null ? '' : String(item.releaseYear);
    return rowYear === itemYear;
  });

  // ---- Title + year match: fill only empty fields (same as bulk CSV import) ----
  if (sameYear) {
    const current = {
      description: sameYear.description || '',
      production_company: toArray(sameYear.production_company),
      directed_by: toArray(sameYear.directed_by),
      produced_by: toArray(sameYear.produced_by),
      cast: toArray(sameYear.cast),
      poster_url: sameYear.poster_url || '',
    };

    const next = { ...current };
    let changed = false;

    if (!current.description && item.description) {
      next.description = item.description;
      changed = true;
    }
    if (current.production_company.length === 0 && item.productionCompany.length) {
      next.production_company = item.productionCompany;
      changed = true;
    }
    if (current.directed_by.length === 0 && item.directedBy.length) {
      next.directed_by = item.directedBy;
      changed = true;
    }
    if (current.produced_by.length === 0 && item.producedBy.length) {
      next.produced_by = item.producedBy;
      changed = true;
    }
    if (current.cast.length === 0 && item.cast.length) {
      next.cast = item.cast;
      changed = true;
    }
    if (!current.poster_url && item.posterUrl) {
      next.poster_url = item.posterUrl;
      changed = true;
    }

    if (!changed) {
      return 'skipped';
    }

    await client.query(
      `UPDATE films SET
         description = $1,
         production_company = $2,
         directed_by = $3,
         produced_by = $4,
         "cast" = $5,
         poster_url = $6,
         updated_at = NOW()
       WHERE id = $7`,
      [
        next.description,
        next.production_company,
        next.directed_by,
        next.produced_by,
        next.cast,
        next.poster_url,
        sameYear.id,
      ]
    );
    return 'updated';
  }

  // ---- Title matched but different year: disambiguate with year in parentheses ----
  // ---- No match at all: insert as-is. ----
  const finalTitle = matches.length > 0 && item.releaseYear
    ? `${item.title} (${item.releaseYear})`
    : item.title;

  const id = crypto.randomUUID();
  await client.query(
    `INSERT INTO films (
       id, title, release_year, description, production_company,
       directed_by, produced_by, "cast", poster_url, created_at, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())`,
    [
      id,
      finalTitle,
      item.releaseYear || null,
      item.description || '',
      item.productionCompany,
      item.directedBy,
      item.producedBy,
      item.cast,
      item.posterUrl || '',
    ]
  );

  // Remember which TMDB entity this row came from so future runs update the
  // right record even if the title gets disambiguated locally.
  await client.query(
    `INSERT INTO tmdb_film_map (tmdb_id, media_type, film_id, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (tmdb_id, media_type) DO UPDATE SET film_id = EXCLUDED.film_id, updated_at = NOW()`,
    [item.tmdbId, item.type === 'TV Show' ? 'tv' : 'movie', id]
  );

  return 'added';
}

async function resolveExistingByTmdbId(client, item) {
  const mediaType = item.type === 'TV Show' ? 'tv' : 'movie';
  const res = await client.query(
    `SELECT film_id FROM tmdb_film_map WHERE tmdb_id = $1 AND media_type = $2`,
    [item.tmdbId, mediaType]
  );
  return res.rowCount > 0 ? res.rows[0].film_id : null;
}

/**
 * Run a full sync. Returns the counts.
 *
 * @param {object} [opts]
 * @param {number} [opts.startYear]
 * @param {number} [opts.endYear]
 * @param {'cron'|'manual'} [opts.trigger]
 */
export async function runSync({ startYear, endYear, trigger = 'manual' } = {}) {
  await ensureSyncSchema();

  const range = startYear && endYear ? { startYear, endYear } : defaultYearRange();
  const runId = crypto.randomUUID();

  // Acquire a session-level advisory lock. We do this on a dedicated client so
  // the lock is released cleanly when we close it.
  const client = await pool.connect();
  let locked = false;

  try {
    const lockRes = await client.query('SELECT pg_try_advisory_lock($1) AS ok', [ADVISORY_LOCK_KEY]);
    locked = lockRes.rows[0].ok;
  } catch (err) {
    client.release();
    throw err;
  }

  if (!locked) {
    client.release();
    await pool.query(
      `INSERT INTO tmdb_sync_runs (id, status, trigger, start_year, end_year, started_at, finished_at, error_message)
       VALUES ($1, 'locked', $2, $3, $4, NOW(), NOW(), $5)`,
      [runId, trigger, range.startYear, range.endYear, 'A sync is already in progress.']
    );
    const error = new Error('A TMDB sync is already running.');
    error.code = 'SYNC_LOCKED';
    throw error;
  }

  const stats = { considered: 0, added: 0, updated: 0, skipped: 0, errors: 0 };
  const warnings = [];

  await pool.query(
    `INSERT INTO tmdb_sync_runs (id, status, trigger, start_year, end_year, started_at)
     VALUES ($1, 'running', $2, $3, $4, NOW())`,
    [runId, trigger, range.startYear, range.endYear]
  );

  // Use a single checked-out connection for writes so the advisory lock owner
  // and the writer are the same session.
  let currentClient = client;

  try {
    const progress = (info) => {
      if (info.level === 'warn') {
        warnings.push(info.message);
        stats.errors++;
      }
    };

    await fetchNigerianContent({
      startYear: range.startYear,
      endYear: range.endYear,
      onProgress: progress,
      onItem: async (item) => {
        stats.considered++;

        // If we've already mapped this TMDB id to a row that still exists,
        // target that row directly instead of fuzzy matching by title.
        const mappedId = await resolveExistingByTmdbId(currentClient, item);
        if (mappedId) {
          let result = await mergeExistingById(currentClient, mappedId, item);
          if (result === 'added') {
            // Mapped row no longer exists, so the mapping was cleared; insert fresh.
            result = await mergeItem(currentClient, item);
          }
          stats[result]++;
          return;
        }

        const result = await mergeItem(currentClient, item);
        stats[result]++;
      },
    });

    await pool.query(
      `UPDATE tmdb_sync_runs SET
         status = 'success',
         considered = $1, added = $2, updated = $3, skipped = $4, error_count = $5,
         error_message = $6,
         finished_at = NOW()
       WHERE id = $7`,
      [
        stats.considered,
        stats.added,
        stats.updated,
        stats.skipped,
        stats.errors,
        warnings.length ? warnings.slice(0, 10).join(' | ') : null,
        runId,
      ]
    );

    return { runId, ...stats, startYear: range.startYear, endYear: range.endYear };
  } catch (err) {
    await pool.query(
      `UPDATE tmdb_sync_runs SET
         status = 'failed',
         considered = $1, added = $2, updated = $3, skipped = $4, error_count = $5,
         error_message = $6,
         finished_at = NOW()
       WHERE id = $7`,
      [stats.considered, stats.added, stats.updated, stats.skipped, stats.errors + 1, String(err.message).slice(0, 1000), runId]
    ).catch(() => {});
    throw err;
  } finally {
    try {
      await currentClient.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY]);
    } catch {
      // ignore unlock errors
    }
    currentClient.release();
  }
}

/**
 * Merge an already-mapped TMDB item into its known film row (fill empty fields only).
 */
async function mergeExistingById(client, filmId, item) {
  const res = await client.query(
    `SELECT id, description, production_company, directed_by, produced_by, "cast", poster_url
       FROM films WHERE id = $1`,
    [filmId]
  );
  if (res.rowCount === 0) {
    // The mapped row was deleted manually; fall back to title matching.
    await client.query(`DELETE FROM tmdb_film_map WHERE film_id = $1`, [filmId]);
    return 'added';
  }

  const row = res.rows[0];
  const current = {
    description: row.description || '',
    production_company: toArray(row.production_company),
    directed_by: toArray(row.directed_by),
    produced_by: toArray(row.produced_by),
    cast: toArray(row.cast),
    poster_url: row.poster_url || '',
  };

  const next = { ...current };
  let changed = false;

  if (!current.description && item.description) { next.description = item.description; changed = true; }
  if (current.production_company.length === 0 && item.productionCompany.length) { next.production_company = item.productionCompany; changed = true; }
  if (current.directed_by.length === 0 && item.directedBy.length) { next.directed_by = item.directedBy; changed = true; }
  if (current.produced_by.length === 0 && item.producedBy.length) { next.produced_by = item.producedBy; changed = true; }
  if (current.cast.length === 0 && item.cast.length) { next.cast = item.cast; changed = true; }
  if (!current.poster_url && item.posterUrl) { next.poster_url = item.posterUrl; changed = true; }

  if (!changed) return 'skipped';

  await client.query(
    `UPDATE films SET
       description = $1, production_company = $2, directed_by = $3, produced_by = $4,
       "cast" = $5, poster_url = $6, updated_at = NOW()
     WHERE id = $7`,
    [next.description, next.production_company, next.directed_by, next.produced_by, next.cast, next.poster_url, filmId]
  );

  await client.query(`UPDATE tmdb_film_map SET updated_at = NOW() WHERE film_id = $1`, [filmId]);
  return 'updated';
}
