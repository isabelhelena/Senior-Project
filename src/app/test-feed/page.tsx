'use client';

import { useState } from 'react';
import { useLocation } from '@/context/LocationContext';
import { WeatherSummaryCard } from '@/components/WeatherSummaryCard';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, RefreshCw, AlertCircle, MapPin, Search } from 'lucide-react';

interface GeoJsonFeature {
  type: string;
  geometry: Record<string, unknown> | null;
  properties: Record<string, unknown>;
  [key: string]: unknown;
}

interface GeoJsonData {
  type: string;
  features: GeoJsonFeature[];
  error?: string;
  [key: string]: unknown;
}

interface FeedStatus {
  loading: boolean;
  status: 'idle' | 'success' | 'error';
  count: number;
  data: GeoJsonData | null;
  error?: string;
  timestamp?: string;
}

export default function DiagnosticsPage() {
  const { location, setFromZip, resetToGps } = useLocation();
  const [zipInput, setZipInput] = useState('');
  const [nws, setNws] = useState<FeedStatus>({ loading: false, status: 'idle', count: 0, data: null });
  const [txdot, setTxdot] = useState<FeedStatus>({ loading: false, status: 'idle', count: 0, data: null });

  const handleZipSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (zipInput.trim().length === 5) {
      await setFromZip(zipInput.trim());
    }
  };

  const testNWS = async () => {
    setNws((prev) => ({ ...prev, loading: true, status: 'idle', error: undefined }));
    try {
      const res = await fetch(`/api/alerts?lat=${location.lat}&lng=${location.lng}`);
      const json = (await res.json()) as GeoJsonData;

      if (!res.ok) throw new Error(json.error || 'Failed to fetch NWS alerts');

      setNws({
        loading: false,
        status: 'success',
        count: json.features?.length ?? 0,
        data: json,
        timestamp: new Date().toLocaleTimeString(),
      });
    } catch (err: unknown) {
      setNws({
        loading: false,
        status: 'error',
        count: 0,
        data: null,
        error: err instanceof Error ? err.message : 'Error testing NWS',
        timestamp: new Date().toLocaleTimeString(),
      });
    }
  };

  const testTxDOT = async () => {
    setTxdot((prev) => ({ ...prev, loading: true, status: 'idle', error: undefined }));
    try {
      const res = await fetch(`/api/road-conditions?lat=${location.lat}&lng=${location.lng}&radius=25`);
      const json = (await res.json()) as GeoJsonData;

      if (!res.ok) throw new Error(json.error || 'Failed to fetch TxDOT data');

      setTxdot({
        loading: false,
        status: 'success',
        count: json.features?.length ?? 0,
        data: json,
        timestamp: new Date().toLocaleTimeString(),
      });
    } catch (err: unknown) {
      setTxdot({
        loading: false,
        status: 'error',
        count: 0,
        data: null,
        error: err instanceof Error ? err.message : 'Error testing TxDOT',
        timestamp: new Date().toLocaleTimeString(),
      });
    }
  };

  const testAll = () => {
    testNWS();
    testTxDOT();
  };

  return (
    <div className="container mx-auto p-6 max-w-5xl space-y-6">
      {/* Top Location Bar */}
      <Card className="bg-muted/40">
        <CardContent className="p-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <MapPin className="h-5 w-5 text-primary shrink-0" />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm">{location.city}</span>
                <Badge variant="outline" className="text-xs uppercase">
                  {location.source}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground font-mono">
                {location.lat}, {location.lng}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto">
            <form onSubmit={handleZipSubmit} className="flex gap-2 w-full md:w-auto">
              <Input
                placeholder="Enter 5-digit ZIP"
                value={zipInput}
                onChange={(e) => setZipInput(e.target.value)}
                className="w-36 h-9 text-xs"
                maxLength={5}
              />
              <Button type="submit" size="sm" variant="secondary" className="gap-1 h-9">
                <Search className="h-3.5 w-3.5" />
                Go
              </Button>
            </form>
            <Button size="sm" variant="outline" onClick={resetToGps} className="h-9 text-xs">
              GPS
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Diagnostics Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Phase 2 Ingestion Diagnostics</h1>
          <p className="text-muted-foreground text-sm">
            Verifying localized point-radius telemetry for the active coordinates[cite: 2].
          </p>
        </div>
        <Button onClick={testAll} disabled={nws.loading || txdot.loading} className="gap-2">
          {nws.loading || txdot.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Probe Localized Feeds
        </Button>
      </div>

      {/* Diagnostics Grid including WeatherSummaryCard */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
        {/* Real-time ambient weather observation card */}
        <div className="w-full">
          <WeatherSummaryCard lat={location.lat} lng={location.lng} />
        </div>

        {/* Localized NWS Alert Probe */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-base">NWS Active Alerts</CardTitle>
              <CardDescription className="text-xs font-mono">point={location.lat},{location.lng}</CardDescription>
            </div>
            {nws.status === 'success' && <Badge variant="outline" className="text-emerald-600 border-emerald-500">Connected</Badge>}
            {nws.status === 'error' && <Badge variant="destructive">Failed</Badge>}
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Impacting Area:</span>
              <span className="font-semibold">{nws.count} active alerts</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Last Tested:</span>
              <span>{nws.timestamp || 'Not run'}</span>
            </div>
            {nws.error && (
              <div className="text-xs text-destructive flex items-center gap-1 bg-destructive/10 p-2 rounded">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{nws.error}</span>
              </div>
            )}
            <Button onClick={testNWS} variant="secondary" size="sm" className="w-full" disabled={nws.loading}>
              {nws.loading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              Probe NWS Point
            </Button>
          </CardContent>
        </Card>

        {/* Localized TxDOT Roadway Closure Probe */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-base">TxDOT Road Hazards</CardTitle>
              <CardDescription className="text-xs font-mono">radius=25mi</CardDescription>
            </div>
            {txdot.status === 'success' && <Badge variant="outline" className="text-emerald-600 border-emerald-500">Connected</Badge>}
            {txdot.status === 'error' && <Badge variant="destructive">Failed</Badge>}
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Nearby Hazards:</span>
              <span className="font-semibold">{txdot.count} features</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Last Tested:</span>
              <span>{txdot.timestamp || 'Not run'}</span>
            </div>
            {txdot.error && (
              <div className="text-xs text-destructive flex items-center gap-1 bg-destructive/10 p-2 rounded">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{txdot.error}</span>
              </div>
            )}
            <Button onClick={testTxDOT} variant="secondary" size="sm" className="w-full" disabled={txdot.loading}>
              {txdot.loading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              Probe TxDOT Envelope
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Raw Payload Inspector */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">GeoJSON Inspector (Localized to Selected Area)</CardTitle>
          <CardDescription>Review raw attributes and verify geometry completeness.</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="nws">
            <TabsList className="mb-2">
              <TabsTrigger value="nws">NWS Point Alert Feature</TabsTrigger>
              <TabsTrigger value="txdot">TxDOT Envelope Hazard Feature</TabsTrigger>
            </TabsList>
            <TabsContent value="nws">
              <pre className="bg-muted p-3 rounded-md text-xs overflow-x-auto max-h-72 font-mono">
                {nws.data?.features && nws.data.features.length > 0
                  ? JSON.stringify(nws.data.features[0], null, 2)
                  : nws.status === 'success'
                  ? 'No active weather alerts currently impacting these exact coordinates.'
                  : 'Run test to inspect payload.'}
              </pre>
            </TabsContent>
            <TabsContent value="txdot">
              <pre className="bg-muted p-3 rounded-md text-xs overflow-x-auto max-h-72 font-mono">
                {txdot.data?.features && txdot.data.features.length > 0
                  ? JSON.stringify(txdot.data.features[0], null, 2)
                  : txdot.status === 'success'
                  ? 'No non-open roadway incidents found within a 25-mile radius.'
                  : 'Run test to inspect payload.'}
              </pre>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
