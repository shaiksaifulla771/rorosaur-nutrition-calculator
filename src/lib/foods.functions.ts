import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { searchCatalog, type FoodItem } from "./nutrition/food-catalog";
import { emptyAmino } from "./nutrition/calc";
import type { AminoAcids, NutrientKey, Nutrients } from "./nutrition/reference";

const NUTRIENT_IDS: Record<number, NutrientKey> = {
  1008: "kcal",
  1003: "protein_g",
  1004: "fat_g",
  1005: "carb_g",
  1079: "fiber_g",
  2000: "sugar_g",
  1093: "sodium_mg",
  1089: "iron_mg",
  1087: "calcium_mg",
  1095: "zinc_mg",
  1162: "vitc_mg",
  1106: "vita_ug",
  1177: "folate_ug",
  1114: "vitd_ug",
};

// mg per 100 g of food; converted to mg per g protein after parsing.
const AMINO_IDS: Record<number, keyof AminoAcids | "met" | "cys" | "phe" | "tyr"> = {
  1221: "his",
  1212: "ile",
  1213: "leu",
  1214: "lys",
  1215: "met",
  1216: "cys",
  1217: "phe",
  1218: "tyr",
  1211: "thr",
  1210: "trp",
  1219: "val",
};

type UsdaNutrient = {
  nutrientId?: number;
  value?: number;
  nutrient?: { id?: number };
  amount?: number;
};
type UsdaFood = { fdcId: number; description: string; foodNutrients?: UsdaNutrient[] };

function mapUsdaFood(food: UsdaFood): FoodItem {
  const nutrients: Nutrients = {};
  const raw: Record<string, number> = {};

  for (const n of food.foodNutrients ?? []) {
    const id = n.nutrientId ?? n.nutrient?.id;
    const value = n.value ?? n.amount;
    if (!id || value === undefined) continue;
    const key = NUTRIENT_IDS[id];
    if (key) nutrients[key] = value;
    const amino = AMINO_IDS[id];
    if (amino) raw[amino] = value * 1000; // g/100g -> mg/100g
  }

  const protein = nutrients.protein_g ?? 0;
  const amino = emptyAmino();
  if (protein > 0) {
    amino.his = (raw["his"] ?? 0) / protein;
    amino.ile = (raw["ile"] ?? 0) / protein;
    amino.leu = (raw["leu"] ?? 0) / protein;
    amino.lys = (raw["lys"] ?? 0) / protein;
    amino.saa = ((raw["met"] ?? 0) + (raw["cys"] ?? 0)) / protein;
    amino.aaa = ((raw["phe"] ?? 0) + (raw["tyr"] ?? 0)) / protein;
    amino.thr = (raw["thr"] ?? 0) / protein;
    amino.trp = (raw["trp"] ?? 0) / protein;
    amino.val = (raw["val"] ?? 0) / protein;
  }

  return {
    id: `usda:${food.fdcId}`,
    name: food.description,
    nutrients,
    amino,
  };
}

/** Search foods. Uses USDA FoodData Central when a key is configured, otherwise the built-in catalog. */
const SearchInput = z.object({
  // Strip control characters and cap length so upstream calls stay small and predictable.
  query: z
    .string()
    .max(80)
    // eslint-disable-next-line no-control-regex
    .transform((q) => q.replace(/[\u0000-\u001f\u007f]/g, "").trim()),
});

const MAX_RESULTS = 25;
const UPSTREAM_TIMEOUT_MS = 8_000;

// Lightweight in-memory rate limit per server instance: protects the USDA quota and
// prevents a single client from hammering the endpoint. Best-effort on stateless workers.
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 60_000;
const buckets = new Map<string, { count: number; resetAt: number }>();
function checkRateLimit(key: string) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    if (buckets.size > 5_000) buckets.clear();
    return;
  }
  b.count += 1;
  if (b.count > RATE_LIMIT_MAX) {
    throw new Error("Too many searches — please wait a moment and try again.");
  }
}

export const searchFoods = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    if (typeof input !== "object" || input === null) throw new Error("Invalid search request");
    if (typeof (input as { query?: unknown }).query !== "string")
      throw new Error("Search query must be text");
    return SearchInput.parse(input);
  })
  .handler(async ({ data }): Promise<{ source: "usda" | "catalog"; items: FoodItem[] }> => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const req = getRequest();
    const ip =
      req.headers.get("cf-connecting-ip") ??
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "anonymous";
    checkRateLimit(ip);
    const apiKey = process.env["FDC_API_KEY"];
    const local = searchCatalog(data.query).slice(0, MAX_RESULTS);

    if (!apiKey || data.query.length < 2) {
      return { source: "catalog", items: local };
    }

    try {
      const res = await fetch("https://api.nal.usda.gov/fdc/v1/foods/search", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Api-Key": apiKey },
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
        body: JSON.stringify({
          query: data.query,
          pageSize: 20,
          dataType: ["Foundation", "SR Legacy"],
        }),
      });
      if (!res.ok) throw new Error(`USDA ${res.status}`);
      const json = (await res.json()) as { foods?: UsdaFood[] };
      const items = (json.foods ?? []).map(mapUsdaFood).filter((f) => (f.nutrients.kcal ?? 0) >= 0);
      if (items.length === 0) return { source: "catalog", items: local };
      return { source: "usda", items: [...local.slice(0, 5), ...items].slice(0, MAX_RESULTS) };
    } catch (error) {
      console.error(
        "[foods.search] upstream failure",
        error instanceof Error ? error.message : error,
      );
      return { source: "catalog", items: local };
    }
  });
