-- Apply once in the existing project's SQL Editor. No other alert tables change.
begin;

alter table public.public_alerts
  add column if not exists properties jsonb not null default '{}'::jsonb,
  add column if not exists fetched_at timestamptz;
create index if not exists public_alerts_geom_idx on public.public_alerts using gist (geom);
create index if not exists public_alerts_source_expiry_idx on public.public_alerts (source, expires_at);

create table if not exists public.official_ingestion_status (
  source text primary key check (source in ('nws', 'txdot')),
  fetched_at timestamptz not null,
  completed_at timestamptz not null default now(),
  record_count integer not null
);
alter table public.official_ingestion_status enable row level security;
revoke all on public.official_ingestion_status from anon, authenticated;

-- A complete source snapshot is committed atomically: validation or geometry
-- failures roll back the upserts AND deletion. The caller must fetch every page.
create or replace function public.sync_official_alerts(
  p_source text, p_fetched_at timestamptz, p_features jsonb
) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  f jsonb;
  feature_id text;
  shape public.geometry;
  expiration timestamptz;
  stored integer;
begin
  if p_source not in ('nws', 'txdot') or p_source is null
     or p_fetched_at is null or p_fetched_at > now() + interval '5 minutes'
     or jsonb_typeof(p_features) is distinct from 'array' then
    raise exception 'Invalid official snapshot';
  end if;
  perform pg_advisory_xact_lock(hashtext('official-alerts:' || p_source));
  if exists (select 1 from public.official_ingestion_status
             where source = p_source and fetched_at >= p_fetched_at) then
    raise exception 'Snapshot is older than the stored snapshot';
  end if;
  if (select count(*) <> count(distinct item->>'id')
      from jsonb_array_elements(p_features) item) then
    raise exception 'Missing or duplicate source IDs';
  end if;

  for f in select value from jsonb_array_elements(p_features) loop
    feature_id := f->>'id';
    if nullif(feature_id, '') is null
       or f->>'type' is distinct from 'Feature'
       or jsonb_typeof(f->'properties') is distinct from 'object' then
      raise exception 'Invalid feature';
    end if;
    shape := public.st_setsrid(public.st_geomfromgeojson((f->'geometry')::text), 4326);
    if shape is null or public.st_isempty(shape) then
      raise exception 'Missing geometry for %', feature_id;
    end if;
    if p_source = 'nws' then
      if public.geometrytype(shape) not in ('POLYGON', 'MULTIPOLYGON') then
        raise exception 'NWS geometry must be polygonal';
      end if;
      shape := public.st_multi(public.st_collectionextract(
        public.st_unaryunion(public.st_makevalid(shape)), 3));
    elsif public.geometrytype(shape) not in ('LINESTRING', 'MULTILINESTRING') then
      raise exception 'TxDOT geometry must be linear';
    end if;
    if public.st_isempty(shape) or not public.st_isvalid(shape) then
      raise exception 'Invalid geometry for %', feature_id;
    end if;
    expiration := nullif(f->>'expires_at', '')::timestamptz;
    if p_source = 'nws' and expiration is null then
      raise exception 'NWS expiration required';
    end if;
    insert into public.public_alerts
      (source, external_id, headline, description, geom, expires_at, properties, fetched_at)
    values (p_source, p_source || ':' || feature_id,
      f->>'headline', f->>'description', shape, expiration, f->'properties', p_fetched_at)
    on conflict (external_id) do update set
      headline = excluded.headline, description = excluded.description,
      geom = excluded.geom, expires_at = excluded.expires_at,
      properties = excluded.properties, fetched_at = excluded.fetched_at
    where public.public_alerts.source = p_source;
  end loop;

  delete from public.public_alerts
  where source = p_source and (fetched_at is distinct from p_fetched_at or expires_at <= now());
  select count(*) into stored from public.public_alerts where source = p_source;
  insert into public.official_ingestion_status (source, fetched_at, completed_at, record_count)
  values (p_source, p_fetched_at, now(), stored)
  on conflict (source) do update set fetched_at = excluded.fetched_at,
    completed_at = excluded.completed_at, record_count = excluded.record_count;
  return stored;
end;
$$;

create or replace function public.prune_official_alerts() returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare removed integer;
begin
  delete from public.public_alerts where source in ('nws', 'txdot') and expires_at <= now();
  get diagnostics removed = row_count;
  return removed;
end;
$$;

-- Scalar JSON avoids PostgREST's row limit; no service-role key in Next.js.
-- Explicit expiry filtering also hides expired records when the PC is asleep.
create or replace function public.read_official_alerts(p_source text) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'type', 'FeatureCollection',
    'features', coalesce((select jsonb_agg(jsonb_build_object(
      'type', 'Feature', 'id', a.external_id,
      'geometry', public.st_asgeojson(a.geom)::jsonb,
      'properties', a.properties || jsonb_build_object('id', a.external_id,
        'fetched_at', a.fetched_at)
    ) order by a.external_id) from public.public_alerts a
      where a.source = p_source and p_source in ('nws', 'txdot')
        and a.fetched_at is not null and (a.expires_at is null or a.expires_at > now())), '[]'::jsonb),
    'fetchedAt', (select fetched_at from public.official_ingestion_status where source = p_source),
    'stale', coalesce((select fetched_at < now() - interval '30 minutes'
      from public.official_ingestion_status where source = p_source), true)
  );
$$;

revoke all on function public.sync_official_alerts(text, timestamptz, jsonb) from public, anon, authenticated;
revoke all on function public.prune_official_alerts() from public, anon, authenticated;
revoke all on function public.read_official_alerts(text) from public, anon, authenticated;
grant execute on function public.sync_official_alerts(text, timestamptz, jsonb) to service_role;
grant execute on function public.prune_official_alerts() to service_role;
grant execute on function public.read_official_alerts(text) to anon, authenticated, service_role;
notify pgrst, 'reload schema';
commit;
