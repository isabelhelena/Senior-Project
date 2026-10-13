# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "requests>=2.31.0",
#     "supabase>=2.0.0",
#     "python-dotenv>=1.0.0",
# ]
# ///

import os
import sys
import time
import requests
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

# Either define these in a .env file or export them directly in your shell
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    sys.exit(
        "Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be provided.\n"
        "Set them in a .env file or run:\n"
        "  export SUPABASE_URL='https://your-ref.supabase.co'\n"
        "  export SUPABASE_SERVICE_ROLE_KEY='your-key'\n"
    )

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]

UPSERT_BATCH_SIZE = 400
UPSERT_MAX_ATTEMPTS = 3

# Query Texas for medical care, responders, shelters, and basic recovery services.
OVERPASS_QUERY = """
[out:json][timeout:180];
area["ISO3166-2"="US-TX"][admin_level=4]->.texasArea;
(
  // Medical care and medication
  nwr["amenity"="hospital"](area.texasArea);
  nwr["amenity"="clinic"](area.texasArea);
  nwr["amenity"="doctors"](area.texasArea);
  nwr["amenity"="pharmacy"](area.texasArea);
  nwr["healthcare"="hospital"](area.texasArea);
  nwr["healthcare"="clinic"](area.texasArea);
  nwr["healthcare"="doctor"](area.texasArea);
  nwr["healthcare"="pharmacy"](area.texasArea);

  // Emergency responders
  nwr["amenity"="ambulance_station"](area.texasArea);
  nwr["emergency"="ambulance_station"](area.texasArea);
  nwr["amenity"="fire_station"](area.texasArea);
  nwr["emergency"="fire_service"](area.texasArea);
  nwr["amenity"="police"](area.texasArea);

  // Shelters and evacuation locations
  nwr["emergency"="shelter"](area.texasArea);
  nwr["social_facility"="shelter"](area.texasArea);
  nwr["amenity"="shelter"](area.texasArea);
  nwr["emergency"="assembly_point"](area.texasArea);
  nwr["emergency"="disaster_response"](area.texasArea);

  // Food, water, and community support
  nwr["amenity"="food_bank"](area.texasArea);
  nwr["social_facility"="food_bank"](area.texasArea);
  nwr["amenity"="soup_kitchen"](area.texasArea);
  nwr["social_facility"="soup_kitchen"](area.texasArea);
  nwr["amenity"="drinking_water"](area.texasArea);
  nwr["man_made"="water_tap"](area.texasArea);
  nwr["drinking_water"="yes"](area.texasArea);
  nwr["amenity"="community_centre"](area.texasArea);
);
out center tags;
"""

def fetch_overpass_data(query: str):
    print("1. Fetching emergency POIs from Overpass API (may take 30-90s)...")
    for endpoint in OVERPASS_URLS:
        try:
            resp = requests.post(endpoint, data={"data": query}, timeout=200)
            if resp.status_code == 200:
                data = resp.json()
                return data.get("elements", [])
            print(f"Warning: Endpoint {endpoint} returned status {resp.status_code}. Trying fallback...")
        except requests.RequestException as e:
            print(f"Endpoint {endpoint} failed: {e}. Trying fallback...")
            time.sleep(2)
    raise RuntimeError("All Overpass endpoints failed or timed out.")

def format_address(tags: dict) -> str | None:
    parts = [
        tags.get("addr:housenumber"),
        tags.get("addr:street"),
        tags.get("addr:city"),
        tags.get("addr:postcode"),
    ]
    formatted = " ".join([p for p in parts if p])
    return formatted if formatted else None

