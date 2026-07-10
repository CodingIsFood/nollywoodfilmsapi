import { NextResponse } from 'next/server';
import { searchFilms, createFilm, updateFilm } from '@/lib/contentful';
import Papa from 'papaparse';

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const text = await file.text();
    
    // Parse CSV
    const result = Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
    });

    if (result.errors.length > 0) {
      console.error('CSV parsing errors:', result.errors);
      return NextResponse.json({ error: 'Failed to parse CSV', details: result.errors }, { status: 400 });
    }

    const rows = result.data;
    let addedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    const skippedTitles = [];

    // Helper to clean values
    const cleanValue = (val) => {
      if (!val) return '';
      const trimmed = val.trim();
      const lower = trimmed.toLowerCase();
      if (lower === 'placeholder text' || lower === 'unknown' || lower === 'no synopsis available.') {
        return '';
      }
      return trimmed;
    };

    for (const row of rows) {
      // Find the correct header key case-insensitively, supporting multiple aliases
      const getVal = (...keys) => {
        for (const key of keys) {
          const matchingKey = Object.keys(row).find(k => k.toLowerCase().trim() === key.toLowerCase());
          if (matchingKey) return row[matchingKey];
        }
        return '';
      };

      const title = cleanValue(getVal('title'));
      if (!title) continue; // Skip rows without a title

      // Extract all possible values from CSV
      const releaseYearStr = cleanValue(getVal('year of release', 'release year'));
      const synopsis = cleanValue(getVal('synopsis', 'description'));
      const productionCompany = cleanValue(getVal('production/network company', 'production company'));
      const director = cleanValue(getVal('director'));
      const producer = cleanValue(getVal('producer'));
      const cast = cleanValue(getVal('cast members', 'cast'));

      // Check if film already exists
      const searchResult = await searchFilms(title, 1, 10);
      const exactMatches = searchResult.films.filter(
        film => film.title && film.title.toLowerCase() === title.toLowerCase()
      );

      if (exactMatches.length === 0) {
        // No match in title, add the film
        const filmData = {
          title: title,
          releaseYear: releaseYearStr,
          description: synopsis,
          productionCompany: productionCompany,
          directedBy: director,
          producedBy: producer,
          cast: cast,
          posterUrl: '' 
        };

        await createFilm(filmData);
        addedCount++;
        await new Promise(resolve => setTimeout(resolve, 200));
        continue;
      }

      // Title matched. Check year of release.
      const yearMatch = exactMatches.find(film => {
        const dbYearStr = String(film.releaseYear || '').trim();
        const csvYearStr = releaseYearStr.trim();
        return dbYearStr === csvYearStr;
      });

      if (!yearMatch) {
        // Match in title, but NO match in year of release.
        // Add the film disambiguating with the year of release in parenthesis
        const disambiguatedTitle = releaseYearStr ? `${title} (${releaseYearStr})` : title;
        
        const filmData = {
          title: disambiguatedTitle,
          releaseYear: releaseYearStr,
          description: synopsis,
          productionCompany: productionCompany,
          directedBy: director,
          producedBy: producer,
          cast: cast,
          posterUrl: '' 
        };

        await createFilm(filmData);
        addedCount++;
        await new Promise(resolve => setTimeout(resolve, 200));
        continue;
      }

      // Match in year of release (yearMatch). Update only empty fields.
      const dbDirector = yearMatch.directedBy || '';
      const dbProducer = yearMatch.producedBy || '';
      const dbDescription = yearMatch.description || '';
      const dbProdCompany = yearMatch.productionCompany || '';
      const dbCast = yearMatch.cast ? (Array.isArray(yearMatch.cast) ? yearMatch.cast.join(', ') : yearMatch.cast) : '';
      const dbPosterUrl = yearMatch.posterUrl || '';

      let hasUpdates = false;
      const filmData = {
        title: yearMatch.title, // keep existing
        releaseYear: yearMatch.releaseYear,
        description: dbDescription,
        productionCompany: dbProdCompany,
        directedBy: dbDirector,
        producedBy: dbProducer,
        cast: dbCast,
        posterUrl: dbPosterUrl
      };

      if (!dbDescription && synopsis) { filmData.description = synopsis; hasUpdates = true; }
      if (!dbProdCompany && productionCompany) { filmData.productionCompany = productionCompany; hasUpdates = true; }
      if (!dbDirector && director) { filmData.directedBy = director; hasUpdates = true; }
      if (!dbProducer && producer) { filmData.producedBy = producer; hasUpdates = true; }
      if (!dbCast && cast) { filmData.cast = cast; hasUpdates = true; }

      if (hasUpdates) {
        await updateFilm(yearMatch.id, filmData);
        updatedCount++;
      } else {
        skippedCount++;
        skippedTitles.push(title);
      }
      
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    return NextResponse.json({
      message: `Successfully added ${addedCount} films. Updated ${updatedCount} films. Skipped ${skippedCount} existing films.`,
      addedCount,
      updatedCount,
      skippedCount,
      skippedTitles
    }, { status: 200 });

  } catch (error) {
    console.error('Bulk upload error:', error);
    return NextResponse.json({ error: 'Internal server error during bulk upload' }, { status: 500 });
  }
}
