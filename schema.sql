


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
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."emergency_resources" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."public_alerts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "source" "text" NOT NULL,
    "external_id" "text" NOT NULL,
    "headline" "text",
    "description" "text",
    "geom" "public"."geometry"(Geometry,4326) NOT NULL,
    "expires_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
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



ALTER TABLE ONLY "public"."public_alerts"
    ADD CONSTRAINT "public_alerts_external_id_key" UNIQUE ("external_id");



ALTER TABLE ONLY "public"."public_alerts"
    ADD CONSTRAINT "public_alerts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."social_alerts"
    ADD CONSTRAINT "social_alerts_bluesky_uri_key" UNIQUE ("bluesky_uri");



ALTER TABLE ONLY "public"."social_alerts"
    ADD CONSTRAINT "social_alerts_pkey" PRIMARY KEY ("id");



ALTER TABLE "public"."community_reports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."emergency_resources" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."public_alerts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."social_alerts" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."get_incidents_in_bbox"("min_lon" double precision, "min_lat" double precision, "max_lon" double precision, "max_lat" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."get_incidents_in_bbox"("min_lon" double precision, "min_lat" double precision, "max_lon" double precision, "max_lat" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_incidents_in_bbox"("min_lon" double precision, "min_lat" double precision, "max_lon" double precision, "max_lat" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON TABLE "public"."community_reports" TO "anon";
GRANT ALL ON TABLE "public"."community_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."community_reports" TO "service_role";



GRANT ALL ON TABLE "public"."emergency_resources" TO "anon";
GRANT ALL ON TABLE "public"."emergency_resources" TO "authenticated";
GRANT ALL ON TABLE "public"."emergency_resources" TO "service_role";



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







