import type { DisasterCategory, SocialAlert } from "@/types/hazard";

const AID_RESOURCE_CATEGORIES = new Set<DisasterCategory>([
  "shelter",
  "water_station",
]);

export function isAidResourceCategory(category: DisasterCategory) {
  return AID_RESOURCE_CATEGORIES.has(category);
}

export function isAidResourceReport(
  report: Pick<SocialAlert, "category">,
) {
  return isAidResourceCategory(report.category);
}

export function distanceMiles(
  from: [number, number],
  to: [number, number],
) {
  const earthRadiusMiles = 3958.8;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const [fromLng, fromLat] = from;
  const [toLng, toLat] = to;
  const latDelta = toRadians(toLat - fromLat);
  const lngDelta = toRadians(toLng - fromLng);

  const a =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(toRadians(fromLat)) *
      Math.cos(toRadians(toLat)) *
      Math.sin(lngDelta / 2) ** 2;

  return 2 * earthRadiusMiles * Math.asin(Math.sqrt(a));
}
