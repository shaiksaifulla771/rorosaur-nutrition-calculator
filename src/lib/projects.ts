import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { withTimeout } from "@/lib/utils";

export type ProjectRow = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  recipe_count?: number;
};

export const DEFAULT_PROJECT_NAME = "Default";

export const isDefaultProject = (p: Pick<ProjectRow, "name"> | null | undefined) =>
  (p?.name ?? "").trim().toLowerCase() === DEFAULT_PROJECT_NAME.toLowerCase();

const DEFAULT_SELECT = "id, name, description, created_at, updated_at";

async function findDefaultProject(): Promise<ProjectRow | null> {
  const { data, error } = await supabase
    .from("projects")
    .select(DEFAULT_SELECT)
    .ilike("name", DEFAULT_PROJECT_NAME)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as ProjectRow) ?? null;
}

/**
 * The permanent "Default" folder. Race-safe: a partial unique index guarantees a single
 * Default row per workspace, so a concurrent insert loses with 23505 and we re-read the winner.
 */
export async function getOrCreateDefaultProject(): Promise<ProjectRow> {
  const found = await findDefaultProject();
  if (found) return found;

  const { data: created, error: insertErr } = await supabase
    .from("projects")
    .insert({
      name: DEFAULT_PROJECT_NAME,
      description: "Default folder for unassigned recipes",
    })
    .select(DEFAULT_SELECT)
    .maybeSingle();

  if (insertErr) {
    // 23505 = another tab/request created it first.
    const again = await findDefaultProject();
    if (again) return again;
    throw insertErr;
  }
  if (created) return created as ProjectRow;

  const again = await findDefaultProject();
  if (again) return again;
  throw new Error("Could not create the Default folder");
}

export async function listProjects(): Promise<ProjectRow[]> {
  const { data, error } = await withTimeout(
    supabase
      .from("projects")
      .select("id, name, description, created_at, updated_at, recipes(count)")
      .order("updated_at", { ascending: false }),
    undefined,
    "Loading projects",
  );
  if (error) throw error;
  const rows = (data ?? []).map((row) => {
    const { recipes, ...rest } = row as ProjectRow & { recipes?: { count: number }[] };
    return { ...rest, recipe_count: recipes?.[0]?.count ?? 0 };
  });
  // Default folder is always pinned to the top.
  return [...rows.filter(isDefaultProject), ...rows.filter((r) => !isDefaultProject(r))];
}

export async function getProject(id: string): Promise<ProjectRow | null> {
  const { data, error } = await supabase
    .from("projects")
    .select("id, name, description, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as ProjectRow | null;
}

export async function createProject(input: { name: string; description?: string }) {
  const name = input.name.trim();
  if (!name) throw new Error("Project name is required");
  if (name.toLowerCase() === DEFAULT_PROJECT_NAME.toLowerCase())
    throw new Error(`"${DEFAULT_PROJECT_NAME}" is reserved for the built-in folder.`);
  const { data, error } = await supabase
    .from("projects")
    .insert({ name, description: input.description?.trim() || null })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function updateProject(id: string, input: { name: string; description?: string }) {
  const name = input.name.trim();
  if (!name) throw new Error("Project name is required");
  const current = await getProject(id);
  if (isDefaultProject(current) && name.toLowerCase() !== DEFAULT_PROJECT_NAME.toLowerCase())
    throw new Error("The Default project folder cannot be renamed.");
  const { error } = await supabase
    .from("projects")
    .update({
      name,
      description: input.description?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;
}

/** Deletes a custom folder. Every recipe inside is transferred to the Default folder first — nothing is lost. */
export async function deleteProject(id: string) {
  const defaultProj = await getOrCreateDefaultProject();
  if (id === defaultProj.id) throw new Error("The Default project folder cannot be deleted.");

  const { error: transferErr } = await supabase
    .from("recipes")
    .update({ project_id: defaultProj.id })
    .eq("project_id", id);
  if (transferErr)
    throw new Error(
      `The recipes in this folder could not be moved to Default, so it was not deleted. ${transferErr.message}`,
    );

  const { error: orphanErr } = await supabase
    .from("recipes")
    .update({ project_id: defaultProj.id })
    .is("project_id", null);
  if (orphanErr) throw orphanErr;

  const { data, error } = await supabase.from("projects").delete().eq("id", id).select("id");
  if (error) throw error;
  if (!data || data.length === 0)
    throw new Error("This folder could not be deleted — it no longer exists or is protected.");
}

export const projectsQuery = () => queryOptions({ queryKey: ["projects"], queryFn: listProjects });
export const projectQuery = (id: string) =>
  queryOptions({ queryKey: ["project", id], queryFn: () => getProject(id), enabled: Boolean(id) });
