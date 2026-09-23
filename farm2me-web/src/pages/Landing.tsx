import { Link } from "react-router-dom";
import { ArrowRight, ListChecks, Store, Truck, Users, Wallet, Wheat } from "lucide-react";
import TopBar from "../components/TopBar";
import { FarmLeafIcon, FarmTagline, FarmWordmark } from "../components/Logo";

const ROLE_CARDS = [
  { role: "FARMER", icon: Wheat, label: "I'm a Farmer", blurb: "List your harvest and get paid via escrow.", tint: "bg-success text-primary" },
  { role: "BUYER", icon: Store, label: "I'm a Buyer", blurb: "Source quality produce directly.", tint: "bg-escrow text-escrow-ink" },
  { role: "TRANSPORTER", icon: Truck, label: "I'm a Transporter", blurb: "Find loads and earn on every trip.", tint: "bg-black/5 text-primary-dark" },
];

const STEPS = [
  { icon: ListChecks, title: "List", text: "Farmers post produce with weight, grade and price." },
  { icon: Users, title: "Pool", text: "Combine harvests into Village Pools to fill big orders." },
  { icon: Wallet, title: "Get Paid", text: "Escrow releases payment the moment goods are delivered." },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-page-background">
      <TopBar />

      {/* Hero */}
      <section className="bg-primary-dark text-[#F5EFE2]">
        <div className="mx-auto flex max-w-6xl flex-col items-center px-4 py-16 text-center">
          <FarmLeafIcon size={72} dark />
          <div className="mt-4">
            <FarmWordmark size="text-4xl" dark />
          </div>
          <div className="mt-3">
            <FarmTagline dark />
          </div>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-[#F5EFE2]/80">
            One marketplace connecting farm produce, bulk buyers and transport — with every
            payment protected by escrow.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link to="/pools" className="btn-accent">Browse Village Pools</Link>
            <Link to="/auth" className="btn border-2 border-white/25 text-[#F5EFE2] hover:bg-white/10">
              Get started <ArrowRight size={18} />
            </Link>
          </div>
        </div>
      </section>

      {/* Role cards */}
      <section className="mx-auto max-w-6xl px-4 py-14">
        <h2 className="mb-6 text-center text-2xl font-extrabold text-primary-dark">How will you use Farm2me?</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {ROLE_CARDS.map(({ role, icon: Icon, label, blurb, tint }) => (
            <Link
              key={role}
              to={`/auth?role=${role}`}
              className="card flex flex-col items-center p-8 text-center transition hover:border-accent hover:shadow-[0_6px_20px_rgba(0,0,0,.08)]"
            >
              <span className={`flex h-16 w-16 items-center justify-center rounded-2xl ${tint}`}>
                <Icon size={32} />
              </span>
              <span className="mt-4 text-lg font-extrabold text-primary-dark">{label}</span>
              <span className="mt-1 text-sm text-muted">{blurb}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="bg-white py-14">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="mb-8 text-center text-2xl font-extrabold text-primary-dark">How it works</h2>
          <div className="grid gap-6 sm:grid-cols-3">
            {STEPS.map(({ icon: Icon, title, text }, i) => (
              <div key={title} className="flex flex-col items-center text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-ink">
                  <Icon size={26} />
                </span>
                <span className="mt-3 text-sm font-bold text-muted">Step {i + 1}</span>
                <span className="text-lg font-extrabold text-primary-dark">{title}</span>
                <p className="mt-1 max-w-xs text-sm text-muted">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-primary-dark text-[#F5EFE2]/70">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-10 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <FarmWordmark size="text-lg" dark />
            <p className="mt-1 text-sm">SW Nigeria Agricultural Marketplace</p>
          </div>
          <div className="text-sm">
            <p>Contact: hello@farm2me.ng · +234 800 000 0000</p>
            <button className="mt-2 rounded border border-white/20 px-3 py-1 text-xs" disabled>
              🌐 English (Yorùbá coming soon)
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
