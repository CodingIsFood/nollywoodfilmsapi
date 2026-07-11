import { NextResponse } from 'next/server';
import { managementClient, SPACE_ID, ENVIRONMENT_ID } from '@/lib/contentful';

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
    
    // Build index: { "title__year": entry }
    const index = {};
    for (const entry of allEntries) {
      const titleObj = entry.fields.title;
      const title = (titleObj && titleObj['en-US']) ? titleObj['en-US'].trim().toLowerCase() : null;
      
      const yearObj = entry.fields.releaseYear;
      const releaseYear = (yearObj && yearObj['en-US']) ? String(yearObj['en-US']).trim() : '';
      
      if (!title) continue; // skip entries with no title
      
      const key = `${title}__${releaseYear}`;
      // In case of duplicates of the base, we just keep the first one we see as the reference base.
      if (!index[key]) {
        index[key] = entry;
      }
    }
    
    let duplicatesToDelete = [];
    // Part 2 or 3 (e.g. " 2", " 3", " pt 2", " part 3")
    const pattern = /\s+(?:part\s+|pt\s+)?([23])$/i;

    for (const entry of allEntries) {
      const titleObj = entry.fields.title;
      const originalTitle = (titleObj && titleObj['en-US']) ? titleObj['en-US'].trim() : null;
      const titleLower = originalTitle ? originalTitle.toLowerCase() : null;
      
      const yearObj = entry.fields.releaseYear;
      const releaseYear = (yearObj && yearObj['en-US']) ? String(yearObj['en-US']).trim() : '';

      if (!titleLower) continue;

      const match = titleLower.match(pattern);
      if (match) {
        const baseTitle = titleLower.replace(pattern, '').trim();
        const baseKey = `${baseTitle}__${releaseYear}`;

        if (index[baseKey]) {
          duplicatesToDelete.push(entry);
        }
      }
    }
    
    if (duplicatesToDelete.length === 0) {
      return NextResponse.json({ message: 'No sequels found for deletion.' }, { status: 200 });
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
      message: `Successfully deleted ${deleted} same-year sequels.`,
      deletedCount: deleted,
      deletedTitles: deletedTitles
    }, { status: 200 });
    
  } catch (error) {
    console.error('Remove sequels error:', error);
    return NextResponse.json({ error: 'Internal server error while removing sequels' }, { status: 500 });
  }
}
