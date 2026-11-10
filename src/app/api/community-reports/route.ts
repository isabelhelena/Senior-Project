import { parseReportBounds, validateSubmission } from "@/lib/community-report-validation";
import {
  readReportJson, ReportError, reportError, reportResponse,
  reportRpc, requireSameOrigin, submissionIdentity,
} from "@/lib/community-report-server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const identity = submissionIdentity(request);
    const payload = validateSubmission(await readReportJson(request));
    if (!payload) throw new ReportError(400, "Check the report fields and choose a location within Texas.");
    const receipt = await reportRpc("submit_community_report", {
      p_secret: identity.secret,
      p_ip_hash: identity.ipHash,
      p_payload: payload,
    });
    return reportResponse(receipt, 201);
  } catch (error) {
    return reportError(error);
  }
}

export async function GET(request: Request) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const bounds = parseReportBounds(searchParams.get("bbox"));
    if (!bounds) throw new ReportError(400, "Provide bbox=west,south,east,north within a 15-degree area.");
    const [west, south, east, north] = bounds;
    return reportResponse(await reportRpc("read_community_reports", {
      p_west: west,
      p_south: south,
      p_east: east,
      p_north: north,
    }));
  } catch (error) {
    return reportError(error);
  }
}
