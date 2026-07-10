import { NextResponse } from 'next/server';
import { managementClient, SPACE_ID, ENVIRONMENT_ID } from '@/lib/contentful';

// Helper to determine the "populated score" of a film
function getPopulatedScore(entry) {
  let score = 0;
  const fields = entry.fields || {};
  
  const fieldsToCheck = [
    'description',
    'productionCompany',
    'directedBy',
    'producedBy',
    'posterUrl'
  ];

  for (const field of fieldsToCheck) {
    if (fields[field] && fields[field]['en-US']) {
      const val = fields[field]['en-US'];
      if (typeof val === 'string' && val.trim().length > 0) {
        score++;
      }
    }
  }

  if (fields.cast && fields.cast['en-US'] && Array.isArray(fields.cast['en-US']) && fields.cast['en-US'].length > 0) {
    score++;
  }

  return score;
}

export async function POST(request) {
  try {
    const space = await managementClient.getSpace(SPACE_ID);
    const environment = await space.getEnvironment(ENVIRONMENT_ID);
    
    // Fetch all films
    let allEntries = [];
    let skip = 0;
    const limit = 1000;
    let total = 1;
    
    while (skip < total) {
      const response = await environment.getEntries({
        content_type: 'film',
        skip: skip,
        limit: limit,
      });
      total = response.total;
      allEntries = allEntries.concat(response.items);
      skip += limit;
    }
    
    // Group entries by exact title and releaseYear
    const groups = {};
    for (const entry of allEntries) {
      const titleObj = entry.fields.title;
      const title = (titleObj && titleObj['en-US']) ? titleObj['en-US'].trim().toLowerCase() : null;
      
      const yearObj = entry.fields.releaseYear;
      const releaseYear = (yearObj && yearObj['en-US']) ? String(yearObj['en-US']).trim() : '';
      
      if (!title) continue; // skip entries with no title
      
      const key = `${title}__${releaseYear}`;
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(entry);
    }
    
    // Identify duplicates
    let duplicatesToDelete = [];
    
    for (const key in groups) {
      const entries = groups[key];
      if (entries.length > 1) {
        const entriesWithScore = entries.map(entry => ({
          entry,
          score: getPopulatedScore(entry),
          updatedAt: new Date(entry.sys.updatedAt).getTime()
        }));
        
        // Sort by score descending, then by updatedAt descending
        entriesWithScore.sort((a, b) => {
          if (b.score !== a.score) {
            return b.score - a.score;
          }
          return b.updatedAt - a.updatedAt;
        });
        
        for (let i = 1; i < entriesWithScore.length; i++) {
          duplicatesToDelete.push(entriesWithScore[i].entry);
        }
      }
    }
    
    if (duplicatesToDelete.length === 0) {
      return NextResponse.json({ message: 'No duplicates found.' }, { status: 200 });
    }
    
    // Delete duplicates
    let deleted = 0;
    const deletedTitles = [];
    for (const entry of duplicatesToDelete) {
      try {
        if (entry.isPublished()) {
          await entry.unpublish();
        }
        await entry.delete();
        deleted++;
        
        const t = entry.fields.title && entry.fields.title['en-US'] ? entry.fields.title['en-US'] : 'Unknown';
        deletedTitles.push(t);
      } catch (err) {
        console.error(`Failed to delete entry ${entry.sys.id}:`, err.message);
      }
      // slight delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    return NextResponse.json({ 
      message: `Successfully deleted ${deleted} duplicates.`,
      deletedCount: deleted,
      deletedTitles: deletedTitles
    }, { status: 200 });
    
  } catch (error) {
    console.error('Remove duplicates error:', error);
    return NextResponse.json({ error: 'Internal server error while removing duplicates' }, { status: 500 });
  }
}
