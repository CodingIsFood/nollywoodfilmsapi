import { Pool } from 'pg';
import crypto from 'crypto';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function searchFilms(query = '', page = 1, limit = 12) {
  const offset = (page - 1) * limit;
  let filmsQuery = 'SELECT * FROM films';
  let countQuery = 'SELECT COUNT(*) FROM films';
  let params = [];
  
  if (query) {
    filmsQuery += ' WHERE title ILIKE $1 OR description ILIKE $1';
    countQuery += ' WHERE title ILIKE $1 OR description ILIKE $1';
    params.push(`%${query}%`);
  }
  
  filmsQuery += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  const queryParams = [...params, limit, offset];
  
  const [filmsRes, countRes] = await Promise.all([
    pool.query(filmsQuery, queryParams),
    pool.query(countQuery, params)
  ]);
  
  const total = parseInt(countRes.rows[0].count, 10);
  
  const films = filmsRes.rows.map(row => ({
    id: row.id,
    title: row.title,
    releaseYear: row.release_year,
    description: row.description,
    productionCompany: row.production_company || [],
    directedBy: row.directed_by || [],
    producedBy: row.produced_by || [],
    cast: row.cast || [],
    posterUrl: row.poster_url || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
  
  return {
    films,
    total,
    page,
    totalPages: Math.ceil(total / limit)
  };
}

// Ensure array formatting
function toArray(val) {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string' && val.trim()) return val.split(',').map(s => s.trim());
  return [];
}

export async function createFilm(filmData) {
  const id = crypto.randomUUID();
  const now = new Date();
  
  const query = `
    INSERT INTO films (
      id, title, release_year, description, production_company, 
      directed_by, produced_by, "cast", poster_url, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING *;
  `;
  
  const values = [
    id,
    filmData.title,
    parseInt(filmData.releaseYear, 10) || null,
    filmData.description || '',
    toArray(filmData.productionCompany),
    toArray(filmData.directedBy),
    toArray(filmData.producedBy),
    toArray(filmData.cast),
    filmData.posterUrl || '',
    now,
    now
  ];
  
  await pool.query(query, values);
  return { id, ...filmData };
}

export async function updateFilm(id, filmData) {
  const now = new Date();
  const query = `
    UPDATE films SET
      title = $1,
      release_year = $2,
      description = $3,
      production_company = $4,
      directed_by = $5,
      produced_by = $6,
      "cast" = $7,
      poster_url = $8,
      updated_at = $9
    WHERE id = $10
    RETURNING *;
  `;
  
  const values = [
    filmData.title,
    parseInt(filmData.releaseYear, 10) || null,
    filmData.description || '',
    toArray(filmData.productionCompany),
    toArray(filmData.directedBy),
    toArray(filmData.producedBy),
    toArray(filmData.cast),
    filmData.posterUrl || '',
    now,
    id
  ];
  
  await pool.query(query, values);
  return { id, ...filmData };
}

export async function deleteFilm(id) {
  await pool.query('DELETE FROM films WHERE id = $1', [id]);
}

export { pool };
