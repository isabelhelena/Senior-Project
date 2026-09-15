import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const res = await fetch('https://api.weather.gov/alerts/active?area=TX', {
      headers: {
        // NWS requires an identifying User-Agent with contact info
        'User-Agent': '(LoneStarSupport-Testing, contact@lonestarsupport.org)',
        'Accept': 'application/geo+json',
      },
      next: { revalidate: 300 }, // 5-minute cache
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `NWS responded with status ${res.status}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch NWS alerts';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
