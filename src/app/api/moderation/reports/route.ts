import { NextRequest } from "next/server";
import { isReportStatus } from "@/lib/report-validation";
import {
  readReportJson, ReportError, reportError,
  reportResponse, reportRpc, requireSameOrigin,
} from "@/lib/community-report-server";

function requireModeratorToken(request: NextRequest) {
  const value = request.cookies.get("lss_moderator")?.value;
  if (!value) throw new ReportError(401, "Please sign in as a moderator.");
  return value;
}

export async function GET(request: NextRequest) {
  try {
    const accessToken = requireModeratorToken(request);
    const status = request.nextUrl.searchParams.get("status") || "pending";
    const page = Number(request.nextUrl.searchParams.get("page") || "0");
    if (!isReportStatus(status) || !Number.isInteger(page) || page < 0 || page > 1000) {
      throw new ReportError(400, "Invalid queue filter.");
    }
    return reportResponse(await reportRpc("list_community_report_queue", { p_status: status, p_offset: page * 50 }, accessToken));
  } catch (error) {
    return reportError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    requireSameOrigin(request);
    const accessToken = requireModeratorToken(request);
    const body = await readReportJson(request);
    const validId = typeof body.id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.id);
    const validDecision = body.status === "approved" || body.status === "rejected";
    if (!validId || !validDecision || !isReportStatus(body.expectedStatus)) {
      throw new ReportError(400, "Choose a report and a valid moderation decision.");
    }
    if (typeof body.notes !== "string" || body.notes.trim().length < 3 || body.notes.length > 500) {
      throw new ReportError(400, "Enter a review note (3–500 characters).");
    }
    return reportResponse(await reportRpc("moderate_community_report", {
      p_id: body.id,
      p_status: body.status,
      p_expected_status: body.expectedStatus,
      p_notes: body.notes.trim(),
    }, accessToken));
  } catch (error) {
    return reportError(error);
  }
}
