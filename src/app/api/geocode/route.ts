import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const zip = searchParams.get('zip');

  if (!zip || !/^\d{5}$/.test(zip)) {
    return NextResponse.json(
      { error: 'Valid 5-digit US ZIP code required' },
      { status: 400 }
    );
  }

  try {
    const res = await fetch(`https://api.zippopotam.us/us/${zip}`, {
      next: { revalidate: 86400 * 30 },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: 'ZIP code not found or invalid' },
        { status: 404 }
      );
    }

    const data = (await res.json()) as {
      places?: Array<{
        'place name': string;
        'state abbreviation': string;
        latitude: string;
        longitude: string;
      }>;
    };

    const place = data.places?.[0];
    if (!place) {
      return NextResponse.json(
        { error: 'No coordinate data for this ZIP' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      city: place['place name'],
      state: place['state abbreviation'],
      lat: parseFloat(place.latitude),
      lng: parseFloat(place.longitude),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Geocoding failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
