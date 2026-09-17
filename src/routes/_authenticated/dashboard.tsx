import { createFileRoute, Link } from "@tanstack/react-router";
import { RouteErrorCard, RoutePending } from "@/components/RouteStates";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { Database, FolderKanban, Pin, Plus, Salad } from "lucide-react";

import { recipesQuery } from "@/lib/recipes";
import { projectsQuery } from "@/lib/projects";
import { masterItemsQuery } from "@/lib/master";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { PageHeader, RowActionsMenu } from "@/components/RowActionsMenu";
import { useRecipeActions } from "@/components/recipes/useRecipeActions";
import { Button } from "@/components/ui/button";
import { SHOW_AAS_SCORE } from "@/lib/flags";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Rorosaur" },
      {
        name: "description",
        content:
          "Pinned recipes and staple ingredients, KPIs and recent activity for the Rorosaur recipe team.",
      },
      { property: "og:title", content: "Dashboard — Rorosaur" },
      {
        property: "og:description",
        content: "Executive overview of recipes, projects and master ingredients.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  errorComponent: RouteErrorCard,
  pendingComponent: RoutePending,
  component: Dashboard,
});

function Dashboard() {
  const queryClient = useQueryClient();
  const recipes = useQuery(recipesQuery());
  const projects = useQuery(projectsQuery());
  const master = useQuery(masterItemsQuery());
  const actions = useRecipeActions();

  useEffect(() => {
    const channel = supabase
      .channel("dashboard-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "recipes" },
        () => void queryClient.invalidateQueries({ queryKey: ["recipes"] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "recipe_versions" },
        () => void queryClient.invalidateQueries({ queryKey: ["recipes"] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "master_items" },
        () => void queryClient.invalidateQueries({ queryKey: ["master-items"] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "projects" },
        () => void queryClient.invalidateQueries({ queryKey: ["projects"] }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const all = recipes.data ?? [];
  const pinnedCount =
    all.filter((r) => r.is_pinned).length +
    (master.data ?? []).filter((m) => m.is_pinned && m.is_active).length;
  const recent = useMemo(
    () => [...all].sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1)).slice(0, 10),
    [all],
  );

  return (
    <div className="space-y-8">
      <PageHeader
        title="Dashboard"
        subtitle="Workspace overview and recent activity."
        actions={
          <Button asChild>
            <Link to="/builder">
              <Plus className="size-4" /> New recipe
            </Link>
          </Button>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={Salad} label="Recipes" value={all.length} to="/recipes" />
        <Kpi
          icon={FolderKanban}
          label="Project folders"
          value={projects.data?.length ?? 0}
          to="/projects"
        />
        <Kpi
          icon={Database}
          label="Master ingredients"
          value={(master.data ?? []).filter((m) => m.is_active).length}
          to="/master"
        />
        <Kpi icon={Pin} label="Pinned assets" value={pinnedCount} to="/pinned-assets" />
      </div>

      {/* Recent */}
      <section>
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-lg font-semibold">Recent recipes</h2>
          <Link to="/recipes" className="text-sm text-primary hover:underline">
            All recipes
          </Link>
        </div>
        <div className="mt-3 overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-secondary/80 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Project</th>
                {SHOW_AAS_SCORE && <th className="px-3 py-2 text-right font-medium">AAS</th>}
                <th className="px-3 py-2 text-right font-medium">kcal</th>
                <th className="px-3 py-2 font-medium">Updated</th>
                <th className="w-12 px-3 py-2 text-right font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {recent.length === 0 && (
                <tr>
                  <td
                    colSpan={SHOW_AAS_SCORE ? 6 : 5}
                    className="px-3 py-6 text-center text-muted-foreground"
                  >
                    No recipes yet.
                  </td>
                </tr>
              )}
              {recent.map((r) => (
                <tr key={r.id} className="border-t border-border hover:bg-secondary/40">
                  <td className="px-3 py-2 font-medium">
                    <Link to="/recipes/$id" params={{ id: r.id }} className="hover:underline">
                      {r.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{r.project?.name ?? "—"}</td>
                  {SHOW_AAS_SCORE && (
                    <td className="px-3 py-2 text-right tabular-nums">
                      {r.current?.aas_score != null ? (r.current.aas_score / 100).toFixed(2) : "–"}
                    </td>
                  )}
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.current?.total_calories ?? "–"}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {new Date(r.updated_at).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <RowActionsMenu
                      actions={actions.actionsFor(r)}
                      label={`Actions for ${r.name}`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {actions.dialogs}
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  to,
}: {
  icon: typeof Salad;
  label: string;
  value: number;
  to?: "/recipes" | "/projects" | "/master" | "/pinned-assets";
}) {
  const body = (
    <>
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
        <Icon className="size-3.5" /> {label}
      </div>
      <div className="mt-1 font-display text-3xl font-semibold tabular-nums">{value}</div>
    </>
  );
  const cls = "rounded-xl border border-border bg-card p-4";
  return to ? (
    <Link to={to} className={cn(cls, "block transition-colors hover:bg-secondary/40")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
