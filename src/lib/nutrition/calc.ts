import {
  ALLERGEN_KEYWORDS,
  RDA,
  SAFETY_RULES,
  SCORING_PATTERN,
  UPPER_LIMIT_RATIO,
  type AgeBand,
  type AminoAcidKey,
  type AminoAcids,
  type NutrientKey,
  type Nutrients,
  type SafetySeverity,
} from "./reference";

export type RecipeIngredient = {
  /** stable row key in the builder */
  key: string;
  foodId: string;
  name: string;
  grams: number;
  nutrients: Nutrients;
  amino: AminoAcids;
};

export type SafetyFlag = {
  id: string;
  severity: SafetySeverity;
  message: string;
  ingredient?: string;
};

export type AminoScore = {
  key: AminoAcidKey;
  mgPerG: number;
  requirement: number;
  ratio: number;
};

export type RecipeTotals = {
  nutrients: Record<NutrientKey, number>;
  totalGrams: number;
  aas: number;
  limitingAminoAcid: AminoAcidKey | null;
  aminoScores: AminoScore[];
  aminoPerGProtein: AminoAcids;
  rdaPercent: Partial<Record<NutrientKey, number>>;
  allergens: string[];
  /** the daily reference values actually used for %RDA (defaults or edited) */
  rdaUsed?: Nutrients;
};

/** Batch yield / portioning entered by the user. */
export type RecipeYield = {
  /** cooked / finished weight of the whole batch in grams */
  actualOutputG: number | null;
  /** grams per serving */
  servingSizeG: number | null;
};

export type ServingInfo = {
  dryBatchG: number;
  actualOutputG: number | null;
  yieldPercent: number | null;
  /** cooked ÷ dry, e.g. 1.6 */
  yieldFactor: number | null;
  /** cooked − dry in grams; positive = water gained, negative = water lost */
  moistureDeltaG: number | null;
  servingSizeG: number | null;
  servings: number | null;
  /** fraction of the whole batch in one serving (0–1) */
  servingFraction: number | null;
  perServing: Record<NutrientKey, number> | null;
  perServingRdaPercent: Partial<Record<NutrientKey, number>> | null;
  per100gCooked: Record<NutrientKey, number> | null;
};

export const NUTRIENT_KEYS: NutrientKey[] = [
  "kcal",
  "protein_g",
  "fat_g",
  "carb_g",
  "fiber_g",
  "sugar_g",
  "sodium_mg",
  "iron_mg",
  "calcium_mg",
  "zinc_mg",
  "vitc_mg",
  "vita_ug",
  "folate_ug",
  "vitd_ug",
  "vitb12_ug",
];

const AMINO_KEYS: AminoAcidKey[] = ["his", "ile", "leu", "lys", "saa", "aaa", "thr", "trp", "val"];

