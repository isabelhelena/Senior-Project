-- Upgrade emergency_resources RLS, indexing, and get_nearby_emergency_resources RPC
-- Supports high-level category filtering (filter_types), keyword search (search_query),
-- excluding unnamed park/water nodes by default (include_unnamed), and row limits.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'emergency_resources'
      AND policyname = 'Allow public read access on emergency_resources'
  ) THEN
    CREATE POLICY "Allow public read access on emergency_resources"
      ON public.emergency_resources
      FOR SELECT
      USING (true);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS emergency_resources_type_idx
  ON public.emergency_resources USING btree (resource_type);

DROP FUNCTION IF EXISTS public.get_nearby_emergency_resources(double precision, double precision, double precision, text);

CREATE OR REPLACE FUNCTION public.get_nearby_emergency_resources(
  user_lon double precision,
  user_lat double precision,
  max_distance_meters double precision DEFAULT 25000,
  filter_type text DEFAULT NULL,
  filter_types text[] DEFAULT NULL,
  search_query text DEFAULT NULL,
  include_unnamed boolean DEFAULT false,
  result_limit integer DEFAULT 300
)
RETURNS TABLE(
  id uuid,
  osm_id text,
  name text,
  resource_type text,
  address text,
  phone text,
  dist_meters double precision,
  lon double precision,
  lat double precision
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    er.id,
    er.osm_id,
    er.name,
    er.resource_type,
    er.address,
    er.phone,
    st_distance(er.geom::geography, search_point.point) AS dist_meters,
    st_x(er.geom) AS lon,
    st_y(er.geom) AS lat
  FROM public.emergency_resources AS er
  CROSS JOIN (
    SELECT st_setsrid(st_point(user_lon, user_lat), 4326)::geography AS point
  ) AS search_point
  WHERE (filter_type IS NULL OR er.resource_type = filter_type)
    AND (filter_types IS NULL OR er.resource_type = ANY(filter_types))
    AND (COALESCE(include_unnamed, false) OR er.name NOT LIKE 'Unnamed %')
    AND (
      NULLIF(btrim(search_query), '') IS NULL
      OR er.name ILIKE '%' || btrim(search_query) || '%'
      OR COALESCE(er.address, '') ILIKE '%' || btrim(search_query) || '%'
      OR replace(er.resource_type, '_', ' ') ILIKE '%' || btrim(search_query) || '%'
    )
    AND st_dwithin(
      er.geom::geography,
      search_point.point,
      max_distance_meters
    )
  ORDER BY dist_meters ASC
  LIMIT GREATEST(1, LEAST(COALESCE(result_limit, 300), 1000));
$$;

GRANT ALL ON FUNCTION public.get_nearby_emergency_resources(
  double precision,
  double precision,
  double precision,
  text,
  text[],
  text,
  boolean,
  integer
) TO anon, authenticated, service_role;

