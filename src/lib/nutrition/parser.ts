// Deterministic ingredient-text parser + name resolver.
// Turns "25 g ragi, 15g moong dal, rice 20, milk powder 10g" into rows the calculator can add.
// Pure module: no React, no network.

import type { FoodItem } from "./food-catalog";

export type ParsedLine = {
  raw: string;
  name: string;
  /** grams (null when no quantity was written) */
  qty: number | null;
  unit: string | null;
  /** true when grams were estimated from a household measure (cup, tbsp, glass…) */
  approx: boolean;
};

export type ResolvedLine = ParsedLine & {
  /** resolved food, or null when nothing matched */
  food: FoodItem | null;
  /** how the match was made */
  via: "exact" | "alias" | "fuzzy" | null;
};

const WEIGHT_UNITS: Record<string, number> = {
  g: 1,
  gm: 1,
  gms: 1,
  gram: 1,
  grams: 1,
  kg: 1000,
  kgs: 1000,
  kilo: 1000,
  kilos: 1000,
  oz: 28.35,
  ounce: 28.35,
  ounces: 28.35,
  lb: 453.6,
};

/** Household measures, converted to millilitres first. */
const VOLUME_UNITS: Record<string, number> = {
  ml: 1,
  mls: 1,
  millilitre: 1,
  millilitres: 1,
  l: 1000,
  ltr: 1000,
  litre: 1000,
  litres: 1000,
  liter: 1000,
  cup: 240,
  cups: 240,
  katori: 150,
  glass: 200,
  glasses: 200,
  tbsp: 15,
  tablespoon: 15,
  tablespoons: 15,
  tsp: 5,
  teaspoon: 5,
  teaspoons: 5,
  pinch: 0.35,
  pinches: 0.35,
};

/** Rough bulk densities (g per ml) so household measures land in the right ballpark. */
const DENSITY: { match: string[]; gPerMl: number }[] = [
  { match: ["oil", "ghee", "butter"], gPerMl: 0.92 },
  { match: ["milk", "water", "juice", "curd", "yogurt", "dahi"], gPerMl: 1.03 },
  { match: ["honey", "syrup", "jaggery syrup"], gPerMl: 1.4 },
  { match: ["flour", "atta", "powder", "besan", "semolina", "suji", "rava"], gPerMl: 0.55 },
  {
    match: ["rice", "millet", "ragi", "bajra", "jowar", "wheat", "oats", "poha", "sago"],
    gPerMl: 0.8,
  },
  {
    match: ["dal", "gram", "lentil", "bean", "moong", "masoor", "toor", "chana", "urad"],
    gPerMl: 0.85,
  },
  { match: ["sugar", "salt", "jaggery"], gPerMl: 0.9 },
  { match: ["nut", "almond", "badam", "cashew", "kaju", "seed", "til", "peanut"], gPerMl: 0.6 },
];

function densityFor(name: string): number {
  const n = name.toLowerCase();
  for (const d of DENSITY) if (d.match.some((m) => n.includes(m))) return d.gPerMl;
  return 0.7; // generic dry mix
}

/** Words people type that carry no data. */
const NOISE = [
  "approx",
  "approximately",
  "about",
  "around",
  "roughly",
  "some",
  "fresh",
  "raw",
  "chopped",
  "finely",
  "boiled",
  "cooked",
  "soaked",
  "washed",
  "of",
  "a",
  "an",
  "the",
  "level",
  "heaped",
  "full",
];

const UNIT_RE = new RegExp(
  `^(${[...Object.keys(WEIGHT_UNITS), ...Object.keys(VOLUME_UNITS)].join("|")})$`,
  "i",
);

/** "1/2", "1 1/2", "½", "10-15" -> a single number. */
function parseNumber(token: string): number | null {
  const vulgar: Record<string, number> = { "½": 0.5, "¼": 0.25, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3 };
  let t = token.trim();
  for (const [glyph, val] of Object.entries(vulgar)) t = t.replace(glyph, `+${val}`);
  if (t.startsWith("+")) t = t.slice(1);
  // range "10-15" -> midpoint
  const range = t.match(/^(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)$/);
  if (range) return (Number(range[1]) + Number(range[2])) / 2;
  const frac = t.match(/^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/);
  if (frac && Number(frac[2]) !== 0) return Number(frac[1]) / Number(frac[2]);
  const sum = t.match(/^(\d+(?:\.\d+)?)\+(\d+(?:\.\d+)?)$/);
  if (sum) return Number(sum[1]) + Number(sum[2]);
  if (/^\d+(\.\d+)?$/.test(t)) return Number(t);
  return null;
}

