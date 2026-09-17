import { describe, expect, it } from "bun:test";

import { parseIngredientText } from "./parser";

describe("paste parser", () => {
  it("converts weights, household measures, fractions and ranges to grams", () => {
    const [ragi, ghee, badam, milk, rice, moong] = parseIngredientText(
      "1/2 cup ragi\n2 tbsp ghee\napprox 10-20 g badam\n250 ml milk\n1 kg rice\nmoong dal 15g",
    );

    expect(ragi!.name).toBe("ragi");
    expect(ragi!.approx).toBe(true);
    expect(ragi!.qty).toBeGreaterThan(80);

    expect(ghee!.name).toBe("ghee");
    expect(ghee!.qty).toBeCloseTo(27.6, 1);

    // range collapses to its midpoint, "approx" is stripped from the name
    expect(badam!.name).toBe("badam");
    expect(badam!.qty).toBe(15);
    expect(badam!.approx).toBe(true);

    expect(milk!.qty).toBeGreaterThan(250);
    expect(milk!.approx).toBe(false);

    expect(rice!.qty).toBe(1000);
    expect(moong!.qty).toBe(15);
    expect(moong!.name).toBe("moong dal");
  });

  it("ignores lines without a usable name", () => {
    expect(parseIngredientText("   \n,,\n")).toHaveLength(0);
  });
});
