import { ModerationQueue } from "@/components/reporting/ModerationQueue";

export const metadata = { title: "Report moderation | Lone Star Support", robots: { index: false, follow: false } };

export default function ModerationPage() {
  return <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8">
    <header><h1 className="text-3xl font-bold">Community report moderation</h1>
      <p className="mt-2 text-muted-foreground">Review location, relevance, and personal information before publishing. Approval does not independently verify a report.</p></header>
    <ModerationQueue />
  </main>;
}
