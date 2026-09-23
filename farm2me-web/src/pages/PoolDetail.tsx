import TopBar from "../components/TopBar";
import PoolDetailContent from "../components/PoolDetailContent";

// Standalone route (/pools/:id) for Buyer/public. Farmer reaches the same
// content nested at /farmer/:name/pools/:id instead, inside its own AppShell.
export default function PoolDetail() {
  return (
    <div className="min-h-screen bg-page-background">
      <TopBar />
      <main className="px-4 py-6">
        <PoolDetailContent />
      </main>
    </div>
  );
}
