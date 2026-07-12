import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export async function POST(request) {
  try {
    const query = `
      WITH scores AS (
        SELECT id, title, release_year,
               (CASE WHEN description IS NOT NULL AND description <> '' THEN 1 ELSE 0 END +
                CASE WHEN array_length(production_company, 1) > 0 THEN 1 ELSE 0 END +
                CASE WHEN array_length(directed_by, 1) > 0 THEN 1 ELSE 0 END +
                CASE WHEN array_length(produced_by, 1) > 0 THEN 1 ELSE 0 END +
                CASE WHEN poster_url IS NOT NULL AND poster_url <> '' THEN 1 ELSE 0 END +
                CASE WHEN array_length("cast", 1) > 0 THEN 1 ELSE 0 END) as score,
               updated_at
        FROM films
      ),
      ranked AS (
        SELECT id, title, release_year, score,
               ROW_NUMBER() OVER (
                 PARTITION BY LOWER(TRIM(title)), release_year 
                 ORDER BY score DESC, updated_at DESC
               ) as rnk
        FROM scores
      )
      DELETE FROM films
      WHERE id IN (
        SELECT id FROM ranked WHERE rnk > 1
      )
      RETURNING title;
    `;

    const result = await pool.query(query);
    const deletedCount = result.rowCount;
    const deletedTitles = result.rows.map(r => r.title);

    if (deletedCount === 0) {
      return NextResponse.json({ message: 'No duplicates found.' }, { status: 200 });
    }
    
    return NextResponse.json({ 
      message: `Successfully deleted ${deletedCount} duplicates.`,
      deletedCount: deletedCount,
      deletedTitles: deletedTitles
    }, { status: 200 });
    
  } catch (error) {
    console.error('Remove duplicates error:', error);
    return NextResponse.json({ error: 'Internal server error while removing duplicates' }, { status: 500 });
  }
}
