// Reference data for infant nutrition scoring.
// Sources: WHO/FAO/UNU amino-acid scoring patterns; IOM / EFSA infant reference intakes.
// Client-safe: pure data + types, no server imports.

export type AgeBand = "0-6m" | "6-12m" | "12-24m" | "1-3y";

export const AGE_BANDS: { value: AgeBand; label: string }[] = [
  { value: "0-6m", label: "0–6 months" },
  { value: "6-12m", label: "6–12 months" },
  { value: "12-24m", label: "12–24 months" },
  { value: "1-3y", label: "1–3 years (ICMR-NIN)" },
];

export type NutrientKey =
  | "kcal"
  | "protein_g"
  | "fat_g"
  | "carb_g"
  | "fiber_g"
  | "sugar_g"
  | "sodium_mg"
  | "iron_mg"
  | "calcium_mg"
  | "zinc_mg"
  | "vitc_mg"
  | "vita_ug"
  | "folate_ug"
  | "vitd_ug"
  | "vitb12_ug";

export const NUTRIENT_LABELS: Record<NutrientKey, string> = {
  kcal: "Energy (kcal)",
  protein_g: "Protein (g)",
  fat_g: "Fat (g)",
  carb_g: "Carbohydrate (g)",
  fiber_g: "Fibre (g)",
  sugar_g: "Sugars (g)",
  sodium_mg: "Sodium (mg)",
  iron_mg: "Iron (mg)",
  calcium_mg: "Calcium (mg)",
  zinc_mg: "Zinc (mg)",
  vitc_mg: "Vitamin C (mg)",
  vita_ug: "Vitamin A (µg RAE)",
  folate_ug: "Folate (µg)",
  vitd_ug: "Vitamin D (µg)",
  vitb12_ug: "Vitamin B12 (µg)",
};

export type Nutrients = Partial<Record<NutrientKey, number>>;

/** Indispensable amino acids, mg per gram of protein. */
export type AminoAcidKey = "his" | "ile" | "leu" | "lys" | "saa" | "aaa" | "thr" | "trp" | "val";

export const AMINO_LABELS: Record<AminoAcidKey, string> = {
  his: "Histidine",
  ile: "Isoleucine",
  leu: "Leucine",
  lys: "Lysine",
  saa: "Met + Cys (SAA)",
  aaa: "Phe + Tyr (AAA)",
  thr: "Threonine",
  trp: "Tryptophan",
  val: "Valine",
};

export type AminoAcids = Record<AminoAcidKey, number>;

/** WHO/FAO/UNU 2007 scoring patterns, mg amino acid per g protein. */
export const SCORING_PATTERN: Record<AgeBand, AminoAcids> = {
  "0-6m": { his: 21, ile: 55, leu: 96, lys: 69, saa: 33, aaa: 94, thr: 44, trp: 17, val: 55 },
  "6-12m": { his: 20, ile: 32, leu: 66, lys: 57, saa: 27, aaa: 52, thr: 31, trp: 8.5, val: 43 },
  "12-24m": { his: 20, ile: 32, leu: 66, lys: 57, saa: 27, aaa: 52, thr: 31, trp: 8.5, val: 43 },
  // WHO/FAO/UNU 2007 pattern for children 1–3 years (PRD §3.2)
  "1-3y": { his: 18, ile: 31, leu: 63, lys: 52, saa: 26, aaa: 46, thr: 27, trp: 7.4, val: 42 },
};

/** Daily reference intakes per age band. */
export const RDA: Record<AgeBand, Nutrients> = {
  "0-6m": {
    kcal: 550,
    protein_g: 9.1,
    fat_g: 31,
    carb_g: 60,
    iron_mg: 0.27,
    calcium_mg: 200,
    zinc_mg: 2,
    vitc_mg: 40,
    vita_ug: 400,
    folate_ug: 65,
    vitd_ug: 10,
    vitb12_ug: 0.4,
    sodium_mg: 120,
  },
  "6-12m": {
    kcal: 700,
    protein_g: 11,
    fat_g: 30,
    carb_g: 95,
    fiber_g: 5,
    iron_mg: 11,
    calcium_mg: 260,
    zinc_mg: 3,
    vitc_mg: 50,
    vita_ug: 500,
    folate_ug: 80,
    vitd_ug: 10,
    vitb12_ug: 0.5,
    sodium_mg: 370,
  },
  "12-24m": {
    kcal: 1000,
    protein_g: 13,
    fat_g: 35,
    carb_g: 130,
    fiber_g: 14,
    iron_mg: 7,
    calcium_mg: 700,
    zinc_mg: 3,
    vitc_mg: 15,
    vita_ug: 300,
    folate_ug: 150,
    vitd_ug: 15,
    vitb12_ug: 0.9,
    sodium_mg: 800,
  },
  // ICMR-NIN 2020 RDA for 1–3 years (PRD §3.3)
  "1-3y": {
    kcal: 1010,
    protein_g: 12.5,
    fat_g: 27,
    carb_g: 130,
    fiber_g: 15,
    calcium_mg: 500,
    iron_mg: 8,
    zinc_mg: 3.3,
    vita_ug: 390,
    vitc_mg: 30,
    vitd_ug: 15,
    folate_ug: 80,
    vitb12_ug: 1.2,
    sodium_mg: 800,
  },
};

