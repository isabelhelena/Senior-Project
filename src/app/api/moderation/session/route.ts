import { NextRequest } from "next/server";
import {
  readReportJson, ReportError, reportError, reportResponse,
  reportRpc, requireSameOrigin, supabaseConfig,
} from "@/lib/community-report-server";

export async function POST(request: NextRequest) {
  try {
    requireSameOrigin(request);
    const body = await readReportJson(request);
    if (typeof body.email !== "string" || typeof body.password !== "string" || body.email.length > 254 || !body.password || body.password.length > 1024) {
      throw new ReportError(400, "Enter your moderator email and password.");
    }
    const { url, key } = supabaseConfig();
    const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: key, "Content-Type": "application/json" },
      body: JSON.stringify({ email: body.email.trim(), password: body.password }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      let status = 401;
      if (response.status === 429) status = 429;
      if (response.status >= 500) status = 503;
      throw new ReportError(status, "Sign-in failed. Check your credentials or try again later.");
    }
    const session = await response.json();
    if (typeof session.access_token !== "string" || !Number.isFinite(session.expires_in)) {
      throw new ReportError(503, "Sign-in is temporarily unavailable.");
    }
    // Supabase verifies the token, then the RPC checks the database moderator allowlist.
    await reportRpc("list_community_report_queue", { p_status: "pending", p_offset: 0 }, session.access_token);
    const result = reportResponse({ signedIn: true });
    result.cookies.set("lss_moderator", session.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/api/moderation",
      maxAge: Math.max(1, Math.min(3600, session.expires_in)),
    });
    return result;
  } catch (error) {
    return reportError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    requireSameOrigin(request);
    const result = reportResponse({ signedIn: false });
    result.cookies.set("lss_moderator", "", {
      path: "/api/moderation",
      maxAge: 0,
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
    });
    return result;
  } catch (error) {
    return reportError(error);
  }
}
