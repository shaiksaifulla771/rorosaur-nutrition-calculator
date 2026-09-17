import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { withTimeout } from "@/lib/utils";
import { WORKSPACE_ID } from "./master";
import { AGE_BANDS, RDA, type AgeBand, type Nutrients } from "./nutrition/reference";

export type RdaOverrides = Partial<Record<AgeBand, Nutrients>>;

/**
 * Per-user RDA overrides. RLS restricts rows to the signed-in user, so this
 * only ever returns the caller's own values. Missing keys fall back to ICMR-NIN defaults.
 */
export async function listRdaOverrides(): Promise<RdaOverrides> {
  const { data, error } = await withTimeout(
    supabase.from("rda_settings").select("age_band, nutrients"),
    undefined,
    "Loading RDA settings",
  );
  if (error) throw error;
  const out: RdaOverrides = {};
  for (const row of data ?? []) {
    if (AGE_BANDS.some((b) => b.value === row.age_band)) {
      out[row.age_band as AgeBand] = (row.nutrients ?? {}) as Nutrients;
    }
  }
  return out;
}

export const rdaQuery = () =>
  queryOptions({ queryKey: ["rda"], queryFn: listRdaOverrides, staleTime: 60_000 });

async function currentUserId(): Promise<string> {
  return WORKSPACE_ID;
}

export async function saveRdaOverride(ageBand: AgeBand, rawNutrients: Nutrients) {
  if (!AGE_BANDS.some((b) => b.value === ageBand)) throw new Error("Unknown age band");
  const nutrients: Nutrients = {};
  for (const [k, v] of Object.entries(rawNutrients)) {
    if (v === undefined || v === null) continue;
    if (!(k in RDA[ageBand])) throw new Error(`Unknown nutrient "${k}"`);
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) throw new Error(`${k} must be a non-negative number`);
    nutrients[k as keyof Nutrients] = Math.round(n * 100) / 100;
  }
  const user_id = await currentUserId();
  const { error } = await supabase.from("rda_settings").upsert(
    {
      user_id,
      age_band: ageBand,
      nutrients: nutrients as unknown as never,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,age_band" },
  );
  if (error) throw error;
}

export async function resetRdaOverride(ageBand: AgeBand) {
  const user_id = await currentUserId();
  const { error } = await supabase
    .from("rda_settings")
    .delete()
    .eq("age_band", ageBand)
    .eq("user_id", user_id);
  if (error) throw error;
}

/** Default ICMR-NIN / WHO table for reference in the editor. */
export const DEFAULT_RDA = RDA;
