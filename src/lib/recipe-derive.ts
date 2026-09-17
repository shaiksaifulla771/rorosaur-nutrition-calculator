// Shared derivation: saved recipe row -> live totals / flags / serving info against current RDA targets.
import {
  calculateRecipe,
  evaluateSafety,
  servingInfo,
  type RecipeIngredient,
  type RecipeTotals,
  type SafetyFlag,
  type ServingInfo,
} from "./nutrition/calc";
import type { AgeBand } from "./nutrition/reference";
import type { RdaOverrides } from "./rda";
import type { RecipeWithVersion } from "./recipes";
import type { ShareInput } from "./share";

export type DerivedRecipe = {
  ageBand: AgeBand;
  ingredients: RecipeIngredient[];
  totals: RecipeTotals;
  flags: SafetyFlag[];
  serving: ServingInfo;
};

export function deriveRecipe(r: RecipeWithVersion, rda?: RdaOverrides): DerivedRecipe {
  const ageBand = r.age_band as AgeBand;
  const ingredients = r.current?.ingredients ?? [];
  const totals =
    ingredients.length > 0
      ? calculateRecipe(ingredients, ageBand, { rda: rda?.[ageBand] ?? null })
      : (r.current?.totals ?? calculateRecipe(ingredients, ageBand));
  const flags = r.current?.safety_flags?.length
    ? r.current.safety_flags
    : evaluateSafety(ingredients, ageBand, totals);
  const serving = servingInfo(
    totals,
    {
      actualOutputG: r.current?.actual_output_g ?? null,
      servingSizeG: r.current?.serving_size_g ?? null,
    },
    ageBand,
  );
  return { ageBand, ingredients, totals, flags, serving };
}

export function toShareInput(r: RecipeWithVersion, d: DerivedRecipe): ShareInput {
  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}/recipes/${encodeURIComponent(r.id)}`
      : null;
  return {
    name: r.name,
    projectName: r.project?.name ?? null,
    ingredients: d.ingredients,
    totals: d.totals,
    serving: d.serving,
    url,
  };
}
