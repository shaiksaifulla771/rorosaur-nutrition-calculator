import { createFileRoute, Link } from "@tanstack/react-router";
import { RouteErrorCard, RoutePending } from "@/components/RouteStates";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Check, Pencil, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { isDefaultProject, projectQuery, updateProject } from "@/lib/projects";
import { recipesQuery } from "@/lib/recipes";
import { supabase } from "@/integrations/supabase/client";
import { RecipeTable } from "@/components/RecipeTable";
import type { RecipeWithVersion } from "@/lib/recipes";
import { SHOW_AAS_SCORE } from "@/lib/flags";
import { cn } from "@/lib/utils";

function ProjectAnalytics({ recipes }: { recipes: RecipeWithVersion[] }) {
  const scored = recipes.filter((r) => r.current?.aas_score != null);
  const avg = scored.length
    ? scored.reduce((a, r) => a + (r.current!.aas_score ?? 0), 0) / scored.length / 100
    : null;
  const sufficient = scored.filter((r) => (r.current!.aas_score ?? 0) >= 100).length;
  const pinned = recipes.filter((r) => r.is_pinned).length;
  const cell = (label: string, value: string) => (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 font-display text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
  return (
    <div
      className={cn("grid gap-3", SHOW_AAS_SCORE ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2")}
    >
      {cell("Recipes", String(recipes.length))}
      {SHOW_AAS_SCORE && cell("Average AAS", avg == null ? "–" : avg.toFixed(2))}
      {SHOW_AAS_SCORE && cell("AAS ≥ 1.00", scored.length ? `${sufficient}/${scored.length}` : "–")}
      {cell("Pinned", String(pinned))}
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/projects/$id")({
  head: () => ({
    meta: [
      { title: "Project — Rorosaur" },
      { name: "description", content: "Recipes shared under this project." },
      { property: "og:title", content: "Project — Rorosaur" },
      { property: "og:description", content: "Recipes shared under this project." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  errorComponent: RouteErrorCard,
  pendingComponent: RoutePending,
  component: ProjectDetail,
});

function ProjectDetail() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const project = useQuery(projectQuery(id));
  const recipes = useQuery(recipesQuery(id));
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    const channel = supabase
      .channel(`project-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "recipes" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["recipes"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "recipe_versions" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["recipes"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "projects" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["project", id] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [id, queryClient]);

  if (project.isLoading) return <p className="text-sm text-muted-foreground">Loading project…</p>;
  if (!project.data)
    return (
      <div className="rounded-xl border border-dashed border-border p-10 text-center">
        <p className="text-muted-foreground">This project no longer exists.</p>
        <Link to="/projects" className="mt-3 inline-block text-sm text-primary hover:underline">
          Back to projects
        </Link>
      </div>
    );

  const p = project.data;

  const startEdit = () => {
    setName(p.name);
    setDescription(p.description ?? "");
    setEditing(true);
  };

  const save = async () => {
    try {
      await updateProject(id, { name, description });
      await queryClient.invalidateQueries({ queryKey: ["project", id] });
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      await queryClient.invalidateQueries({ queryKey: ["recipes"] });
      setEditing(false);
      toast.success("Project updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <nav className="flex items-center gap-1 text-xs uppercase tracking-wide text-muted-foreground">
            <Link to="/projects" className="hover:text-foreground">
              Projects
            </Link>
            <span>/</span>
            <span className="truncate">{p.name}</span>
            <span>/</span>
            <span className="text-foreground">Recipes</span>
          </nav>
          {editing ? (
            <div className="mt-1 max-w-xl space-y-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 font-display text-xl font-semibold outline-none focus:ring-2 focus:ring-ring"
              />
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Description"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              <div className="flex gap-2">
                <button
                  onClick={save}
                  className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground"
                >
                  <Check className="size-4" /> Save
                </button>
                <button
                  onClick={() => setEditing(false)}
                  className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-sm"
                >
                  <X className="size-4" /> Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <h1 className="flex items-center gap-2 font-display text-2xl font-semibold">
                Recipes in {p.name}
                {isDefaultProject(p) ? (
                  <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
                    Default folder
                  </span>
                ) : (
                  <button
                    onClick={startEdit}
                    aria-label="Edit project"
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <Pencil className="size-4" />
                  </button>
                )}
              </h1>
              {p.description && (
                <p className="mt-1 text-sm text-muted-foreground">{p.description}</p>
              )}
            </>
          )}
        </div>
        <Link
          to="/builder"
          search={{ project: id }}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="size-4" /> Add recipe in this project
        </Link>
      </div>

      <ProjectAnalytics recipes={recipes.data ?? []} />

      <RecipeTable recipes={recipes.data ?? []} loading={recipes.isLoading} showProject={false} />
    </div>
  );
}