/** Upper limits that trigger an "excess" advisory when a single recipe exceeds them. */
export const UPPER_LIMIT_RATIO: Partial<Record<NutrientKey, number>> = {
  sodium_mg: 1,
  vita_ug: 2.5,
  vitd_ug: 2.5,
  zinc_mg: 1.6,
  iron_mg: 3.6,
};

export type SafetySeverity = "blocking" | "advisory";

export type SafetyRule = {
  id: string;
  /** lowercase keywords matched against ingredient names */
  match: string[];
  bands: AgeBand[];
  severity: SafetySeverity;
  message: string;
};

export const SAFETY_RULES: SafetyRule[] = [
  {
    id: "honey",
    match: ["honey"],
    bands: ["0-6m", "6-12m"],
    severity: "blocking",
    message: "Honey must not be given under 12 months — risk of infant botulism.",
  },
  {
    id: "whole-nuts",
    match: ["whole nut", "peanut, whole", "almond, whole", "walnut half"],
    bands: ["0-6m", "6-12m", "12-24m", "1-3y"],
    severity: "blocking",
    message:
      "Whole nuts are a choking hazard under 3 years — use smooth nut butter or ground nuts.",
  },
  {
    id: "whole-grapes",
    match: ["grape"],
    bands: ["6-12m", "12-24m", "1-3y"],
    severity: "advisory",
    message: "Grapes must be quartered lengthways — whole grapes are a choking hazard.",
  },
  {
    id: "added-salt",
    match: ["salt", "stock cube", "bouillon", "soy sauce"],
    bands: ["0-6m", "6-12m", "12-24m", "1-3y"],
    severity: "blocking",
    message: "Do not add salt — infant kidneys cannot handle the sodium load.",
  },
  {
    id: "added-sugar",
    match: ["sugar", "syrup", "molasses"],
    bands: ["0-6m", "6-12m", "12-24m", "1-3y"],
    severity: "advisory",
    message: "Added sugars are not recommended before 24 months.",
  },
  {
    id: "cows-milk-drink",
    match: ["cow milk", "cow's milk", "whole milk"],
    bands: ["0-6m", "6-12m"],
    severity: "advisory",
    message:
      "Cow's milk as a main drink is not suitable under 12 months; small amounts in cooking are fine.",
  },
  {
    id: "raw-egg",
    match: ["raw egg", "egg, raw"],
    bands: ["0-6m", "6-12m", "12-24m", "1-3y"],
    severity: "blocking",
    message: "Eggs must be cooked until firm unless certified salmonella-controlled.",
  },
  {
    id: "high-mercury-fish",
    match: ["swordfish", "shark", "marlin", "king mackerel", "tuna, bigeye"],
    bands: ["0-6m", "6-12m", "12-24m", "1-3y"],
    severity: "blocking",
    message: "High-mercury fish should be avoided in infant and toddler diets.",
  },
  {
    id: "solids-under-6m",
    match: [],
    bands: ["0-6m"],
    severity: "advisory",
    message: "Complementary foods are not recommended before around 6 months of age.",
  },
  {
    id: "unpasteurised",
    match: ["unpasteurized", "unpasteurised", "raw milk"],
    bands: ["0-6m", "6-12m", "12-24m", "1-3y"],
    severity: "blocking",
    message: "Unpasteurised dairy carries a listeria risk for infants.",
  },
];

export const ALLERGEN_KEYWORDS: Record<string, string[]> = {
  Peanut: ["peanut"],
  "Tree nut": ["almond", "cashew", "walnut", "hazelnut", "pistachio", "pecan"],
  Egg: ["egg"],
  "Cow's milk": ["milk", "yogurt", "yoghurt", "cheese", "butter"],
  Wheat: ["wheat", "flour", "bread", "pasta", "semolina"],
  Soy: ["soy", "tofu", "edamame"],
  Fish: ["salmon", "cod", "tuna", "haddock", "sardine"],
  Shellfish: ["shrimp", "prawn", "crab", "lobster"],
  Sesame: ["sesame", "tahini"],
};
