import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { RouteErrorCard, RoutePending } from "@/components/RouteStates";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { History, Pin, PinOff, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { recipeFullQuery, restoreVersion } from "@/lib/recipes";
import { supabase } from "@/integrations/supabase/client";
import { ResultsPanel } from "@/components/nutrition/ResultsPanel";
import { RowActionsMenu } from "@/components/RowActionsMenu";
import { useRecipeActions } from "@/components/recipes/useRecipeActions";
import { Button } from "@/components/ui/button";
import { fmt } from "@/lib/nutrition/calc";
import { AGE_BANDS } from "@/lib/nutrition/reference";
import { rdaQuery } from "@/lib/rda";
import { deriveRecipe } from "@/lib/recipe-derive";
import { SHOW_AAS_SCORE } from "@/lib/flags";

export const Route = createFileRoute("/_authenticated/recipes/$id")({
  validateSearch: (search: Record<string, unknown>): { print?: boolean } =>
    search["print"] === true || search["print"] === "true" ? { print: true } : {},
  head: () => ({
    meta: [
      { title: "Recipe spec sheet — Rorosaur" },
      {
        name: "description",
        content:
          "Clinical spec sheet: moisture & yield, ingredient composition, WHO 2007 amino-acid report, ICMR %RDA table and version history.",
      },
      { property: "og:title", content: "Recipe spec sheet — Rorosaur" },
      {
        property: "og:description",
        content: "Nutrition breakdown and version history for a recipe.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  errorComponent: RouteErrorCard,
  pendingComponent: RoutePending,
  component: RecipeDetail,
});

function RecipeDetail() {
  const { id } = Route.useParams();
  const { print } = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const recipe = useQuery(recipeFullQuery(id));
  const rda = useQuery(rdaQuery());
  const actions = useRecipeActions();

  useEffect(() => {
    const channel = supabase
      .channel(`recipe-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "recipe_versions" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["recipe-full", id] });
        void queryClient.invalidateQueries({ queryKey: ["versions", id] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "recipes" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["recipe-full", id] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [id, queryClient]);

  useEffect(() => {
    if (!print || !recipe.data) return;
    const t = setTimeout(() => {
      window.print();
      void navigate({ to: "/recipes/$id", params: { id }, search: {}, replace: true });
    }, 400);
    return () => clearTimeout(t);
  }, [print, recipe.data, id, navigate]);

  if (recipe.isLoading) return <RecipeSkeleton />;
  if (!recipe.data)
    return (
      <div className="rounded-xl border border-dashed border-border p-10 text-center">
        <p className="text-muted-foreground">This recipe no longer exists.</p>
        <Link to="/recipes" className="mt-3 inline-block text-sm text-primary hover:underline">
          Back to recipes
        </Link>
      </div>
    );

  const data = recipe.data;
  const d = deriveRecipe(data, rda.data);
  const { totals, flags, serving, ingredients, ageBand } = d;

  const restore = async (versionId: string) => {
    await restoreVersion(id, versionId);
    await queryClient.invalidateQueries({ queryKey: ["recipe-full", id] });
    await queryClient.invalidateQueries({ queryKey: ["recipes"] });
    toast.success("Version restored as current");
  };

  const delta = serving.moistureDeltaG;

  return (
    <div className="spec-sheet spec-sheet-container space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            to="/recipes"
            className="no-print text-xs uppercase tracking-wide text-muted-foreground hover:text-foreground"
          >
            Recipes
          </Link>
          <p className="hidden text-[10px] font-semibold uppercase tracking-widest text-muted-foreground print:block">
            Rorosaur recipe spec
          </p>
          <h1 className="flex items-center gap-2 font-display text-2xl font-semibold">
            {data.name}
            {data.is_pinned && (
              <Pin className="size-4 fill-current text-primary" aria-label="Pinned" />
            )}
          </h1>
          {data.current?.description && (
            <p className="mt-0.5 text-sm text-muted-foreground">{data.current.description}</p>
          )}
          <p className="mt-1 text-sm text-muted-foreground">
            {data.project && (
              <>
                <Link
                  to="/projects/$id"
                  params={{ id: data.project.id }}
                  className="text-primary hover:underline"
                >
                  {data.project.name}
                </Link>{" "}
                ·{" "}
              </>
            )}
            {AGE_BANDS.find((b) => b.value === data.age_band)?.label} · v
            {data.current?.version_number ?? "—"} · updated{" "}
            {new Date(data.updated_at).toLocaleString()}
          </p>
        </div>
        <div className="no-print flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => void actions.togglePin(data)}
            aria-pressed={data.is_pinned}
            title={data.is_pinned ? "Unpin from dashboard" : "Pin to dashboard"}
          >
            {data.is_pinned ? (
              <Pin className="size-4 fill-current" />
            ) : (
              <PinOff className="size-4" />
            )}
            {data.is_pinned ? "Pinned" : "Pin"}
          </Button>
          <RowActionsMenu
            actions={actions.actionsFor(data, { includeOpen: false })}
            label="More actions"
          />
        </div>
      </div>

      {/* Moisture & cooking yield */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 print-block">
        <Stat label="Dry weight" value={`${fmt(totals.totalGrams, 0)} g`} />
        <Stat
          label="Cooked weight"
          value={serving.actualOutputG ? `${fmt(serving.actualOutputG, 0)} g` : "–"}
        />
        <Stat
          label="Yield factor"
          value={serving.yieldFactor != null ? `${serving.yieldFactor}×` : "–"}
        />
        <Stat
          label={delta != null && delta < 0 ? "Water lost" : "Water gained"}
          value={delta == null ? "–" : `${delta >= 0 ? "+" : "−"}${fmt(Math.abs(delta), 0)} g`}
        />
        <Stat
          label="Serving size"
          value={serving.servingSizeG ? `${fmt(serving.servingSizeG, 0)} g` : "–"}
        />
        <Stat label="Servings" value={serving.servings != null ? fmt(serving.servings, 1) : "–"} />
      </section>

      <div className="spec-sheet-columns grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <div className="space-y-4">
          <div className="overflow-hidden rounded-xl border border-border bg-card print-block">
            <table className="w-full text-sm">
              <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Ingredient</th>
                  <th className="px-3 py-2 text-right font-medium">Dry g</th>
                  <th className="px-3 py-2 text-right font-medium">Protein g</th>
                  <th className="px-3 py-2 text-right font-medium">kcal</th>
                </tr>
              </thead>
              <tbody>
                {ingredients.map((i) => (
                  <tr key={i.key} className="border-t border-border">
                    <td className="px-3 py-2">{i.name}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt(i.grams, 0)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmt(((i.nutrients?.protein_g ?? 0) * i.grams) / 100, 2)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {Math.round(((i.nutrients?.kcal ?? 0) * i.grams) / 100)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-border bg-secondary/30 font-medium">
                <tr>
                  <td className="px-3 py-2">Dry batch total</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmt(totals.totalGrams, 0)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmt(totals.nutrients.protein_g, 2)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmt(totals.nutrients.kcal, 0)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {data.current?.prep_notes && (
            <div className="rounded-xl border border-border bg-card p-4 print-block">
              <h2 className="font-display text-base font-semibold">Preparation</h2>
              <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                {data.current.prep_notes}
              </p>
            </div>
          )}

          <div className="no-print rounded-xl border border-border bg-card p-4">
            <h2 className="flex items-center gap-2 font-display text-base font-semibold">
              <History className="size-4" /> Version history
            </h2>
            <ul className="mt-3 space-y-2">
              {(data.versions ?? []).map((v) => (
                <li key={v.id} className="rounded-lg border border-border px-3 py-2 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span>
                      v{v.version_number}
                      <span className="ml-2 text-muted-foreground">
                        {new Date(v.created_at).toLocaleString()} · {v.total_calories ?? "–"} kcal
                        {SHOW_AAS_SCORE
                          ? ` · AAS ${v.aas_score != null ? (v.aas_score / 100).toFixed(2) : "–"}`
                          : ""}
                      </span>
                    </span>
                    {v.id === data.current_version_id ? (
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">current</span>
                    ) : (
                      <button
                        onClick={() => restore(v.id)}
                        className="flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        <RotateCcw className="size-3" /> Restore
                      </button>
                    )}
                  </div>
                  {v.changes.length > 0 && (
                    <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">
                      {v.changes.map((c, i) => (
                        <li key={i}>{c}</li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
              {(data.versions ?? []).length === 0 && (
                <li className="text-sm text-muted-foreground">No versions saved yet.</li>
              )}
            </ul>
          </div>
        </div>

        <ResultsPanel totals={totals} flags={flags} serving={serving} />
      </div>
      {actions.dialogs}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 font-display text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

/** Placeholder that matches the spec-sheet layout while the single fetch resolves. */
function RecipeSkeleton() {
  return (
    <div className="animate-pulse space-y-6" aria-busy="true" aria-label="Loading recipe">
      <div className="h-8 w-64 rounded bg-secondary" />
      <div className="grid gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 rounded-xl bg-secondary" />
        ))}
      </div>
      <div className="h-64 rounded-xl bg-secondary" />
    </div>
  );
}
