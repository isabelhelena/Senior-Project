import { officialAlerts } from "@/lib/official-alerts";

export async function GET() {
  return officialAlerts("nws");
}
