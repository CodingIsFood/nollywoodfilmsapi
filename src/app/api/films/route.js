import { NextResponse } from 'next/server';
import { searchFilms, createFilm } from '@/lib/contentful';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || '';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '12', 10);
    
    const result = await searchFilms(query, page, limit);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Failed to fetch films:', error);
    return NextResponse.json({ error: 'Failed to fetch films' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const newFilm = await createFilm(body);
    return NextResponse.json(newFilm, { status: 201 });
  } catch (error) {
    console.error('Failed to create film:', error);
    return NextResponse.json({ error: 'Failed to create film' }, { status: 500 });
  }
}
