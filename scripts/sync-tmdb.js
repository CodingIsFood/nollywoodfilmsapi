#!/usr/bin/env node
/**
 * Local / CI runner for the TMDB auto-sync.
 *
 * Usage:
 *   node scripts/sync-tmdb.js                # previous year + current year
 *   node scripts/sync-tmdb.js 2025 2026      # explicit year range (inclusive)
 *
 * This uses the same engine as the weekly Vercel cron (/api/cron/sync),
 * so you can smoke-test the whole pipeline locally before deploying.
 */

// Load .env.local before importing anything that reads process.env at import time.
try {
  require('@next/env').loadEnvConfig(process.cwd());
} catch {
  // @next/env ships with Next.js; fall back to existing env vars if unavailable.
}

const { runSync, defaultYearRange } = require('../src/lib/sync.js');

const [startArg, endArg] = process.argv.slice(2);
const startYear = startArg ? parseInt(startArg, 10) : undefined;
const endYear = endArg ? parseInt(endArg, 10) : undefined;

if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL is not set.');
  process.exit(1);
}
if (!process.env.TMDB_API_TOKEN) {
  console.error('ERROR: TMDB_API_TOKEN is not set.');
  process.exit(1);
}

const range =
  startYear && endYear ? `${startYear}-${endYear}` : JSON.stringify(defaultYearRange());
console.log(`Starting TMDB sync for year range: ${range}`);

runSync({ startYear, endYear, trigger: 'manual' })
  .then((result) => {
    console.log('\nSync complete:');
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  })
  .catch((err) => {
    console.error('\nSync failed:', err.message);
    process.exit(1);
  });
