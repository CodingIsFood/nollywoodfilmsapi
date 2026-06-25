import { NextResponse } from 'next/server';
import { searchFilms, createFilm } from '@/lib/contentful';
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
    let skippedCount = 0;
    const skippedTitles = [];

    // Helper to clean values
    const cleanValue = (val) => {
      if (!val) return '';
      const trimmed = val.trim();
      if (trimmed.toLowerCase() === 'placeholder text') return '';
      return trimmed;
    };

    for (const row of rows) {
      // Find the correct header key case-insensitively
      const getVal = (key) => {
        const matchingKey = Object.keys(row).find(k => k.toLowerCase().trim() === key.toLowerCase());
        return matchingKey ? row[matchingKey] : '';
      };

      const title = cleanValue(getVal('title'));
      if (!title) continue; // Skip rows without a title

      // Check if film already exists
      const searchResult = await searchFilms(title, 1, 10);
      const exactMatch = searchResult.films.find(
        film => film.title && film.title.toLowerCase() === title.toLowerCase()
      );

      if (exactMatch) {
        skippedCount++;
        skippedTitles.push(title);
        continue;
      }

      // Map row to film data
      const filmData = {
        title: title,
        releaseYear: cleanValue(getVal('release year')),
        description: cleanValue(getVal('synopsis')),
        productionCompany: '', // Always empty as per requirements
        directedBy: cleanValue(getVal('director')),
        producedBy: cleanValue(getVal('producer')),
        cast: cleanValue(getVal('cast')),
        posterUrl: '' // Not present in CSV
      };

      await createFilm(filmData);
      addedCount++;
      
      // Add a small delay to avoid hitting Contentful API rate limits
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    return NextResponse.json({
      message: `Successfully added ${addedCount} films. Skipped ${skippedCount} existing films.`,
      addedCount,
      skippedCount,
      skippedTitles
    }, { status: 200 });

  } catch (error) {
    console.error('Bulk upload error:', error);
    return NextResponse.json({ error: 'Internal server error during bulk upload' }, { status: 500 });
  }
}
