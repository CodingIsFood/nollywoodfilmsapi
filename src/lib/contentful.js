import * as contentful from 'contentful';
import * as contentfulManagement from 'contentful-management';

// Delivery client (read-only, for the frontend / search)
export const deliveryClient = contentful.createClient({
  space: process.env.CONTENTFUL_SPACE_ID,
  accessToken: process.env.CONTENTFUL_ACCESS_TOKEN,
});

// Management client (read/write, for the admin dashboard)
export const managementClient = contentfulManagement.createClient({
  accessToken: process.env.CONTENTFUL_MANAGEMENT_TOKEN,
});

export const SPACE_ID = process.env.CONTENTFUL_SPACE_ID;
export const ENVIRONMENT_ID = process.env.CONTENTFUL_ENVIRONMENT || 'master';

// Utility to search films
export async function searchFilms(query = '', page = 1, limit = 12) {
  const skip = (page - 1) * limit;
  const params = {
    content_type: 'film',
    order: '-sys.createdAt',
    skip: skip,
    limit: limit
  };
  
  if (query) {
    params.query = query;
  }
  
  const entries = await deliveryClient.getEntries(params);
  
  return {
    films: entries.items.map((item) => ({
      id: item.sys.id,
      ...item.fields
    })),
    total: entries.total,
    page: page,
    totalPages: Math.ceil(entries.total / limit)
  };
}

// Utility to create a film
export async function createFilm(filmData) {
  const space = await managementClient.getSpace(SPACE_ID);
  const environment = await space.getEnvironment(ENVIRONMENT_ID);

  const entry = await environment.createEntry('film', {
    fields: {
      title: { 'en-US': filmData.title },
      releaseYear: { 'en-US': parseInt(filmData.releaseYear, 10) || null },
      description: { 'en-US': filmData.description || '' },
      productionCompany: { 'en-US': filmData.productionCompany || '' },
      cast: { 'en-US': filmData.cast ? filmData.cast.split(',').map(s => s.trim()) : [] },
      posterUrl: { 'en-US': filmData.posterUrl || '' }
    }
  });

  await entry.publish();
  return { id: entry.sys.id, ...filmData };
}

// Utility to update a film
export async function updateFilm(id, filmData) {
  const space = await managementClient.getSpace(SPACE_ID);
  const environment = await space.getEnvironment(ENVIRONMENT_ID);
  
  const entry = await environment.getEntry(id);
  entry.fields.title = { 'en-US': filmData.title };
  entry.fields.releaseYear = { 'en-US': parseInt(filmData.releaseYear, 10) || null };
  entry.fields.description = { 'en-US': filmData.description || '' };
  entry.fields.productionCompany = { 'en-US': filmData.productionCompany || '' };
  entry.fields.cast = { 'en-US': filmData.cast ? filmData.cast.split(',').map(s => s.trim()) : [] };
  entry.fields.posterUrl = { 'en-US': filmData.posterUrl || '' };
  
  const updatedEntry = await entry.update();
  await updatedEntry.publish();
  
  return { id: updatedEntry.sys.id, ...filmData };
}

// Utility to delete a film
export async function deleteFilm(id) {
  const space = await managementClient.getSpace(SPACE_ID);
  const environment = await space.getEnvironment(ENVIRONMENT_ID);
  
  const entry = await environment.getEntry(id);
  if (entry.isPublished()) {
    await entry.unpublish();
  }
  await entry.delete();
}
