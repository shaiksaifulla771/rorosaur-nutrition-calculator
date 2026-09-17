import { describe, expect, it } from "bun:test";

import { calculateRecipe, emptyAmino, servingInfo, type RecipeIngredient } from "./calc";
import { parseIngredientText, resolveLines } from "./parser";
import type { FoodItem } from "./food-catalog";

const ragi: FoodItem = {
  id: "m1",
  name: "Finger millet (ragi)",
  nutrients: { kcal: 320, protein_g: 7.2, fat_g: 1.9, calcium_mg: 364, iron_mg: 4.6, zinc_mg: 2.5 },
  amino: { his: 21, ile: 41, leu: 120, lys: 29, saa: 40, aaa: 90, thr: 38, trp: 14, val: 63 },
  category: "Millets",
};
const moong: FoodItem = {
  id: "m2",
  name: "Moong dal (green gram, dehusked)",
  nutrients: { kcal: 334, protein_g: 24.5, fat_g: 1.2, calcium_mg: 80, iron_mg: 4.4, zinc_mg: 2.9 },
  amino: { his: 28, ile: 42, leu: 78, lys: 70, saa: 22, aaa: 85, thr: 33, trp: 10, val: 52 },
  category: "Pulses",
};
const rice: FoodItem = {
  id: "m3",
  name: "Rice, raw, milled",
  nutrients: { kcal: 356, protein_g: 7.9 },
  amino: { his: 24, ile: 40, leu: 82, lys: 36, saa: 38, aaa: 90, thr: 35, trp: 12, val: 58 },
};
const milk: FoodItem = {
  id: "m4",
  name: "Whole milk powder",
  nutrients: { kcal: 496, protein_g: 25.8, calcium_mg: 912, vitb12_ug: 3.2 },
  amino: { his: 27, ile: 55, leu: 98, lys: 79, saa: 33, aaa: 100, thr: 45, trp: 14, val: 66 },
};
const almond: FoodItem = {
  id: "m5",
  name: "Almond",
  nutrients: { kcal: 609, protein_g: 18.4 },
  amino: { his: 26, ile: 37, leu: 70, lys: 29, saa: 25, aaa: 85, thr: 30, trp: 11, val: 42 },
};

const row = (f: FoodItem, grams: number): RecipeIngredient => ({
  key: f.id,
  foodId: f.id,
  name: f.name,
  grams,
  nutrients: f.nutrients,
  amino: f.amino,
});

describe("moisture & yield (PRD §3.1)", () => {
  it("75 g dry -> 120 g cooked -> 1.6x, +45 g water, 1 serving of 120 g", () => {
    const totals = calculateRecipe(
      [row(ragi, 25), row(moong, 15), row(rice, 20), row(milk, 10), row(almond, 5)],
      "1-3y",
    );
    expect(totals.totalGrams).toBe(75);
    const s = servingInfo(totals, { actualOutputG: 120, servingSizeG: 120 }, "1-3y");
    expect(s.yieldFactor).toBe(1.6);
    expect(s.moistureDeltaG).toBe(45);
    expect(s.servings).toBe(1);
    expect(s.perServing!.kcal).toBeCloseTo(totals.nutrients.kcal, 6);
    expect(s.per100gCooked!.kcal).toBeCloseTo((totals.nutrients.kcal / 120) * 100, 6);
  });
  it("reports water lost when cooked weight is below dry weight", () => {
    const totals = calculateRecipe([row(ragi, 100)], "1-3y");
    const s = servingInfo(totals, { actualOutputG: 88, servingSizeG: 44 }, "1-3y");
    expect(s.moistureDeltaG).toBe(-12);
    expect(s.servings).toBe(2);
  });
});

