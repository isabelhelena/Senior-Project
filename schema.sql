


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."disaster_category" AS ENUM (
    'flood',
    'freeze',
    'tornado',
    'road_hazard',
    'shelter',
    'water_station',
    'power_outage',
    'other'
);


ALTER TYPE "public"."disaster_category" OWNER TO "postgres";


CREATE TYPE "public"."urgency_level" AS ENUM (
    'low',
    'medium',
    'severe',
    'critical'
);


ALTER TYPE "public"."urgency_level" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_incidents_in_bbox"("min_lon" double precision, "min_lat" double precision, "max_lon" double precision, "max_lat" double precision) RETURNS json
    LANGUAGE "plpgsql"
    AS $$
begin
  return (
    select json_build_object(
      'type', 'FeatureCollection',
      'features', coalesce(json_agg(st_asgeojson(t.*)::json), '[]'::json)
    )
    from (
      select id, category, urgency, description, created_at, geom
      from community_reports
      where geom && st_makeenvelope(min_lon, min_lat, max_lon, max_lat, 4326)
        and created_at >= now() - interval '24 hours'
    ) t
  );
end;
$$;


ALTER FUNCTION "public"."get_incidents_in_bbox"("min_lon" double precision, "min_lat" double precision, "max_lon" double precision, "max_lat" double precision) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_nearby_emergency_resources"("user_lon" double precision, "user_lat" double precision, "max_distance_meters" double precision DEFAULT 25000, "filter_type" "text" DEFAULT NULL::"text") RETURNS TABLE("id" "uuid", "osm_id" "text", "name" "text", "resource_type" "text", "address" "text", "phone" "text", "dist_meters" double precision, "lon" double precision, "lat" double precision)
    LANGUAGE "sql" STABLE
    AS $$
  select
    er.id,
    er.osm_id,
    er.name,
    er.resource_type,
    er.address,
    er.phone,
    st_distance(er.geom::geography, search_point.point) as dist_meters,
    st_x(er.geom) as lon,
    st_y(er.geom) as lat
  from public.emergency_resources as er
  cross join (
    select st_setsrid(st_point(user_lon, user_lat), 4326)::geography as point
  ) as search_point
  where (filter_type is null or er.resource_type = filter_type)
    and st_dwithin(
      er.geom::geography,
      search_point.point,
      max_distance_meters
    )
  order by dist_meters asc;
$$;


ALTER FUNCTION "public"."get_nearby_emergency_resources"("user_lon" double precision, "user_lat" double precision, "max_distance_meters" double precision, "filter_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prune_official_alerts"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare removed integer;
begin
  delete from public.public_alerts where source in ('nws', 'txdot') and expires_at <= now();
  get diagnostics removed = row_count;
  return removed;
end;
$$;


ALTER FUNCTION "public"."prune_official_alerts"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."read_official_alerts"("p_source" "text") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."read_official_alerts"("p_source" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_official_alerts"("p_source" "text", "p_fetched_at" timestamp with time zone, "p_features" "jsonb") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."sync_official_alerts"("p_source" "text", "p_fetched_at" timestamp with time zone, "p_features" "jsonb") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."community_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "category" "text" NOT NULL,
    "description" "text" NOT NULL,
    "urgency" "text" DEFAULT 'low'::"text",
    "geom" "public"."geometry"(Point,4326) NOT NULL,
    "ip_hash" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."community_reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."emergency_resources" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "osm_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "resource_type" "text" NOT NULL,
    "address" "text",
    "geom" "public"."geometry"(Point,4326) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "phone" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb"
);


ALTER TABLE "public"."emergency_resources" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."official_ingestion_status" (
    "source" "text" NOT NULL,
    "fetched_at" timestamp with time zone NOT NULL,
    "completed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "record_count" integer NOT NULL,
    CONSTRAINT "official_ingestion_status_source_check" CHECK (("source" = ANY (ARRAY['nws'::"text", 'txdot'::"text"])))
);


ALTER TABLE "public"."official_ingestion_status" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."public_alerts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "source" "text" NOT NULL,
    "external_id" "text" NOT NULL,
    "headline" "text",
    "description" "text",
    "geom" "public"."geometry"(Geometry,4326) NOT NULL,
    "expires_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "properties" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "fetched_at" timestamp with time zone
);


