// Farm2me mark — ported 1:1 from the UI prototype's plant glyph + wordmark
// (gold "2" underlined with a small arrow).
export function FarmLeafIcon({ size = 40, dark = false }: { size?: number; dark?: boolean }) {
  const green = dark ? "#8FBF9C" : "#2F6B3F";
  const stem = dark ? "#F5EFE2" : "#F5EFE2";
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <line x1={20} y1={52} x2={20} y2={20} stroke="#D9A441" strokeWidth={2.2} strokeLinecap="round" />
      <ellipse cx={20} cy={19} rx={2.8} ry={5.5} fill="#D9A441" />
      <ellipse cx={15.5} cy={26} rx={2.6} ry={5.3} fill="#D9A441" transform="rotate(-32 15.5 26)" />
      <ellipse cx={24.5} cy={26} rx={2.6} ry={5.3} fill="#D9A441" transform="rotate(32 24.5 26)" />
      <ellipse cx={14.8} cy={34} rx={2.6} ry={5.3} fill="#D9A441" transform="rotate(-32 14.8 34)" />
      <ellipse cx={25.2} cy={34} rx={2.6} ry={5.3} fill="#D9A441" transform="rotate(32 25.2 34)" />
      <ellipse cx={14.8} cy={42} rx={2.6} ry={5.3} fill="#EFC878" transform="rotate(-32 14.8 42)" />
      <ellipse cx={25.2} cy={42} rx={2.6} ry={5.3} fill="#EFC878" transform="rotate(32 25.2 42)" />
      <path d="M24 51 C36 48 34 40 43 33" stroke={green} strokeWidth={2.2} strokeLinecap="round" strokeDasharray="1 5.5" />
      <path d="M46 8 C40.5 8 37 12 37 17 c0 6.5 9 14 9 14 s9 -7.5 9 -14 C55 12 51.5 8 46 8 Z" fill={dark ? stem : "#2F6B3F"} />
      <circle cx={46} cy={16.5} r={4.2} fill={dark ? "#F5EFE2" : "#F5EFE2"} />
      <ellipse cx={46} cy={16.5} rx={1.9} ry={3.4} fill="#D9A441" />
    </svg>
  );
}

export function FarmWordmark({ size = "text-2xl", dark = false }: { size?: string; dark?: boolean }) {
  const base = dark ? "text-[#F5EFE2]" : "text-primary-dark";
  return (
    <span className={`font-extrabold tracking-tight ${size} ${base}`}>
      Farm
      <span className="relative inline-block text-accent">
        2
        <svg width={17} height={7} viewBox="0 0 19 8" className="absolute left-1/2 -translate-x-1/2 -bottom-2">
          <path d="M1.5 4 H15 M15 4 l-4 -3 M15 4 l-4 3" stroke="#D9A441" strokeWidth={2} strokeLinecap="round" fill="none" />
        </svg>
      </span>
      me
    </span>
  );
}

export function FarmTagline({ dark = false }: { dark?: boolean }) {
  return (
    <span
      className={`text-[10px] font-bold uppercase tracking-[.3em] ${dark ? "text-[#8FBF9C]" : "text-primary"}`}
    >
      Farmers · Movers · Buyers
    </span>
  );
}
