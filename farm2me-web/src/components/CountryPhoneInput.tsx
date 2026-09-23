import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { AFRICAN_COUNTRIES, DEFAULT_COUNTRY, type Country } from "../lib/africanCountries";

// Combined country-code + flag picker and subscriber-number input. Emits the
// full E.164-ish phone number ("+234803...") via onChange.
export default function CountryPhoneInput({
  value,
  onChange,
  placeholder = "803 000 0000",
}: {
  value: string;
  onChange: (phone: string) => void;
  placeholder?: string;
}) {
  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [digits, setDigits] = useState("");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    onChange(digits ? `+${country.dial}${digits}` : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [country, digits]);

  // Reset the visible fields if the parent clears `value` externally (e.g.
  // switching between signup/login).
  useEffect(() => {
    if (value === "" && digits !== "") setDigits("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [open]);

  return (
    <div className="mt-1 flex items-center gap-2">
      <div ref={rootRef} className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="input flex min-h-tap items-center gap-1.5 whitespace-nowrap px-3"
        >
          <span>{country.flag}</span>
          <span className="font-bold">+{country.dial}</span>
          <ChevronDown size={14} className={`text-muted transition-transform ${open ? "rotate-180" : ""}`} />
        </button>

        {open && (
          <div className="absolute z-20 mt-2 max-h-72 w-64 overflow-auto rounded-2xl border border-border bg-white py-1.5 shadow-lg">
            {AFRICAN_COUNTRIES.map((c) => (
              <button
                key={c.iso2}
                type="button"
                onClick={() => {
                  setCountry(c);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm hover:bg-background ${
                  c.iso2 === country.iso2 ? "font-extrabold text-primary" : "text-primary-dark"
                }`}
              >
                <span>{c.flag}</span>
                <span className="flex-1 truncate">{c.name}</span>
                <span className="text-muted">+{c.dial}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <input
        className="input flex-1"
        inputMode="numeric"
        placeholder={placeholder}
        value={digits}
        onChange={(e) => {
          let v = e.target.value.replace(/\D/g, "");
          if (v.startsWith("0")) v = v.slice(1);
          setDigits(v.slice(0, 12));
        }}
      />
    </div>
  );
}