def determine_resource_type(tags: dict) -> str:
    if tags.get("amenity") == "hospital" or tags.get("healthcare") == "hospital":
        return "hospital"
    if tags.get("amenity") == "clinic" or tags.get("healthcare") == "clinic":
        return "clinic"
    if tags.get("amenity") == "pharmacy" or tags.get("healthcare") == "pharmacy":
        return "pharmacy"
    if tags.get("amenity") == "doctors" or tags.get("healthcare") == "doctor":
        return "doctor"
    if (
        tags.get("amenity") == "ambulance_station"
        or tags.get("emergency") == "ambulance_station"
    ):
        return "ambulance_station"
    if tags.get("amenity") == "fire_station" or tags.get("emergency") == "fire_service":
        return "fire_station"
    if tags.get("amenity") == "police":
        return "police_station"
    if (
        tags.get("emergency") == "shelter"
        or tags.get("social_facility") == "shelter"
        or tags.get("amenity") == "shelter"
    ):
        return "shelter"
    if tags.get("emergency") == "disaster_response":
        return "disaster_response"
    if tags.get("emergency") == "assembly_point":
        return "assembly_point"
    if (
        tags.get("amenity") == "food_bank"
        or tags.get("social_facility") == "food_bank"
    ):
        return "food_bank"
    if (
        tags.get("amenity") == "soup_kitchen"
        or tags.get("social_facility") == "soup_kitchen"
    ):
        return "soup_kitchen"
    if tags.get("amenity") == "community_centre":
        return "community_centre"
    if (
        tags.get("amenity") == "drinking_water"
        or tags.get("man_made") == "water_tap"
        or tags.get("drinking_water") == "yes"
    ):
        return "drinking_water"
    return "other"

def main():
    elements = fetch_overpass_data(OVERPASS_QUERY)
    print(f"Retrieved {len(elements)} raw records from OpenStreetMap.")

    records = []
    for el in elements:
        tags = el.get("tags", {})
        
        # Coordinates: nodes provide lat/lon; ways/relations provide center lat/lon
        lat = el.get("lat") or el.get("center", {}).get("lat")
        lon = el.get("lon") or el.get("center", {}).get("lon")
        
        if lat is None or lon is None:
            continue

        name = tags.get("name") or tags.get("operator")
        if not name:
            name = f"Unnamed {determine_resource_type(tags).replace('_', ' ').title()}"

        osm_id = f"{el.get('type')}/{el.get('id')}"
        res_type = determine_resource_type(tags)
        address = format_address(tags)
        phone = tags.get("phone") or tags.get("contact:phone")

        records.append({
            "osm_id": osm_id,
            "name": name,
            "resource_type": res_type,
            "address": address,
            "phone": phone,
            # PostGIS EWKT format expected by geometry(Point, 4326)
            "geom": f"SRID=4326;POINT({lon} {lat})",
        })

    print(f"2. Prepared {len(records)} cleaned records. Starting bulk upsert...")

    total_batches = (len(records) + UPSERT_BATCH_SIZE - 1) // UPSERT_BATCH_SIZE

    for i in range(0, len(records), UPSERT_BATCH_SIZE):
        batch = records[i:i + UPSERT_BATCH_SIZE]
        batch_number = i // UPSERT_BATCH_SIZE + 1
        for attempt in range(1, UPSERT_MAX_ATTEMPTS + 1):
            try:
                supabase.table("emergency_resources").upsert(
                    batch,
                    on_conflict="osm_id"
                ).execute()
                print(f"   Upserted batch {batch_number}/{total_batches}")
                break
            except Exception as err:
                if attempt == UPSERT_MAX_ATTEMPTS:
                    raise RuntimeError(
                        f"Batch {batch_number}/{total_batches} failed after "
                        f"{UPSERT_MAX_ATTEMPTS} attempts; stopping import."
                    ) from err

                delay_seconds = 2 ** (attempt - 1)
                print(
                    f"   Batch {batch_number}/{total_batches} attempt "
                    f"{attempt}/{UPSERT_MAX_ATTEMPTS} failed: {err}. "
                    f"Retrying in {delay_seconds}s..."
                )
                time.sleep(delay_seconds)

    print("Complete! All Texas emergency resources synced to Supabase.")

if __name__ == "__main__":
    main()