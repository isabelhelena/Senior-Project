import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const zip = searchParams.get('zip');
  const latParam = searchParams.get('lat');
  const lngParam = searchParams.get('lng');

  if (latParam !== null || lngParam !== null) {
    return reverseGeocode(latParam, lngParam);
  }

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

async function reverseGeocode(latParam: string | null, lngParam: string | null) {
  const lat = latParam === null || latParam.trim() === '' ? NaN : Number(latParam);
  const lng = lngParam === null || lngParam.trim() === '' ? NaN : Number(lngParam);

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return NextResponse.json(
      { error: 'Valid latitude and longitude are required' },
      { status: 400 }
    );
  }

  const headers = {
    'User-Agent': '(LoneStarSupport-Testing, contact@lonestarsupport.org)',
    'Accept': 'application/geo+json',
  };

  try {
    const pointRes = await fetch(
      `https://api.weather.gov/points/${lat.toFixed(4)},${lng.toFixed(4)}`,
      { headers, next: { revalidate: 86400 } }
    );

    if (!pointRes.ok) {
      return NextResponse.json(
        { error: 'No place name is available for these coordinates' },
        { status: pointRes.status === 404 ? 404 : 502 }
      );
    }

    const pointData = (await pointRes.json()) as {
      properties?: {
        county?: string;
        relativeLocation?: {
          properties?: {
            city?: string;
            state?: string;
          };
        };
      };
    };
    const relative = pointData.properties?.relativeLocation?.properties;
    const city = relative?.city?.trim();
    const state = relative?.state?.trim();

    if (city) {
      return NextResponse.json({ city, state: state || '', lat, lng });
    }

    const countyUrl = pointData.properties?.county;
    if (countyUrl) {
      const countyRes = await fetch(countyUrl, {
        headers,
        next: { revalidate: 86400 },
      });

      if (countyRes.ok) {
        const countyData = (await countyRes.json()) as {
          properties?: { name?: string };
        };
        const countyName = countyData.properties?.name?.trim();

        if (countyName) {
          const countyLabel = countyName.toLowerCase().endsWith('county')
            ? countyName
            : `${countyName} County`;
          return NextResponse.json({ city: countyLabel, state: state || '', lat, lng });
        }
      }
    }

    return NextResponse.json(
      { error: 'No place name is available for these coordinates' },
      { status: 404 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Reverse geocoding failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
