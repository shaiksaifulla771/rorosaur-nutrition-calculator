import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Database, Pin, PinOff, Salad } from "lucide-react";
import { toast } from "sonner";

import { RouteErrorCard, RoutePending, errorMessage } from "@/components/RouteStates";
import { PageHeader, RowActionsMenu } from "@/components/RowActionsMenu";
import { useRecipeActions } from "@/components/recipes/useRecipeActions";
import { Button } from "@/components/ui/button";
import { SHOW_AAS_SCORE } from "@/lib/flags";
import { usePinnedIngredients, usePinnedRecipes } from "@/hooks/usePinned";
import type { RecipeWithVersion } from "@/lib/recipes";
import { rdaQuery } from "@/lib/rda";
import { deriveRecipe } from "@/lib/recipe-derive";
import { fmt } from "@/lib/nutrition/calc";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 12;

export const Route = createFileRoute("/_authenticated/pinned-assets")({
  head: () => ({
    meta: [
      { title: "Pinned assets — Rorosaur" },
      {
        name: "description",
        content: "Pinned recipes and staple ingredients for the Rorosaur recipe team.",
      },
      { property: "og:title", content: "Pinned assets — Rorosaur" },
      {
        property: "og:description",
        content: "One place for pinned recipes and staple master ingredients.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  errorComponent: RouteErrorCard,
  pendingComponent: RoutePending,
  component: PinnedAssetsPage,
});

function PinnedAssetsPage() {
  const queryClient = useQueryClient();
  const recipes = usePinnedRecipes();
  const ingredients = usePinnedIngredients();
  const rda = useQuery(rdaQuery());
  const actions = useRecipeActions();
  const [recipeLimit, setRecipeLimit] = useState(PAGE_SIZE);
  const [itemLimit, setItemLimit] = useState(PAGE_SIZE);
  const [unpinning, setUnpinning] = useState<string | null>(null);

  useEffect(() => {
    const channel = supabase
      .channel("pinned-assets-sync")
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
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  if (recipes.isLoading || ingredients.isLoading || rda.isLoading) return <RoutePending />;
  const firstError = recipes.error ?? ingredients.error;
  if (firstError) return <RouteErrorCard error={firstError} />;

  const pinnedRecipes = recipes.pinned;
  const pinnedItems = ingredients.pinned;
  const total = pinnedRecipes.length + pinnedItems.length;

  const unpinRecipe = (r: RecipeWithVersion) => actions.togglePin(r);
  const unpinItem = async (id: string, name: string) => {
    setUnpinning(id);
    try {
      await ingredients.unpin(id);
      toast.success(`Unpinned ${name}`);
    } catch (e) {
      toast.error(errorMessage(e, "Could not unpin ingredient"));
    } finally {
      setUnpinning(null);
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="Pinned assets"
        subtitle="Recipes and staple ingredients you keep close at hand."
      />

      {total === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <Pin className="mx-auto size-6 text-muted-foreground" />
          <h2 className="mt-3 font-display text-lg font-semibold">No pinned assets yet</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Use the pin icon on any recipe or custom master ingredient to keep it here for one-click
            access.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Button asChild variant="outline">
              <Link to="/recipes">
                <Salad className="size-4" /> Go to Recipes
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/master">
                <Database className="size-4" /> Go to Master Data
              </Link>
            </Button>
          </div>
        </div>
      ) : (
        <>
          {/* Section 1: pinned recipes */}
          <section>
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-lg font-semibold">
                Pinned recipes{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  ({pinnedRecipes.length})
                </span>
              </h2>
              <Link to="/recipes" className="text-sm text-primary hover:underline">
                All recipes
              </Link>
            </div>
            {pinnedRecipes.length === 0 ? (
              <p className="mt-2 rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
                No pinned recipes — use the pin icon on any recipe to keep it here.
              </p>
            ) : (
              <>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {pinnedRecipes.slice(0, recipeLimit).map((r) => {
                    const d = deriveRecipe(r, rda.data);
                    const good = d.totals.aas >= 100;
                    return (
                      <div
                        key={r.id}
                        className="group relative rounded-xl border border-border bg-card p-4 transition-colors hover:bg-secondary/40"
                      >
                        <Link to="/builder" search={{ recipe: r.id }} className="block">
                          <div className="flex items-start justify-between gap-2 pr-8">
                            <span className="font-medium">{r.name}</span>
                            {SHOW_AAS_SCORE && (
                              <span
                                className={cn(
                                  "rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
                                  good
                                    ? "bg-success/15 text-success"
                                    : "bg-warning/20 text-warning-foreground",
                                )}
                              >
                                AAS {(d.totals.aas / 100).toFixed(2)}
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {r.project?.name ?? "No project"}
                          </p>
                          <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                            <div>
                              <dt className="text-muted-foreground">Dry</dt>
                              <dd className="font-medium tabular-nums">
                                {fmt(d.totals.totalGrams, 0)} g
                              </dd>
                            </div>
                            <div>
                              <dt className="text-muted-foreground">Cooked</dt>
                              <dd className="font-medium tabular-nums">
                                {d.serving.actualOutputG
                                  ? `${fmt(d.serving.actualOutputG, 0)} g`
                                  : "–"}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-muted-foreground">Yield</dt>
                              <dd className="font-medium tabular-nums">
                                {d.serving.yieldFactor != null ? `${d.serving.yieldFactor}×` : "–"}
                              </dd>
                            </div>
                          </dl>
                        </Link>
                        <div className="absolute top-3 right-3">
                          <RowActionsMenu
                            actions={actions.actionsFor(r)}
                            label={`Actions for ${r.name}`}
                          />
                        </div>
                        <button
                          onClick={() => unpinRecipe(r)}
                          aria-label={`Unpin ${r.name}`}
                          title="Unpin"
                          className="absolute right-3 bottom-3 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                        >
                          <PinOff className="size-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
                {pinnedRecipes.length > recipeLimit && (
                  <div className="mt-3 text-center">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setRecipeLimit((n) => n + PAGE_SIZE)}
                    >
                      Show more ({pinnedRecipes.length - recipeLimit} remaining)
                    </Button>
                  </div>
                )}
              </>
            )}
          </section>

          {/* Section 2: pinned ingredients */}
          <section>
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-lg font-semibold">
                Pinned ingredients{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  ({pinnedItems.length})
                </span>
              </h2>
              <Link to="/master" className="text-sm text-primary hover:underline">
                Master Data
              </Link>
            </div>
            {pinnedItems.length === 0 ? (
              <p className="mt-2 rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
                No pinned ingredients — pin staple raw materials in{" "}
                <Link to="/master" className="text-primary hover:underline">
                  Master Data
                </Link>
                .
              </p>
            ) : (
              <>
                <div className="mt-3 overflow-x-auto rounded-xl border border-border bg-card">
                  <table className="w-full text-sm">
                    <thead className="bg-secondary/80 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-medium">Name</th>
                        <th className="px-3 py-2 font-medium">Category</th>
                        <th className="px-3 py-2 font-medium">Source</th>
                        <th className="px-3 py-2 text-right font-medium">Protein /100 g</th>
                        <th className="px-3 py-2 text-right font-medium">kcal /100 g</th>
                        <th className="px-3 py-2 text-right font-medium">
                          <span className="sr-only">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {pinnedItems.slice(0, itemLimit).map((m) => (
                        <tr key={m.id} className="border-t border-border hover:bg-secondary/40">
                          <td className="px-3 py-2 font-medium">
                            <Link
                              to="/master/$id"
                              params={{ id: m.id }}
                              className="hover:underline"
                            >
                              {m.name}
                            </Link>
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">{m.category}</td>
                          <td className="px-3 py-2">
                            <span className="rounded-full bg-accent/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-accent-foreground">
                              {m.source}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {fmt(m.nutrients.protein_g ?? 0, 1)} g
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {fmt(m.nutrients.kcal ?? 0, 0)}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center justify-end gap-3 whitespace-nowrap">
                              <Link
                                to="/builder"
                                search={{ add: m.id }}
                                className="text-xs font-medium text-primary hover:underline"
                              >
                                + Add to recipe
                              </Link>
                              <button
                                onClick={() => unpinItem(m.id, m.name)}
                                disabled={unpinning === m.id}
                                aria-label={`Unpin ${m.name}`}
                                title="Unpin"
                                className="text-muted-foreground hover:text-foreground disabled:opacity-50"
                              >
                                <PinOff className="size-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {pinnedItems.length > itemLimit && (
                  <div className="mt-3 text-center">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setItemLimit((n) => n + PAGE_SIZE)}
                    >
                      Show more ({pinnedItems.length - itemLimit} remaining)
                    </Button>
                  </div>
                )}
              </>
            )}
          </section>
        </>
      )}
      {actions.dialogs}
    </div>
  );
}
