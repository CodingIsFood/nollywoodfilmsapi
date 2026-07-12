const fs = require('fs');
const path = require('path');
const contentful = require('contentful-management');

// Utility to parse .env.local manually if not using Next.js or Node 20+ --env-file
function loadEnv() {
  try {
    const envPath = path.resolve(process.cwd(), '.env.local');
    const envFile = fs.readFileSync(envPath, 'utf8');
    envFile.split('\n').forEach(line => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let value = match[2] || '';
        if (value.startsWith('"') && value.endsWith('"')) {
          value = value.slice(1, -1);
        }
        process.env[key] = value;
      }
    });
  } catch (err) {
    console.log('No .env.local found or error parsing it. Assuming env variables are already set.');
  }
}

async function runExport() {
  loadEnv();

  console.log('Connecting to Contentful...');
  const client = contentful.createClient({
    accessToken: process.env.CONTENTFUL_MANAGEMENT_TOKEN,
  });
  
  const spaceId = process.env.CONTENTFUL_SPACE_ID;
  const environmentId = process.env.CONTENTFUL_ENVIRONMENT || 'master';
  
  if (!spaceId || !process.env.CONTENTFUL_MANAGEMENT_TOKEN) {
    console.error('Error: CONTENTFUL_SPACE_ID or CONTENTFUL_MANAGEMENT_TOKEN is missing.');
    return;
  }

  const space = await client.getSpace(spaceId);
  const environment = await space.getEnvironment(environmentId);
  
  console.log(`Connected to space ${spaceId}, environment ${environmentId}`);
  
  let allEntries = [];
  let skip = 0;
  const limit = 1000;
  let total = 1;
  
  console.log('Fetching films...');
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
  
  console.log('Processing data...');
  const cleanedData = allEntries.map(entry => {
    const fields = entry.fields || {};
    
    // Helper to get en-US value safely
    const getVal = (field) => fields[field] && fields[field]['en-US'] ? fields[field]['en-US'] : null;
    
    // Helper to safely convert comma-separated string to array
    const getArray = (field) => {
      const val = getVal(field);
      if (Array.isArray(val)) return val; // If it's already an array (like cast)
      if (typeof val === 'string' && val.trim() !== '') {
        return val.split(',').map(s => s.trim());
      }
      return [];
    };

    return {
      id: entry.sys.id,
      title: getVal('title') || 'Untitled',
      releaseYear: getVal('releaseYear') || null,
      description: getVal('description') || '',
      productionCompany: getArray('productionCompany'),
      directedBy: getArray('directedBy'),
      producedBy: getArray('producedBy'),
      cast: getArray('cast'),
      posterUrl: getVal('posterUrl') || '',
      createdAt: entry.sys.createdAt,
      updatedAt: entry.sys.updatedAt,
    };
  });

  const outputPath = path.resolve(process.cwd(), 'neon_films_export.json');
  fs.writeFileSync(outputPath, JSON.stringify(cleanedData, null, 2));
  
  console.log(`\nExport complete! 🎉`);
  console.log(`Successfully saved ${cleanedData.length} films to neon_films_export.json`);
  console.log(`File location: ${outputPath}`);
}

runExport().catch(console.error);
