import { NextResponse } from 'next/server';

const TXDOT_FEATURE_SERVICE =
  'https://services.arcgis.com/KTcxiTD9dsQw4r7Z/arcgis/rest/services/TxDOT_Roadway_Status/FeatureServer/0/query';

export async function GET() {
  try {
    const params = new URLSearchParams({
      where: "RDWAY_STAT <> 'Open to Traffic (All Data Input)'",
      outFields: 'RTE_NM,RDWAY_STAT,BEGIN_DFO,END_DFO',
      f: 'geojson',
      resultRecordCount: '25', // Bounded limit for test payload size
    });

    const res = await fetch(`${TXDOT_FEATURE_SERVICE}?${params.toString()}`, {
      next: { revalidate: 600 }, // 10-minute cache
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `TxDOT API responded with status ${res.status}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch TxDOT conditions';
    return NextResponse.json(
      { error: message},
      { status: 500 }
    );
  }
}
