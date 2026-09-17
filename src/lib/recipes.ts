import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { withTimeout } from "@/lib/utils";
import { getOrCreateDefaultProject } from "@/lib/projects";
import type { RecipeIngredient, RecipeTotals, SafetyFlag } from "./nutrition/calc";
import type { AgeBand } from "./nutrition/reference";

export type RecipeRow = {
  id: string;
  name: string;
  age_band: AgeBand;
  project_id: string | null;
  current_version_id: string | null;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
};

export type VersionRow = {
  id: string;
  recipe_id: string;
  version_number: number;
  ingredients: RecipeIngredient[];
  totals: RecipeTotals | null;
  aas_score: number | null;
  total_calories: number | null;
  safety_flags: SafetyFlag[];
  prep_notes: string | null;
  actual_output_g: number | null;
  serving_size_g: number | null;
  description: string | null;
  water_content_g: number | null;
  yield_pct: number | null;
  cooking_loss_pct: number | null;
  /** human-readable list of what changed vs the previous version */
  changes: string[];
  created_at: string;
};

export type RecipeWithVersion = RecipeRow & {
  current: VersionRow | null;
  project: { id: string; name: string } | null;
};

function asVersion(row: unknown): VersionRow | null {
  if (!row) return null;
  const v = row as VersionRow;
  return {
    ...v,
    ingredients: (v.ingredients ?? []) as RecipeIngredient[],
    changes: (v.changes ?? []) as string[],
    safety_flags: (v.safety_flags ?? []) as SafetyFlag[],
  };
}

const RECIPE_SELECT = "*, recipe_versions!recipes_current_version_fk(*), projects(id, name)";

function asRecipe(row: unknown): RecipeWithVersion {
  const { recipe_versions, projects, ...recipe } = row as Record<string, unknown> & {
    recipe_versions: unknown;
    projects: { id: string; name: string } | null;
  };
  return {
    ...(recipe as RecipeRow),
    is_pinned: Boolean((recipe as RecipeRow).is_pinned),
    current: asVersion(recipe_versions),
    project: projects ?? null,
  };
}

export async function listRecipes(projectId?: string): Promise<RecipeWithVersion[]> {
  let q = supabase.from("recipes").select(RECIPE_SELECT).order("updated_at", { ascending: false });
  if (projectId) q = q.eq("project_id", projectId);
  const { data, error } = await withTimeout(q, undefined, "Loading recipes");
  if (error) throw error;
  return (data ?? []).map(asRecipe);
}

