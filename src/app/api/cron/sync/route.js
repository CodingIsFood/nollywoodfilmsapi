import { NextResponse } from 'next/server';
import { runSync, getSyncEnabled } from '@/lib/sync';

// Allows the sync to run longer than the default limit on Vercel (Pro: up to 300s).
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/**
 * Verify the caller is authorized to trigger a sync.
 *
 * Accepted credentials:
 *   - `Authorization: Bearer <CRON_SECRET>` (what Vercel Cron sends automatically
 *     when CRON_SECRET is set on the project)
 *   - the admin auth cookie (`auth-token=authenticated`) for the dashboard button
 */
function isAuthorised(request) {
  const authHeader = request.headers.get('authorization');
  const secret = process.env.CRON_SECRET;

  if (secret && authHeader === `Bearer ${secret}`) {
    return true;
  }

  const cookie = request.headers.get('cookie') || '';
  if (cookie.split(';').some((c) => c.trim() === 'auth-token=authenticated')) {
    return true;
  }

  // Allow Vercel's own cron infrastructure when no secret is configured.
  if (!secret && request.headers.get('x-vercel-cron')) {
    return true;
  }

  return false;
}

export async function GET(request) {
  if (!isAuthorised(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const enabled = await getSyncEnabled();
  if (!enabled) {
    return NextResponse.json({ status: 'disabled', message: 'TMDB auto-sync is turned off.' }, { status: 200 });
  }

  const { searchParams } = new URL(request.url);
  const startYear = searchParams.get('startYear');
  const endYear = searchParams.get('endYear');

  try {
    const result = await runSync({
      trigger: 'cron',
      startYear: startYear ? parseInt(startYear, 10) : undefined,
      endYear: endYear ? parseInt(endYear, 10) : undefined,
    });
    return NextResponse.json({ status: 'success', ...result }, { status: 200 });
  } catch (error) {
    if (error.code === 'SYNC_LOCKED') {
      return NextResponse.json({ status: 'locked', message: error.message }, { status: 409 });
    }
    console.error('TMDB cron sync failed:', error);
    return NextResponse.json({ status: 'failed', error: error.message }, { status: 500 });
  }
}
