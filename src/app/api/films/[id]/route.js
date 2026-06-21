import { NextResponse } from 'next/server';
import { updateFilm, deleteFilm } from '@/lib/contentful';

export async function PUT(request, { params }) {
  try {
    const { id } = params;
    const body = await request.json();
    const updatedFilm = await updateFilm(id, body);
    return NextResponse.json(updatedFilm);
  } catch (error) {
    console.error('Failed to update film:', error);
    return NextResponse.json({ error: 'Failed to update film' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id } = params;
    await deleteFilm(id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('Failed to delete film:', error);
    return NextResponse.json({ error: 'Failed to delete film' }, { status: 500 });
  }
}
