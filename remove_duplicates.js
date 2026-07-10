const contentful = require('contentful-management');

// Helper to determine the "populated score" of a film
function getPopulatedScore(entry) {
  let score = 0;
  const fields = entry.fields || {};
  
  // Fields to check
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

  // Cast is an array
  if (fields.cast && fields.cast['en-US'] && Array.isArray(fields.cast['en-US']) && fields.cast['en-US'].length > 0) {
    score++;
  }

  return score;
}

async function run() {
  try {
    console.log('Connecting to Contentful...');
    const client = contentful.createClient({
      accessToken: process.env.CONTENTFUL_MANAGEMENT_TOKEN,
    });
    
    const spaceId = process.env.CONTENTFUL_SPACE_ID;
    const environmentId = process.env.CONTENTFUL_ENVIRONMENT || 'master';
    
    const space = await client.getSpace(spaceId);
    const environment = await space.getEnvironment(environmentId);
    
    console.log(`Connected to space ${spaceId}, environment ${environmentId}`);
    
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
      console.log(`Fetched ${allEntries.length} of ${total} entries...`);
    }
    
    console.log(`Finished fetching ${allEntries.length} entries.`);
    
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
    let keptCount = 0;
    
    for (const key in groups) {
      const entries = groups[key];
      if (entries.length > 1) {
        // We have duplicates!
        // Calculate score for each
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
        
        // Keep the first one, delete the rest
        const kept = entriesWithScore[0];
        keptCount++;
        
        for (let i = 1; i < entriesWithScore.length; i++) {
          duplicatesToDelete.push(entriesWithScore[i].entry);
        }
        
        console.log(`Group: "${key}" | Found ${entries.length} entries. Keeping one with score ${kept.score}. Deleting ${entries.length - 1} entries.`);
      }
    }
    
    console.log(`Total duplicates to delete: ${duplicatesToDelete.length}`);
    
    if (process.argv.includes('--dry-run')) {
      console.log('DRY RUN MODE. Exiting without deleting.');
      return;
    }
    
    // Delete duplicates
    let deleted = 0;
    for (const entry of duplicatesToDelete) {
      try {
        if (entry.isPublished()) {
          await entry.unpublish();
        }
        await entry.delete();
        deleted++;
        if (deleted % 10 === 0) {
          console.log(`Deleted ${deleted} / ${duplicatesToDelete.length}...`);
        }
      } catch (err) {
        console.error(`Failed to delete entry ${entry.sys.id}:`, err.message);
      }
      // slight delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    console.log(`Successfully deleted ${deleted} duplicates.`);
    
  } catch (error) {
    console.error('An error occurred:', error);
  }
}

run();
