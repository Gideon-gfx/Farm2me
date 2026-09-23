import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

// Faithful render of the imported "Farm2me Desktop Prototype" design deck.
// The deck itself is a self-contained static document served from /public.
export default function Prototype() {
  return (
    <div className="flex h-screen flex-col bg-[#EDEAE0]">
      <header className="flex items-center gap-3 bg-[#24352A] px-4 py-3 text-[#F5EFE2]">
        <Link to="/" className="inline-flex items-center gap-1 text-sm font-semibold hover:underline">
          <ArrowLeft size={16} /> Back
        </Link>
        <span className="text-sm font-bold">Farm2me — Desktop Prototype</span>
        <a
          href="/prototype/desktop.html"
          target="_blank"
          rel="noreferrer"
          className="ml-auto text-xs text-[#8FBF9C] hover:underline"
        >
          Open standalone ↗
        </a>
      </header>
      <iframe
        title="Farm2me Desktop Prototype"
        src="/prototype/desktop.html"
        className="min-h-0 flex-1 border-0"
      />
    </div>
  );
}
