"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { REPORT_STATUSES, isReportStatus, type ReportStatus } from "@/lib/report-validation";

interface QueueReport {
  id: string;
  category: string;
  urgency: string;
  description: string;
  status: ReportStatus;
  flags: string[];
  created_at: string;
  expires_at: string;
  latitude: number;
  longitude: number;
  review_notes: string | null;
  source_classification: { category?: string; urgency?: string };
}

export function ModerationQueue() {
  const [signedIn, setSignedIn] = useState(false);
  const [reports, setReports] = useState<QueueReport[]>([]);
  const [status, setStatus] = useState<ReportStatus>("pending");
  const [page, setPage] = useState(0);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshCount, setRefreshCount] = useState(0);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loadedAt, setLoadedAt] = useState(0);
  const busy = loading || saving;

  // One place loads the queue. Changing the filter, page, or refresh count reloads it.
  useEffect(() => {
    const controller = new AbortController();

    async function loadReports() {
      try {
        const response = await fetch(`/api/moderation/reports?status=${status}&page=${page}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = await response.json();
        if (controller.signal.aborted) return;

        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            setSignedIn(false);
            setReports([]);
            setNotes({});
          }
          throw new Error(data.error || "Could not load reports.");
        }

        setSignedIn(true);
        setReports(data.reports);
        setLoadedAt(Date.now());
      } catch (error) {
        if (!controller.signal.aborted) {
          setMessage(error instanceof Error ? error.message : "Could not load reports.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadReports();
    // Cancel the previous load when navigating away or requesting another page.
    return () => controller.abort();
  }, [status, page, refreshCount]);

  function refreshReports() {
    setLoading(true);
    setRefreshCount((count) => count + 1);
  }

  function changeStatus(value: string) {
    if (!isReportStatus(value)) return;
    setMessage("");
    setLoading(true);
    setStatus(value);
    setPage(0);
  }

  function changePage(nextPage: number) {
    setMessage("");
    setLoading(true);
    setPage(nextPage);
  }

  async function signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    const form = event.currentTarget;
    const fields = new FormData(form);
    try {
      const response = await fetch("/api/moderation/session", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: fields.get("email"), password: fields.get("password") }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Sign-in failed.");
      form.reset();
      setSignedIn(true);
      refreshReports();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sign-in failed.");
    } finally {
      setSaving(false);
    }
  }

  async function review(report: QueueReport, decision: "approved" | "rejected") {
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/moderation/reports", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: report.id, status: decision, expectedStatus: report.status, notes: notes[report.id] || "" }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          setSignedIn(false);
          setReports([]);
          setNotes({});
        }
        throw new Error(data.error || "Review could not be saved.");
      }
      setNotes((current) => {
        const next = { ...current };
        delete next[report.id];
        return next;
      });
      setMessage(`Report ${decision}.`);
      refreshReports();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Review could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function signOut() {
    setSaving(true);
    try {
      const response = await fetch("/api/moderation/session", { method: "DELETE" });
      if (!response.ok) throw new Error("Sign-out failed. Please try again.");
      setSignedIn(false);
      setReports([]);
      setNotes({});
      setMessage("Signed out.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sign-out failed.");
    } finally {
      setSaving(false);
    }
  }

  return <section className="space-y-5" aria-busy={busy}>
    <p role="status" className="min-h-6 text-sm">{message}</p>
    {!signedIn ? <form onSubmit={signIn} className="max-w-md space-y-4 rounded-xl border bg-card p-5">
      <p className="text-sm text-muted-foreground">Sign in with a Supabase account authorized to moderate reports.</p>
      <label className="block space-y-1">Email<Input name="email" type="email" autoComplete="username" required maxLength={254} /></label>
      <label className="block space-y-1">Password<Input name="password" type="password" autoComplete="current-password" required maxLength={1024} /></label>
      <Button disabled={busy} type="submit">Sign in</Button>
    </form> : <>
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1">Queue<select aria-label="Report status" value={status} disabled={busy} onChange={(event) => changeStatus(event.target.value)} className="block min-h-11 rounded-md border bg-background px-3">
          {REPORT_STATUSES.map((value) => <option key={value}>{value}</option>)}
        </select></label>
        <Button variant="outline" disabled={busy} onClick={() => { setMessage(""); refreshReports(); }}>Refresh</Button>
        <Button variant="outline" disabled={busy} onClick={() => void signOut()}>Sign out</Button>
      </div>
      {!reports.length && !busy && <p>No {status} reports on this page.</p>}
      {reports.map((report) => {
        const note = notes[report.id] || "";
        const canReview = !busy && note.trim().length >= 3;
        const expired = new Date(report.expires_at).getTime() <= loadedAt;

        return <article key={report.id} className="space-y-3 rounded-xl border bg-card p-5">
        <h2 className="font-semibold">{report.source_classification.category || report.category} · {report.urgency}</h2>
        <p className="whitespace-pre-wrap break-words">{report.description}</p>
        <p className="text-sm text-muted-foreground">{report.latitude.toFixed(5)}, {report.longitude.toFixed(5)} · Submitted {new Date(report.created_at).toLocaleString()}</p>
        <p className="text-sm">{expired ? "Expired — approval will not republish this report." : `Expires ${new Date(report.expires_at).toLocaleString()}`}</p>
        <p className="text-sm">Flags: {report.flags.length ? report.flags.join(", ") : "none"}</p>
        {report.review_notes && <p className="text-sm">Previous review: {report.review_notes}</p>}
        <label className="block space-y-1 text-sm">
          Review note (required)
          <Textarea
            aria-label={`Review note for ${report.id}`}
            value={note}
            minLength={3}
            maxLength={500}
            onChange={(event) => setNotes((current) => ({ ...current, [report.id]: event.target.value }))}
          />
        </label>
        <div className="flex gap-3">
          <Button disabled={!canReview || report.status === "approved"} onClick={() => void review(report, "approved")}>Approve</Button>
          <Button variant="outline" disabled={!canReview || report.status === "rejected"} onClick={() => void review(report, "rejected")}>Reject</Button>
        </div>
      </article>;
      })}
      <div className="flex items-center gap-3">
        <Button variant="outline" disabled={busy || page === 0} onClick={() => changePage(page - 1)}>Previous</Button>
        <span>Page {page + 1}</span>
        <Button variant="outline" disabled={busy || reports.length < 50} onClick={() => changePage(page + 1)}>Next</Button>
      </div>
    </>}
  </section>;
}
