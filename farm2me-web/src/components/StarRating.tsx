import { Star } from "lucide-react";

// Read-only average display, e.g. on a farmer/transporter's profile card.
export function StarDisplay({ average, count, size = 14 }: { average: number; count: number; size?: number }) {
  if (count === 0) {
    return <span className="text-xs text-muted">No ratings yet</span>;
  }
  return (
    <div className="flex items-center gap-1">
      <Star size={size} className="fill-accent text-accent" />
      <span className="text-xs font-bold text-primary-dark">{average.toFixed(1)}</span>
      <span className="text-xs text-muted">({count})</span>
    </div>
  );
}

// Interactive 1-5 star picker for submitting a rating.
export function StarPicker({ value, onChange, size = 22 }: { value: number; onChange: (v: number) => void; size?: number }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" onClick={() => onChange(n)} className="p-0.5">
          <Star size={size} className={n <= value ? "fill-accent text-accent" : "text-black/15"} />
        </button>
      ))}
    </div>
  );
}
