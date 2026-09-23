import TopBar from "../components/TopBar";
import PoolBoardContent from "../components/PoolBoardContent";

// Standalone route (/pools) for Buyer/public. Farmer reaches the same
// content nested at /farmer/:name/pools instead, inside its own AppShell.
export default function PoolBoard() {
  return (
    <div className="min-h-screen bg-page-background">
      <TopBar />
      <main className="px-4 py-6">
        <PoolBoardContent />
      </main>
    </div>
  );
}