/** Common formulator shorthand -> canonical master-data names (lowercase substrings). */
export const ALIASES: Record<string, string[]> = {
  ragi: ["finger millet"],
  nachni: ["finger millet"],
  mandua: ["finger millet"],
  bajra: ["pearl millet"],
  jowar: ["sorghum"],
  kodo: ["kodo millet"],
  moong: ["moong dal", "green gram"],
  "moong dal": ["moong dal"],
  "green gram": ["moong dal", "green gram"],
  masoor: ["masoor dal", "red lentil"],
  toor: ["toor dal", "pigeon pea"],
  arhar: ["toor dal"],
  chana: ["bengal gram", "chana dal", "chickpea"],
  urad: ["urad dal", "black gram"],
  rajma: ["kidney bean"],
  "milk powder": ["whole milk powder", "milk powder"],
  smp: ["skimmed milk powder"],
  wmp: ["whole milk powder"],
  curd: ["curd", "yogurt"],
  dahi: ["curd", "yogurt"],
  paneer: ["paneer"],
  ghee: ["ghee"],
  badam: ["almond"],
  almonds: ["almond"],
  kaju: ["cashew"],
  til: ["sesame"],
  peanut: ["groundnut", "peanut"],
  groundnut: ["groundnut", "peanut"],
  rice: ["rice, raw", "rice"],
  oats: ["oats"],
  wheat: ["wheat flour", "wheat"],
  atta: ["wheat flour"],
  suji: ["semolina"],
  rava: ["semolina"],
  sooji: ["semolina"],
  poha: ["flattened rice"],
  sabudana: ["sago"],
  makhana: ["fox nut"],
  jaggery: ["jaggery"],
  gur: ["jaggery"],
  banana: ["banana"],
  kela: ["banana"],
  apple: ["apple"],
  gajar: ["carrot"],
  carrot: ["carrot"],
  palak: ["spinach"],
  spinach: ["spinach"],
  aloo: ["potato"],
  potato: ["potato"],
  shakarkand: ["sweet potato"],
  "sweet potato": ["sweet potato"],
  kaddu: ["pumpkin"],
  pumpkin: ["pumpkin"],
  lauki: ["bottle gourd"],
  egg: ["egg, whole"],
  anda: ["egg, whole"],
  chicken: ["chicken"],
  fish: ["fish"],
  dates: ["dates"],
  khajur: ["dates"],
};

/** Split free text into parsed lines. */
export function parseIngredientText(text: string): ParsedLine[] {
  return text
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map(parseLine);
}

const NUMBERISH = /^[\d./½¼¾⅓⅔+-]+$/;

