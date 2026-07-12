const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const CONNECTION_STRING = process.env.DATABASE_URL || '';

async function importToNeon() {
  console.log('Reading exported JSON data...');
  const dataPath = path.resolve(process.cwd(), 'neon_films_export.json');
  const films = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  console.log(`Loaded ${films.length} films from file.`);

  const client = new Client({
    connectionString: CONNECTION_STRING,
  });

  try {
    console.log('Connecting to Neon database...');
    await client.connect();
    console.log('Connected successfully!');

    // Create the table
    console.log('Creating "films" table if it doesn\'t exist...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS films (
        id VARCHAR(255) PRIMARY KEY,
        title TEXT NOT NULL,
        release_year INTEGER,
        description TEXT,
        production_company TEXT[],
        directed_by TEXT[],
        produced_by TEXT[],
        "cast" TEXT[],
        poster_url TEXT,
        created_at TIMESTAMP,
        updated_at TIMESTAMP
      );
    `);
    console.log('Table ready.');

    // Clear existing data to ensure clean insert (optional, but good for a fresh migration)
    // We will just do ON CONFLICT DO NOTHING just in case script is run multiple times
    
    console.log('Starting data import...');
    const batchSize = 100;
    let insertedCount = 0;

    for (let i = 0; i < films.length; i += batchSize) {
      const batch = films.slice(i, i + batchSize);
      
      const placeholders = [];
      const values = [];
      let paramIndex = 1;

      batch.forEach((film) => {
        const rowPlaceholders = [];
        // 11 columns
        for (let j = 0; j < 11; j++) {
          rowPlaceholders.push(`$${paramIndex++}`);
        }
        placeholders.push(`(${rowPlaceholders.join(', ')})`);

        values.push(
          film.id,
          film.title,
          film.releaseYear,
          film.description,
          film.productionCompany,
          film.directedBy,
          film.producedBy,
          film.cast,
          film.posterUrl,
          film.createdAt,
          film.updatedAt
        );
      });

      const query = `
        INSERT INTO films (
          id, title, release_year, description, production_company, 
          directed_by, produced_by, "cast", poster_url, created_at, updated_at
        ) VALUES ${placeholders.join(', ')}
        ON CONFLICT (id) DO NOTHING;
      `;

      await client.query(query, values);
      insertedCount += batch.length;
      
      if (insertedCount % 1000 === 0 || insertedCount === films.length) {
        console.log(`Inserted ${insertedCount} / ${films.length} films...`);
      }
    }

    console.log('\nMigration complete! 🎉');
    console.log(`Successfully migrated ${films.length} films to Neon.`);
    
  } catch (error) {
    console.error('Error during migration:', error);
  } finally {
    await client.end();
  }
}

importToNeon();
