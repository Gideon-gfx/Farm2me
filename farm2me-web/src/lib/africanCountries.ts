// Flag emoji is derived from the ISO 3166-1 alpha-2 code (regional indicator
// symbols), so only name/iso2/dial need to be listed per country.
function flagOf(iso2: string): string {
  return [...iso2.toUpperCase()].map((c) => String.fromCodePoint(127397 + c.charCodeAt(0))).join("");
}

export interface Country {
  name: string;
  iso2: string;
  dial: string;
  flag: string;
}

const RAW: [string, string, string][] = [
  ["Algeria", "DZ", "213"],
  ["Angola", "AO", "244"],
  ["Benin", "BJ", "229"],
  ["Botswana", "BW", "267"],
  ["Burkina Faso", "BF", "226"],
  ["Burundi", "BI", "257"],
  ["Cabo Verde", "CV", "238"],
  ["Cameroon", "CM", "237"],
  ["Central African Republic", "CF", "236"],
  ["Chad", "TD", "235"],
  ["Comoros", "KM", "269"],
  ["Congo (Congo-Brazzaville)", "CG", "242"],
  ["Congo (DRC)", "CD", "243"],
  ["Djibouti", "DJ", "253"],
  ["Egypt", "EG", "20"],
  ["Equatorial Guinea", "GQ", "240"],
  ["Eritrea", "ER", "291"],
  ["Eswatini", "SZ", "268"],
  ["Ethiopia", "ET", "251"],
  ["Gabon", "GA", "241"],
  ["Gambia", "GM", "220"],
  ["Ghana", "GH", "233"],
  ["Guinea", "GN", "224"],
  ["Guinea-Bissau", "GW", "245"],
  ["Ivory Coast", "CI", "225"],
  ["Kenya", "KE", "254"],
  ["Lesotho", "LS", "266"],
  ["Liberia", "LR", "231"],
  ["Libya", "LY", "218"],
  ["Madagascar", "MG", "261"],
  ["Malawi", "MW", "265"],
  ["Mali", "ML", "223"],
  ["Mauritania", "MR", "222"],
  ["Mauritius", "MU", "230"],
  ["Morocco", "MA", "212"],
  ["Mozambique", "MZ", "258"],
  ["Namibia", "NA", "264"],
  ["Niger", "NE", "227"],
  ["Nigeria", "NG", "234"],
  ["Rwanda", "RW", "250"],
  ["Sao Tome and Principe", "ST", "239"],
  ["Senegal", "SN", "221"],
  ["Seychelles", "SC", "248"],
  ["Sierra Leone", "SL", "232"],
  ["Somalia", "SO", "252"],
  ["South Africa", "ZA", "27"],
  ["South Sudan", "SS", "211"],
  ["Sudan", "SD", "249"],
  ["Tanzania", "TZ", "255"],
  ["Togo", "TG", "228"],
  ["Tunisia", "TN", "216"],
  ["Uganda", "UG", "256"],
  ["Zambia", "ZM", "260"],
  ["Zimbabwe", "ZW", "263"],
];

export const AFRICAN_COUNTRIES: Country[] = RAW.map(([name, iso2, dial]) => ({
  name,
  iso2,
  dial,
  flag: flagOf(iso2),
})).sort((a, b) => a.name.localeCompare(b.name));

export const DEFAULT_COUNTRY = AFRICAN_COUNTRIES.find((c) => c.iso2 === "NG")!;