function parseLine(raw: string): ParsedLine {
  // strip bullets / numbering / trailing notes in brackets
  const cleaned = raw
    .replace(/^[-*•]+\s*/, "")
    .replace(/^\d+[.)]\s+/, "")
    .replace(/\((.*?)\)/g, " ")
    .trim();

  let tokens = cleaned.split(/\s+/).filter(Boolean);
  // "10-15" split across tokens -> rejoin
  tokens = tokens.reduce<string[]>((acc, t) => {
    const prev = acc[acc.length - 1];
    if ((t === "to" || t === "-") && prev && NUMBERISH.test(prev)) acc.push(t);
    else if (prev && (prev === "to" || prev === "-") && NUMBERISH.test(t)) {
      const start = acc[acc.length - 2] ?? "";
      acc.splice(acc.length - 2, 2, `${start}-${t}`);
    } else acc.push(t);
    return acc;
  }, []);

  let qty: number | null = null;
  let unit: string | null = null;
  let approx = false;
  const nameTokens: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]!;
    const lower = tok.toLowerCase();
    if (NOISE.includes(lower)) {
      if (lower.startsWith("approx") || ["about", "around", "roughly"].includes(lower))
        approx = true;
      continue;
    }
    // glued forms: "25g", "1/2cup"
    const glued = tok.match(/^([\d./½¼¾⅓⅔-]+)([a-zA-Z]+)$/);
    if (qty === null && glued && UNIT_RE.test(glued[2]!)) {
      const n = parseNumber(glued[1]!);
      if (n !== null) {
        qty = n;
        unit = glued[2]!.toLowerCase();
        continue;
      }
    }
    const n = parseNumber(tok);
    if (qty === null && n !== null) {
      qty = n;
      const nextTok = tokens[i + 1];
      // "1 1/2 cup"
      const mixed = nextTok ? parseNumber(nextTok) : null;
      if (mixed !== null && mixed < 1 && Number.isInteger(qty)) {
        qty += mixed;
        i++;
      }
      const unitTok = tokens[i + 1];
      if (unitTok && UNIT_RE.test(unitTok)) {
        unit = unitTok.toLowerCase();
        i++;
      }
      continue;
    }
    if (unit === null && UNIT_RE.test(lower) && qty !== null) {
      unit = lower;
      continue;
    }
    nameTokens.push(tok);
  }

  const name = nameTokens.join(" ").replace(/[()]/g, "").trim().toLowerCase();

  // convert to grams
  if (qty !== null && unit) {
    const u = unit.toLowerCase();
    if (WEIGHT_UNITS[u] !== undefined) qty = qty * WEIGHT_UNITS[u]!;
    else if (VOLUME_UNITS[u] !== undefined) {
      const ml = qty * VOLUME_UNITS[u]!;
      qty = ml * densityFor(name);
      // millilitres of a liquid are near enough exact; spoons and cups are estimates
      if (!["ml", "mls", "l", "ltr", "litre", "litres", "liter"].includes(u)) approx = true;
    }
  }
  if (qty !== null) qty = Math.round(qty * 10) / 10;

  return { raw, name, qty, unit, approx };
}

/** Resolve a parsed name against a food list (Master Data first). */
export function resolveName(
  name: string,
  foods: FoodItem[],
): { food: FoodItem | null; via: ResolvedLine["via"] } {
  const q = name.trim().toLowerCase();
  if (!q) return { food: null, via: null };
  const lower = foods.map((f) => ({ f, n: f.name.toLowerCase() }));

  const exact = lower.find((x) => x.n === q);
  if (exact) return { food: exact.f, via: "exact" };

  const aliasTargets = ALIASES[q] ?? Object.entries(ALIASES).find(([k]) => q.includes(k))?.[1];
  if (aliasTargets) {
    for (const t of aliasTargets) {
      const hit = lower.find((x) => x.n.includes(t));
      if (hit) return { food: hit.f, via: "alias" };
    }
  }

  const starts = lower.find((x) => x.n.startsWith(q));
  if (starts) return { food: starts.f, via: "fuzzy" };
  const contains = lower.find((x) => x.n.includes(q));
  if (contains) return { food: contains.f, via: "fuzzy" };
  // every word of the query appears in the name
  const words = q.split(/\s+/).filter((w) => w.length > 2);
  if (words.length > 0) {
    const all = lower.find((x) => words.every((w) => x.n.includes(w)));
    if (all) return { food: all.f, via: "fuzzy" };
  }
  return { food: null, via: null };
}

export function resolveLines(lines: ParsedLine[], foods: FoodItem[]): ResolvedLine[] {
  return lines.map((l) => ({ ...l, ...resolveName(l.name, foods) }));
}

/** Rank foods for autocomplete: alias hits and prefix matches first. */
export function rankFoods(query: string, foods: FoodItem[], limit = 30): FoodItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return foods.slice(0, limit);
  const aliasTargets = ALIASES[q] ?? [];
  const score = (f: FoodItem) => {
    const n = f.name.toLowerCase();
    if (n === q) return 0;
    if (aliasTargets.some((t) => n.includes(t))) return 1;
    if (n.startsWith(q)) return 2;
    if (n.includes(q)) return 3;
    const words = q.split(/\s+/).filter(Boolean);
    if (words.length > 1 && words.every((w) => n.includes(w))) return 4;
    return Infinity;
  };
  return foods
    .map((f) => ({ f, s: score(f) }))
    .filter((x) => x.s !== Infinity)
    .sort((a, b) => a.s - b.s || a.f.name.localeCompare(b.f.name))
    .slice(0, limit)
    .map((x) => x.f);
}
