import TopBar from "../components/TopBar";
import SubscriptionContent from "../components/SubscriptionContent";

// Public standalone route (/subscription) — viewable signed-out too, hence
// TopBar (not AppShell, whose Sidebar needs a signed-in user). The signed-in
// dashboard versions (e.g. /farmer/:name/plans) render SubscriptionContent
// directly inside their own shell instead of this wrapper.
export default function Subscription() {
  return (
    <div className="min-h-screen bg-page-background">
      <TopBar />
      <main className="px-4 py-6">
        <SubscriptionContent />
      </main>
    </div>
  );
}
