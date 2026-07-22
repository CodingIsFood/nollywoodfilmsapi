const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const Papa = require('papaparse');

// Load environment variables from .env.local if not already in process.env
if (!process.env.DATABASE_URL && fs.existsSync('.env.local')) {
  const envConfig = fs.readFileSync('.env.local', 'utf8');
  envConfig.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
    }
  });
}

const CONNECTION_STRING = process.env.DATABASE_URL;

function cleanTitle(title) {
  if (!title) return '';
  // Remove parentheses and their contents, e.g. "filmname1 (2001)" -> "filmname1"
  return title.replace(/\s*\([^)]*\)/g, '').trim().toLowerCase();
}

async function updateCastFromCsv(csvFilePath) {
  if (!CONNECTION_STRING) {
    console.error('DATABASE_URL is not set. Please check your .env.local file.');
    return;
  }

  if (!fs.existsSync(csvFilePath)) {
    console.error(`CSV file not found at: ${csvFilePath}`);
    return;
  }

  console.log(`Reading CSV from ${csvFilePath}...`);
  const csvContent = fs.readFileSync(csvFilePath, 'utf8');
  
  // Parse CSV
  const parseResult = Papa.parse(csvContent, {
    header: true,
    skipEmptyLines: true,
  });
  
  if (parseResult.errors.length > 0) {
    console.error('Errors parsing CSV:', parseResult.errors);
    return;
  }

  const csvRows = parseResult.data;
  console.log(`Loaded ${csvRows.length} rows from CSV.`);

  const client = new Client({
    connectionString: CONNECTION_STRING,
  });

  try {
    console.log('Connecting to Neon database...');
    await client.connect();
    console.log('Connected successfully!');

    console.log('Fetching existing films from database...');
    const result = await client.query('SELECT id, title, release_year, "cast" FROM films');
    const dbFilms = result.rows;
    console.log(`Fetched ${dbFilms.length} films from database.`);

    let updatedCount = 0;
    let skippedNoMatchCount = 0;
    let skippedAllCastExistCount = 0;

    for (const row of csvRows) {
      const rawTitle = row['Title'];
      const rawYear = row['Year of Release'];
      const rawCast = row['Full Cast'];

      if (!rawTitle || !rawYear || !rawCast) {
        console.log(`Skipping invalid CSV row: ${JSON.stringify(row)}`);
        continue;
      }

      const csvTitleCleaned = cleanTitle(rawTitle);
      const csvYear = parseInt(rawYear, 10);
      const csvCastMembers = rawCast.split(',').map(c => c.trim()).filter(Boolean);

      // Find match in DB
      const matchedFilm = dbFilms.find(film => {
        const dbTitleCleaned = cleanTitle(film.title);
        const dbYear = parseInt(film.release_year, 10);
        return dbTitleCleaned === csvTitleCleaned && dbYear === csvYear;
      });

      if (!matchedFilm) {
        console.log(`[SKIP] No DB match found for CSV film: "${rawTitle}" (${rawYear})`);
        skippedNoMatchCount++;
        continue;
      }

      // Check cast members
      const dbCastMembers = matchedFilm.cast || [];
      const dbCastLower = dbCastMembers.map(c => c.toLowerCase());
      
      const newCastMembers = csvCastMembers.filter(
        c => !dbCastLower.includes(c.toLowerCase())
      );

      if (newCastMembers.length === 0) {
        console.log(`[SKIP] All cast members already exist for: "${matchedFilm.title}" (${matchedFilm.release_year})`);
        skippedAllCastExistCount++;
        continue;
      }

      // Add new cast members
      const updatedCast = [...dbCastMembers, ...newCastMembers];
      
      // Update DB
      const updateQuery = `
        UPDATE films 
        SET "cast" = $1, updated_at = $2 
        WHERE id = $3
      `;
      await client.query(updateQuery, [updatedCast, new Date(), matchedFilm.id]);
      
      console.log(`[UPDATE] Added ${newCastMembers.length} new cast members to "${matchedFilm.title}" (${matchedFilm.release_year})`);
      updatedCount++;
    }

    console.log('\n--- Summary ---');
    console.log(`Total CSV Rows Processed: ${csvRows.length}`);
    console.log(`Films Updated: ${updatedCount}`);
    console.log(`Skipped (No Match in DB): ${skippedNoMatchCount}`);
    console.log(`Skipped (All Cast Existed): ${skippedAllCastExistCount}`);
    console.log('----------------\n');

  } catch (error) {
    console.error('Error during update process:', error);
  } finally {
    await client.end();
  }
}

const args = process.argv.slice(2);
const csvPath = args[0] ? path.resolve(process.cwd(), args[0]) : path.resolve(process.cwd(), 'test_films.csv');

updateCastFromCsv(csvPath);