ALTER TABLE "public"."public_alerts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."social_alerts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "bluesky_uri" "text" NOT NULL,
    "summary" "text" NOT NULL,
    "category" "text" NOT NULL,
    "urgency" "text" DEFAULT 'low'::"text",
    "geom" "public"."geometry"(Point,4326) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."social_alerts" OWNER TO "postgres";


ALTER TABLE ONLY "public"."community_reports"
    ADD CONSTRAINT "community_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."emergency_resources"
    ADD CONSTRAINT "emergency_resources_osm_id_key" UNIQUE ("osm_id");



ALTER TABLE ONLY "public"."emergency_resources"
    ADD CONSTRAINT "emergency_resources_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."official_ingestion_status"
    ADD CONSTRAINT "official_ingestion_status_pkey" PRIMARY KEY ("source");



ALTER TABLE ONLY "public"."public_alerts"
    ADD CONSTRAINT "public_alerts_external_id_key" UNIQUE ("external_id");



ALTER TABLE ONLY "public"."public_alerts"
    ADD CONSTRAINT "public_alerts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."social_alerts"
    ADD CONSTRAINT "social_alerts_bluesky_uri_key" UNIQUE ("bluesky_uri");



ALTER TABLE ONLY "public"."social_alerts"
    ADD CONSTRAINT "social_alerts_pkey" PRIMARY KEY ("id");



CREATE INDEX "emergency_resources_geog_gix" ON "public"."emergency_resources" USING "gist" ((("geom")::"public"."geography"));



CREATE INDEX "public_alerts_geom_idx" ON "public"."public_alerts" USING "gist" ("geom");



CREATE INDEX "public_alerts_source_expiry_idx" ON "public"."public_alerts" USING "btree" ("source", "expires_at");



ALTER TABLE "public"."community_reports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."emergency_resources" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."official_ingestion_status" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."public_alerts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."social_alerts" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."get_incidents_in_bbox"("min_lon" double precision, "min_lat" double precision, "max_lon" double precision, "max_lat" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."get_incidents_in_bbox"("min_lon" double precision, "min_lat" double precision, "max_lon" double precision, "max_lat" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_incidents_in_bbox"("min_lon" double precision, "min_lat" double precision, "max_lon" double precision, "max_lat" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_nearby_emergency_resources"("user_lon" double precision, "user_lat" double precision, "max_distance_meters" double precision, "filter_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_nearby_emergency_resources"("user_lon" double precision, "user_lat" double precision, "max_distance_meters" double precision, "filter_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_nearby_emergency_resources"("user_lon" double precision, "user_lat" double precision, "max_distance_meters" double precision, "filter_type" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."prune_official_alerts"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prune_official_alerts"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."read_official_alerts"("p_source" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."read_official_alerts"("p_source" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."read_official_alerts"("p_source" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."read_official_alerts"("p_source" "text") TO "authenticated";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."sync_official_alerts"("p_source" "text", "p_fetched_at" timestamp with time zone, "p_features" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_official_alerts"("p_source" "text", "p_fetched_at" timestamp with time zone, "p_features" "jsonb") TO "service_role";



GRANT ALL ON TABLE "public"."community_reports" TO "anon";
GRANT ALL ON TABLE "public"."community_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."community_reports" TO "service_role";



GRANT ALL ON TABLE "public"."emergency_resources" TO "anon";
GRANT ALL ON TABLE "public"."emergency_resources" TO "authenticated";
GRANT ALL ON TABLE "public"."emergency_resources" TO "service_role";



GRANT ALL ON TABLE "public"."official_ingestion_status" TO "service_role";



GRANT ALL ON TABLE "public"."public_alerts" TO "anon";
GRANT ALL ON TABLE "public"."public_alerts" TO "authenticated";
GRANT ALL ON TABLE "public"."public_alerts" TO "service_role";



GRANT ALL ON TABLE "public"."social_alerts" TO "anon";
GRANT ALL ON TABLE "public"."social_alerts" TO "authenticated";
GRANT ALL ON TABLE "public"."social_alerts" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