describe("WHO 2007 amino-acid score (PRD §3.2)", () => {
  it("default blend scores >= 1.00 with no limiting AA", () => {
    const t = calculateRecipe(
      [row(ragi, 25), row(moong, 15), row(rice, 20), row(milk, 10), row(almond, 5)],
      "1-3y",
    );
    expect(t.aas).toBeGreaterThanOrEqual(100);
    expect(t.limitingAminoAcid).toBeNull();
  });
  it("cereal-only blend is lysine-limited below 1.00", () => {
    const t = calculateRecipe([row(ragi, 25), row(rice, 20)], "1-3y");
    expect(t.aas).toBeLessThan(100);
    expect(t.limitingAminoAcid).toBe("lys");
  });
  it("%RDA uses ICMR-NIN 1–3y targets", () => {
    const t = calculateRecipe([row(milk, 100)], "1-3y");
    expect(t.rdaUsed?.calcium_mg).toBe(500);
    expect(t.rdaPercent.calcium_mg).toBeCloseTo((912 / 500) * 100, 0);
    expect(t.rdaPercent.vitb12_ug).toBeCloseTo((3.2 / 1.2) * 100, 0);
  });
  it("empty amino profile yields a zero score", () => {
    const t = calculateRecipe([{ ...row(rice, 50), amino: emptyAmino() }], "1-3y");
    expect(t.aas).toBe(0);
  });
});

describe("ingredient parser (plan §2.3)", () => {
  const foods = [ragi, moong, rice, milk, almond];
  it("parses quantities in every common position", () => {
    const lines = parseIngredientText(
      "25 g ragi, 15g moong dal\nrice 20; milk powder 10g, badam 5 gm, 0.5 kg rice",
    );
    expect(lines.map((l) => [l.name, l.qty])).toEqual([
      ["ragi", 25],
      ["moong dal", 15],
      ["rice", 20],
      ["milk powder", 10],
      ["badam", 5],
      ["rice", 500],
    ]);
  });
  it("resolves aliases and fuzzy names against master data", () => {
    const r = resolveLines(
      parseIngredientText("25 g ragi, 15g moong dal, badam 5g, unicorn dust 3g"),
      foods,
    );
    expect(r[0]!.food?.name).toBe(ragi.name);
    expect(r[0]!.via).toBe("alias");
    expect(r[1]!.food?.name).toBe(moong.name);
    expect(r[2]!.food?.name).toBe("Almond");
    expect(r[3]!.food).toBeNull();
  });
});

describe("robustness guards", () => {
  it("zero dry weight yields no NaN and null yield metrics", () => {
    const totals = calculateRecipe([row(ragi, 0)], "1-3y");
    expect(totals.totalGrams).toBe(0);
    expect(totals.aas).toBe(0);
    expect(Object.values(totals.nutrients).every((v) => Number.isFinite(v))).toBe(true);
    const s = servingInfo(totals, { actualOutputG: 100, servingSizeG: 50 }, "1-3y");
    expect(s.yieldFactor).toBeNull();
    expect(s.moistureDeltaG).toBeNull();
  });

  it("ingredient with empty nutrients / NaN grams contributes nothing", () => {
    const blank: FoodItem = { id: "x", name: "Blank", nutrients: {}, amino: emptyAmino() };
    const totals = calculateRecipe([row(blank, Number.NaN), row(ragi, 100)], "1-3y");
    expect(totals.totalGrams).toBe(100);
    expect(totals.nutrients.kcal).toBe(320);
    expect(Object.values(totals.rdaPercent).every((v) => Number.isFinite(v as number))).toBe(true);
  });

  it("uses user-overridden RDA and ignores invalid override values", () => {
    const base = calculateRecipe([row(ragi, 100)], "1-3y");
    const over = calculateRecipe([row(ragi, 100)], "1-3y", {
      rda: { iron_mg: 9.2, calcium_mg: Number.NaN, kcal: -5 },
    });
    expect(over.rdaPercent.iron_mg).toBe(Math.round((4.6 / 9.2) * 1000) / 10);
    expect(over.rdaPercent.calcium_mg).toBe(base.rdaPercent.calcium_mg);
    expect(over.rdaPercent.kcal).toBe(base.rdaPercent.kcal);
  });

  it("missing RDA target leaves that nutrient out of %RDA instead of Infinity", () => {
    const totals = calculateRecipe([row(ragi, 100)], "1-3y", { rda: null });
    for (const v of Object.values(totals.rdaPercent))
      expect(Number.isFinite(v as number)).toBe(true);
  });
});