/** Coerce any input to a finite, non-negative number (NaN / Infinity / negatives → 0). */
export function safeNum(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Round to `digits` decimals with a finite guard. */
export function roundTo(v: number, digits = 1): number {
  if (!Number.isFinite(v)) return 0;
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

export function emptyAmino(): AminoAcids {
  return { his: 0, ile: 0, leu: 0, lys: 0, saa: 0, aaa: 0, thr: 0, trp: 0, val: 0 };
}

/** Merge default RDA for a band with user-edited overrides. */
export function resolveRda(ageBand: AgeBand, override?: Nutrients | null): Nutrients {
  const base = RDA[ageBand];
  if (!override) return base;
  const merged: Nutrients = { ...base };
  for (const key of NUTRIENT_KEYS) {
    const v = override[key];
    if (typeof v === "number" && !Number.isNaN(v) && v > 0) merged[key] = v;
  }
  return merged;
}

export function servingInfo(totals: RecipeTotals, y: RecipeYield, ageBand: AgeBand): ServingInfo {
  const dry = totals.totalGrams;
  const out = safeNum(y.actualOutputG) || null;
  const size = safeNum(y.servingSizeG) || null;
  const basis = out ?? (dry > 0 ? dry : null);
  const fraction = size && basis ? Math.min(size / basis, 1e6) : null;
  const rda = totals.rdaUsed ?? RDA[ageBand];
  let perServing: Record<NutrientKey, number> | null = null;
  let perServingRda: Partial<Record<NutrientKey, number>> | null = null;
  if (fraction !== null) {
    perServing = Object.fromEntries(
      NUTRIENT_KEYS.map((k) => [k, totals.nutrients[k] * fraction]),
    ) as Record<NutrientKey, number>;
    perServingRda = {};
    for (const k of NUTRIENT_KEYS) {
      const t = rda[k];
      if (t && t > 0) perServingRda[k] = roundTo((perServing[k] / t) * 100, 1);
    }
  }
  const per100gCooked = out
    ? (Object.fromEntries(
        NUTRIENT_KEYS.map((k) => [k, (totals.nutrients[k] / out) * 100]),
      ) as Record<NutrientKey, number>)
    : null;
  return {
    dryBatchG: dry,
    actualOutputG: out,
    yieldPercent: out && dry > 0 ? roundTo((out / dry) * 100, 1) : null,
    yieldFactor: out && dry > 0 ? roundTo(out / dry, 2) : null,
    moistureDeltaG: out && dry > 0 ? roundTo(out - dry, 1) : null,
    servingSizeG: size,
    servings: size && basis ? roundTo(basis / size, 1) : null,
    servingFraction: fraction,
    perServing,
    perServingRdaPercent: perServingRda,
    per100gCooked,
  };
}

export function calculateRecipe(
  ingredients: RecipeIngredient[],
  ageBand: AgeBand,
  opts?: { rda?: Nutrients | null },
): RecipeTotals {
  const nutrients = Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, 0])) as Record<
    NutrientKey,
    number
  >;
  const aminoMg = emptyAmino();
  let totalGrams = 0;

  for (const ing of ingredients) {
    const grams = safeNum(ing.grams);
    const factor = grams / 100;
    totalGrams += grams;
    for (const key of NUTRIENT_KEYS) {
      nutrients[key] += safeNum(ing.nutrients?.[key]) * factor;
    }
    const proteinG = safeNum(ing.nutrients?.protein_g) * factor;
    for (const key of AMINO_KEYS) {
      aminoMg[key] += safeNum(ing.amino?.[key]) * proteinG;
    }
  }

  const protein = nutrients.protein_g;
  const aminoPerGProtein = emptyAmino();
  if (protein > 0) {
    for (const key of AMINO_KEYS) aminoPerGProtein[key] = aminoMg[key] / protein;
  }

  const pattern = SCORING_PATTERN[ageBand];
  const aminoScores: AminoScore[] = AMINO_KEYS.map((key) => ({
    key,
    mgPerG: aminoPerGProtein[key],
    requirement: pattern[key],
    ratio: pattern[key] > 0 ? roundTo(aminoPerGProtein[key] / pattern[key], 4) : 0,
  }));

  let aas = 0;
  let limiting: AminoAcidKey | null = null;
  if (protein > 0) {
    const lowest = aminoScores.reduce((min, s) => (s.ratio < min.ratio ? s : min), aminoScores[0]!);
    aas = roundTo(lowest.ratio * 100, 1);
    // PRD rule: no limiting amino acid once the score reaches 1.00
    limiting = aas >= 100 ? null : lowest.key;
  }

  const rda = resolveRda(ageBand, opts?.rda);
  const rdaPercent: Partial<Record<NutrientKey, number>> = {};
  for (const key of NUTRIENT_KEYS) {
    const target = rda[key];
    if (target && target > 0) rdaPercent[key] = roundTo((nutrients[key] / target) * 100, 1);
  }

  const names = ingredients.map((i) => i.name.toLowerCase());
  const allergens = Object.entries(ALLERGEN_KEYWORDS)
    .filter(([, words]) => names.some((n) => words.some((w) => n.includes(w))))
    .map(([label]) => label);

  return {
    nutrients,
    totalGrams,
    aas,
    limitingAminoAcid: limiting,
    aminoScores,
    aminoPerGProtein,
    rdaPercent,
    allergens,
    rdaUsed: rda,
  };
}

export function evaluateSafety(
  ingredients: RecipeIngredient[],
  ageBand: AgeBand,
  totals: RecipeTotals,
): SafetyFlag[] {
  const flags: SafetyFlag[] = [];

  for (const rule of SAFETY_RULES) {
    if (!rule.bands.includes(ageBand)) continue;
    if (rule.match.length === 0) {
      if (ingredients.length > 0) {
        flags.push({ id: rule.id, severity: rule.severity, message: rule.message });
      }
      continue;
    }
    const hit = ingredients.find((i) => rule.match.some((m) => i.name.toLowerCase().includes(m)));
    if (hit) {
      flags.push({
        id: rule.id,
        severity: rule.severity,
        message: rule.message,
        ingredient: hit.name,
      });
    }
  }

  const rda = totals.rdaUsed ?? RDA[ageBand];
  for (const [key, ratio] of Object.entries(UPPER_LIMIT_RATIO) as [NutrientKey, number][]) {
    const target = rda[key];
    if (!target) continue;
    if (totals.nutrients[key] > target * ratio) {
      flags.push({
        id: `excess-${key}`,
        severity: key === "sodium_mg" ? "blocking" : "advisory",
        message: `${key.replace(/_/g, " ")} in this recipe exceeds the daily reference for ${ageBand} (${Math.round(
          totals.nutrients[key],
        )} vs ${target}).`,
      });
    }
  }

  if (totals.allergens.length > 0) {
    flags.push({
      id: "allergens",
      severity: "advisory",
      message: `Contains common allergens: ${totals.allergens.join(", ")}. Introduce one new allergen at a time.`,
    });
  }

  return flags;
}

export function fmt(value: number | undefined | null, digits = 1): string {
  if (value === undefined || value === null || !Number.isFinite(value)) return "–";
  return value.toLocaleString(undefined, { maximumFractionDigits: digits });
}

/** Table-cell formatter: accepts any raw value, renders "–" for missing / non-finite numbers. */
export function fmtCell(value: unknown, digits = 2): string {
  if (value === undefined || value === null || value === "") return "–";
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "–";
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}
