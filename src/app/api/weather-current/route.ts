import { NextRequest, NextResponse } from 'next/server';

interface NWSPointsResponse {
  properties?: {
    observationStations?: string;
  };
}

interface NWSStationsResponse {
  features?: Array<{
    properties?: {
      stationIdentifier?: string;
      name?: string;
    };
  }>;
}

interface NWSObservationResponse {
  properties?: {
    textDescription?: string;
    temperature?: { value?: number | null };
    windSpeed?: { value?: number | null };
    windDirection?: { value?: number | null };
    relativeHumidity?: { value?: number | null };
    timestamp?: string;
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const lat = searchParams.get('lat') || '29.4241';
    const lng = searchParams.get('lng') || '-98.4936';

    const headers = {
      'User-Agent': '(LoneStarSupport-Testing, contact@lonestarsupport.org)',
      'Accept': 'application/geo+json',
    };

    // Step 1: Query NWS points endpoint to retrieve observation station registry URL
    const pointRes = await fetch(
      `https://api.weather.gov/points/${parseFloat(lat).toFixed(4)},${parseFloat(lng).toFixed(4)}`,
      { headers, next: { revalidate: 86400 } }
    );

    if (!pointRes.ok) {
      return NextResponse.json(
        { error: `NWS point lookup failed with status ${pointRes.status}` },
        { status: pointRes.status }
      );
    }

    const pointData = (await pointRes.json()) as NWSPointsResponse;
    const stationsUrl = pointData.properties?.observationStations;

    if (!stationsUrl) {
      return NextResponse.json(
        { error: 'Observation station endpoint not found in NWS point metadata' },
        { status: 404 }
      );
    }

    // Step 2: Fetch closest observation station identifier
    const stationsRes = await fetch(stationsUrl, { headers, next: { revalidate: 86400 } });
    if (!stationsRes.ok) {
      return NextResponse.json(
        { error: `Failed to fetch observation stations with status ${stationsRes.status}` },
        { status: stationsRes.status }
      );
    }

    const stationsData = (await stationsRes.json()) as NWSStationsResponse;
    const stationId = stationsData.features?.[0]?.properties?.stationIdentifier;

    if (!stationId) {
      return NextResponse.json(
        { error: 'No weather observation station available for this area' },
        { status: 404 }
      );
    }

    // Step 3: Fetch latest ambient observation from target station
    const obsRes = await fetch(
      `https://api.weather.gov/stations/${stationId}/observations/latest`,
      { headers, next: { revalidate: 900 } }
    );

    if (!obsRes.ok) {
      return NextResponse.json(
        { error: `Failed to fetch latest observations from station ${stationId}` },
        { status: obsRes.status }
      );
    }

    const obs = (await obsRes.json()) as NWSObservationResponse;
    const props = obs.properties;

    // Unit conversions (Celsius to Fahrenheit, km/h to mph)
    const tempC = props?.temperature?.value;
    const tempF = tempC !== null && tempC !== undefined ? Math.round((tempC * 9) / 5 + 32) : null;

    const windKmh = props?.windSpeed?.value;
    const windMph = windKmh !== null && windKmh !== undefined ? Math.round(windKmh * 0.621371) : null;

    const humidity = props?.relativeHumidity?.value ? Math.round(props.relativeHumidity.value) : null;

    return NextResponse.json({
      station: stationId,
      stationName: stationsData.features?.[0]?.properties?.name || stationId,
      condition: props?.textDescription || 'Fair',
      tempF,
      windMph,
      windDirection: props?.windDirection?.value ? Math.round(props.windDirection.value) : null,
      humidity,
      timestamp: props?.timestamp || new Date().toISOString(),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error fetching ambient weather';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
