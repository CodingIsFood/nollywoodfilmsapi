import { NextResponse } from 'next/server';
import {
  getSyncEnabled,
  setSyncEnabled,
  getLatestRuns,
  runSync,
  defaultYearRange,
} from '@/lib/sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// The admin dashboard uses an httpOnly cookie set at login, so the browser
// sends it automatically. Same-origin requests only, hence the simple check.
function isAdmin(request) {
  const cookie = request.headers.get('cookie') || '';
  return cookie.split(';').some((c) => c.trim() === 'auth-token=authenticated');
}

export async function GET(request) {
  if (!isAdmin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [enabled, runs] = await Promise.all([getSyncEnabled(), getLatestRuns(10)]);
  return NextResponse.json({
    enabled,
    yearRange: defaultYearRange(),
    runs,
    configured: Boolean(process.env.TMDB_API_TOKEN),
  });
}

export async function POST(request) {
  if (!isAdmin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    // empty body is fine
  }

  const action = body.action || 'run';

  try {
    if (action === 'toggle') {
      const desired = Boolean(body.enabled);
      await setSyncEnabled(desired);
      return NextResponse.json({ enabled: desired });
    }

    if (action === 'run') {
      const result = await runSync({
        trigger: 'manual',
        startYear: body.startYear ? parseInt(body.startYear, 10) : undefined,
        endYear: body.endYear ? parseInt(body.endYear, 10) : undefined,
      });
      return NextResponse.json({ status: 'success', ...result });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    if (error.code === 'SYNC_LOCKED') {
      return NextResponse.json({ status: 'locked', message: error.message }, { status: 409 });
    }
    console.error('TMDB sync action failed:', error);
    return NextResponse.json({ status: 'failed', error: error.message }, { status: 500 });
  }
}