export async function getRecipe(id: string): Promise<RecipeWithVersion | null> {
  const { data, error } = await supabase
    .from("recipes")
    .select(RECIPE_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return asRecipe(data);
}

export async function listVersions(recipeId: string): Promise<VersionRow[]> {
  const { data, error } = await supabase
    .from("recipe_versions")
    .select("*")
    .eq("recipe_id", recipeId)
    .order("version_number", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => asVersion(r)!).filter(Boolean);
}

/** Recipe + every version in ONE round-trip, so opening a recipe is a single request. */
export type RecipeFull = RecipeWithVersion & { versions: VersionRow[] };

export async function getRecipeFull(id: string): Promise<RecipeFull | null> {
  const { data, error } = await supabase
    .from("recipes")
    .select(
      "*, current:recipe_versions!recipes_current_version_fk(*), versions:recipe_versions!recipe_versions_recipe_id_fkey(*), projects(id, name)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { current, versions, projects, ...recipe } = data as Record<string, unknown> & {
    current: unknown;
    versions: unknown[];
    projects: { id: string; name: string } | null;
  };
  const list = (versions ?? [])
    .map((v) => asVersion(v)!)
    .filter(Boolean)
    .sort((a, b) => b.version_number - a.version_number);
  return {
    ...(recipe as RecipeRow),
    is_pinned: Boolean((recipe as RecipeRow).is_pinned),
    current: asVersion(current) ?? list[0] ?? null,
    project: projects ?? null,
    versions: list,
  };
}

export const recipesQuery = (projectId?: string) =>
  queryOptions({
    queryKey: ["recipes", projectId ?? "all"],
    queryFn: () => listRecipes(projectId),
  });
export const recipeQuery = (id: string) =>
  queryOptions({ queryKey: ["recipe", id], queryFn: () => getRecipe(id), enabled: Boolean(id) });
export const recipeFullQuery = (id: string) =>
  queryOptions({
    queryKey: ["recipe-full", id],
    queryFn: () => getRecipeFull(id),
    enabled: Boolean(id),
    staleTime: 30_000,
  });
export const versionsQuery = (id: string) =>
  queryOptions({
    queryKey: ["versions", id],
    queryFn: () => listVersions(id),
    enabled: Boolean(id),
  });

type SavePayload = {
  recipeId?: string;
  name: string;
  ageBand: AgeBand;
  projectId: string | null;
  ingredients: RecipeIngredient[];
  totals: RecipeTotals;
  safetyFlags: SafetyFlag[];
  prepNotes: string;
  actualOutputG?: number | null;
  servingSizeG?: number | null;
  description?: string | null;
  isPinned?: boolean;
  /**
   * "update" writes to the existing recipe and always appends a new version.
   * "copy" forks the draft into a brand-new recipe with its own v1 history.
   */
  mode?: "update" | "copy";
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Plain-language list of what this save changed compared with the previous version. */
function diffVersion(
  prev: VersionRow,
  next: {
    ingredients: RecipeIngredient[];
    actualOutputG?: number | null;
    servingSizeG?: number | null;
    prepNotes: string;
  },
): string[] {
  const out: string[] = [];
  const prevRows = new Map((prev.ingredients ?? []).map((i) => [i.name, i.grams]));
  const nextRows = new Map(next.ingredients.map((i) => [i.name, i.grams]));
  for (const [name, grams] of nextRows) {
    const before = prevRows.get(name);
    if (before === undefined) out.push(`Added ${name} (${grams} g)`);
    else if (before !== grams) out.push(`${name}: ${before} g -> ${grams} g`);
  }
  for (const name of prevRows.keys()) if (!nextRows.has(name)) out.push(`Removed ${name}`);
  if ((prev.actual_output_g ?? null) !== (next.actualOutputG ?? null))
    out.push(`Cooked weight: ${prev.actual_output_g ?? "—"} -> ${next.actualOutputG ?? "—"} g`);
  if ((prev.serving_size_g ?? null) !== (next.servingSizeG ?? null))
    out.push(`Serving size: ${prev.serving_size_g ?? "—"} -> ${next.servingSizeG ?? "—"} g`);
  if ((prev.prep_notes ?? "") !== (next.prepNotes ?? "")) out.push("Prep notes updated");
  return out;
}

export async function saveRecipe(
  payload: SavePayload,
): Promise<{ recipeId: string; versionId: string; projectId: string | null }> {
  const mode = payload.mode ?? "update";
  // Never save a recipe outside a folder — the DB trigger is the last line of defence,
  // this keeps the client honest so the returned folder name is accurate.
  const projectId = payload.projectId ?? (await getOrCreateDefaultProject()).id;
  let recipeId = mode === "copy" ? undefined : payload.recipeId;

  if (recipeId) {
    const { error } = await supabase
      .from("recipes")
      .update({
        name: payload.name,
        age_band: payload.ageBand,
        project_id: projectId,
        ...(payload.isPinned !== undefined ? { is_pinned: payload.isPinned } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", recipeId);
    if (error) throw error;
  } else {
    const { data, error } = await supabase
      .from("recipes")
      .insert({
        name: payload.name,
        age_band: payload.ageBand,
        project_id: projectId,
        is_pinned: mode === "copy" ? false : (payload.isPinned ?? false),
      })
      .select("id")
      .single();
    if (error) throw error;
    recipeId = data.id as string;
  }

  const dryG = payload.totals.totalGrams ?? null;
  const cookedG = payload.actualOutputG ?? null;
  const derived =
    dryG && dryG > 0 && cookedG != null
      ? {
          water_content_g: round2(cookedG - dryG),
          yield_pct: round2((cookedG / dryG) * 100),
          cooking_loss_pct: cookedG < dryG ? round2((1 - cookedG / dryG) * 100) : 0,
        }
      : { water_content_g: null, yield_pct: null, cooking_loss_pct: null };

  const versionBody = {
    recipe_id: recipeId,
    ingredients: payload.ingredients as unknown as never,
    totals: payload.totals as unknown as never,
    safety_flags: payload.safetyFlags as unknown as never,
    aas_score: payload.totals.aas,
    total_calories: Math.round(payload.totals.nutrients.kcal),
    prep_notes: payload.prepNotes,
    actual_output_g: cookedG,
    serving_size_g: payload.servingSizeG ?? null,
    description: payload.description ?? null,
    ...derived,
  };

  const { data: latest } = await supabase
    .from("recipe_versions")
    .select("id, version_number, ingredients, actual_output_g, serving_size_g, prep_notes, totals")
    .eq("recipe_id", recipeId)
    .order("version_number", { ascending: false })
    .limit(1);

  const previous = latest?.[0];
  const changes = previous ? diffVersion(previous as unknown as VersionRow, payload) : [];

  const nextNumber = (previous?.version_number ?? 0) + 1;
  const { data: inserted, error: insertErr } = await supabase
    .from("recipe_versions")
    .insert({
      ...versionBody,
      version_number: nextNumber,
      changes: changes as unknown as never,
    })
    .select("id")
    .single();
  if (insertErr) throw insertErr;

  await supabase.from("recipes").update({ current_version_id: inserted.id }).eq("id", recipeId);
  return { recipeId, versionId: inserted.id as string, projectId };
}

/** Duplicate a recipe (current version only) as a brand-new recipe. */
export async function cloneRecipe(
  id: string,
  opts?: { projectId?: string | null; name?: string },
): Promise<string> {
  const source = await getRecipe(id);
  if (!source) throw new Error("Recipe not found");
  const { data, error } = await supabase
    .from("recipes")
    .insert({
      name: opts?.name?.trim() || `${source.name} (Copy)`,
      age_band: source.age_band,
      project_id: opts?.projectId === undefined ? source.project_id : opts.projectId,
    })
    .select("id")
    .single();
  if (error) throw error;
  const newId = data.id as string;

  if (source.current) {
    const { data: v, error: vErr } = await supabase
      .from("recipe_versions")
      .insert({
        recipe_id: newId,
        version_number: 1,
        ingredients: source.current.ingredients as unknown as never,
        totals: (source.current.totals ?? {}) as unknown as never,
        safety_flags: source.current.safety_flags as unknown as never,
        aas_score: source.current.aas_score,
        total_calories: source.current.total_calories,
        prep_notes: source.current.prep_notes,
        actual_output_g: source.current.actual_output_g ?? null,
        serving_size_g: source.current.serving_size_g ?? null,
        description: source.current.description ?? null,
      })
      .select("id")
      .single();
    if (vErr) throw vErr;
    await supabase.from("recipes").update({ current_version_id: v.id }).eq("id", newId);
  }
  return newId;
}

export async function moveRecipeToProject(recipeId: string, projectId: string | null) {
  const { error } = await supabase
    .from("recipes")
    .update({ project_id: projectId, updated_at: new Date().toISOString() })
    .eq("id", recipeId);
  if (error) throw error;
}

export async function setRecipePinned(id: string, pinned: boolean) {
  const { error } = await supabase.from("recipes").update({ is_pinned: pinned }).eq("id", id);
  if (error) throw error;
}

export async function deleteRecipe(id: string) {
  const { data, error } = await supabase.from("recipes").delete().eq("id", id).select("id");
  if (error) throw error;
  if (!data || data.length === 0)
    throw new Error("This recipe could not be deleted — it no longer exists or is not yours.");
}

export async function restoreVersion(recipeId: string, versionId: string) {
  const { error } = await supabase
    .from("recipes")
    .update({ current_version_id: versionId, updated_at: new Date().toISOString() })
    .eq("id", recipeId);
  if (error) throw error;
}

