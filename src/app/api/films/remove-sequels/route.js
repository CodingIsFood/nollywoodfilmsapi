import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export async function POST(request) {
  try {
    const query = `
      WITH sequel_candidates AS (
        SELECT id, title, release_year,
               TRIM(REGEXP_REPLACE(title, '\\s+(part\\s+|pt\\s+)?[23]$', '', 'i')) as base_title
        FROM films
        WHERE title ~* '\\s+(part\\s+|pt\\s+)?[23]$'
      ),
      matches AS (
        SELECT s.id, s.title
        FROM sequel_candidates s
        JOIN films b
        ON LOWER(TRIM(b.title)) = LOWER(s.base_title) 
           AND (b.release_year = s.release_year OR (b.release_year IS NULL AND s.release_year IS NULL))
      )
      DELETE FROM films
      WHERE id IN (SELECT id FROM matches)
      RETURNING title;
    `;

    const result = await pool.query(query);
    const deletedCount = result.rowCount;
    const deletedTitles = result.rows.map(r => r.title);

    if (deletedCount === 0) {
      return NextResponse.json({ message: 'No sequels found for deletion.' }, { status: 200 });
    }
    
    return NextResponse.json({ 
      message: `Successfully deleted ${deletedCount} same-year sequels.`,
      deletedCount: deletedCount,
      deletedTitles: deletedTitles
    }, { status: 200 });
    
  } catch (error) {
    console.error('Remove sequels error:', error);
    return NextResponse.json({ error: 'Internal server error while removing sequels' }, { status: 500 });
  }
}
