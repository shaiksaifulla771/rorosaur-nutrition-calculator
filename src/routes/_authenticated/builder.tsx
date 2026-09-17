import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { RouteErrorCard, RoutePending } from "@/components/RouteStates";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ClipboardPaste,
  Copy,
  Droplets,
  Loader2,
  Lock,
  Pin,
  PinOff,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import {
  calculateRecipe,
  evaluateSafety,
  fmt,
  servingInfo,
  type RecipeIngredient,
} from "@/lib/nutrition/calc";
import { AGE_BANDS, type AgeBand } from "@/lib/nutrition/reference";
import type { FoodItem } from "@/lib/nutrition/food-catalog";
import { ResultsPanel } from "@/components/nutrition/ResultsPanel";
import { FoodPicker } from "@/components/nutrition/FoodPicker";
import { CustomIngredientDrawer } from "@/components/nutrition/CustomIngredientDrawer";
import { PasteIngredientsDialog } from "@/components/nutrition/PasteIngredientsDialog";
import { cloneRecipe, recipeQuery, saveRecipe } from "@/lib/recipes";
import { isDefaultProject, projectsQuery } from "@/lib/projects";
import { masterItemsQuery, masterToFood } from "@/lib/master";
import { rdaQuery } from "@/lib/rda";
import { cn } from "@/lib/utils";
import { RowActionsMenu } from "@/components/RowActionsMenu";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useRecipeActions } from "@/components/recipes/useRecipeActions";

type Search = { recipe?: string; project?: string; add?: string };

export const Route = createFileRoute("/_authenticated/builder")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    ...(typeof search["recipe"] === "string" ? { recipe: search["recipe"] as string } : {}),
    ...(typeof search["project"] === "string" ? { project: search["project"] as string } : {}),
    ...(typeof search["add"] === "string" ? { add: search["add"] as string } : {}),
  }),
  head: () => ({
    meta: [
      { title: "Calculator — nutrional calculator" },
      {
        name: "description",
        content:
          "Formulate gram by gram: dry-to-cooked yield, WHO 2007 amino-acid score, limiting amino acid and ICMR-NIN %RDA per serving.",
      },
      { property: "og:title", content: "Calculator — nutrional calculator" },
      {
        property: "og:description",
        content: "Live nutrition scoring while you formulate a recipe.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  errorComponent: RouteErrorCard,
  pendingComponent: RoutePending,
  component: Builder,
});

type DraftState = {
  name: string;
  description: string;
  ageBand: AgeBand;
  projectId: string | null;
  prepNotes: string;
  ingredients: RecipeIngredient[];
  actualOutputG: number | null;
  servingSizeG: number | null;
  isPinned: boolean;
};

const emptyDraft: DraftState = {
  name: "",
  description: "",
  ageBand: "1-3y",
  projectId: null,
  prepNotes: "",
  ingredients: [],
  actualOutputG: null,
  servingSizeG: 120,
  isPinned: false,
};

const toRow = (food: FoodItem, grams: number): RecipeIngredient => ({
  key: `${food.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  foodId: food.id,
  name: food.name,
  grams,
  nutrients: food.nutrients,
  amino: food.amino,
});

function Builder() {
  const { recipe: recipeId, project: projectParam, add: addParam } = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const existing = useQuery({ ...recipeQuery(recipeId ?? ""), enabled: Boolean(recipeId) });
  const projects = useQuery(projectsQuery());
  const master = useQuery(masterItemsQuery());
  const rda = useQuery(rdaQuery());

  const initial: DraftState = { ...emptyDraft, projectId: projectParam ?? null };
  const [draft, setDraft] = useState<DraftState>(initial);
  const [savedSnapshot, setSavedSnapshot] = useState<string>(JSON.stringify(initial));
  const loadedFor = useRef<string | undefined>(undefined);
  const [customOpen, setCustomOpen] = useState<{ name: string } | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const recipeActions = useRecipeActions();

  /** Every recipe lives in a folder — new drafts start in Default. */
  const defaultProjectId = useMemo(
    () => (projects.data ?? []).find(isDefaultProject)?.id ?? null,
    [projects.data],
  );
  useEffect(() => {
    if (!defaultProjectId) return;
    setDraft((d) => (d.projectId ? d : { ...d, projectId: defaultProjectId }));
    setSavedSnapshot((s) => {
      const prev = JSON.parse(s) as DraftState;
      return prev.projectId ? s : JSON.stringify({ ...prev, projectId: defaultProjectId });
    });
  }, [defaultProjectId]);

  // Load an existing recipe into the draft
  useEffect(() => {
    if (!recipeId) {
      if (loadedFor.current !== undefined) {
        const fresh: DraftState = { ...emptyDraft, projectId: projectParam ?? null };
        setDraft(fresh);
        setSavedSnapshot(JSON.stringify(fresh));
        loadedFor.current = undefined;
      }
      return;
    }
    if (!existing.data || loadedFor.current === recipeId) return;
    const next: DraftState = {
      name: existing.data.name,
      description: existing.data.current?.description ?? "",
      ageBand: existing.data.age_band,
      projectId: existing.data.project_id ?? null,
      prepNotes: existing.data.current?.prep_notes ?? "",
      ingredients: existing.data.current?.ingredients ?? [],
      actualOutputG: existing.data.current?.actual_output_g ?? null,
      servingSizeG: existing.data.current?.serving_size_g ?? null,
      isPinned: existing.data.is_pinned,
    };
    setDraft(next);
    setSavedSnapshot(JSON.stringify(next));
    loadedFor.current = recipeId;
  }, [recipeId, existing.data, projectParam]);

  // ?add=<masterId> from the dashboard's pinned-ingredient shelf
  const addedParam = useRef<string | null>(null);
  useEffect(() => {
    if (!addParam || !master.data || addedParam.current === addParam) return;
    const item = master.data.find((m) => m.id === addParam);
    if (item) {
      setDraft((d) => ({ ...d, ingredients: [...d.ingredients, toRow(masterToFood(item), 10)] }));
      toast.success(`${item.name} added to the recipe`);
    }
    addedParam.current = addParam;
    void navigate({
      to: "/builder",
      search: (s: Search) => {
        const { add: _drop, ...rest } = s;
        return rest;
      },
      replace: true,
    });
  }, [addParam, master.data, navigate]);

  const totals = useMemo(
    () =>
      calculateRecipe(draft.ingredients, draft.ageBand, { rda: rda.data?.[draft.ageBand] ?? null }),
    [draft, rda.data],
  );
  const flags = useMemo(
    () => evaluateSafety(draft.ingredients, draft.ageBand, totals),
    [draft, totals],
  );
  const serving = useMemo(
    () =>
      servingInfo(
        totals,
        { actualOutputG: draft.actualOutputG, servingSizeG: draft.servingSizeG },
        draft.ageBand,
      ),
    [totals, draft.actualOutputG, draft.servingSizeG, draft.ageBand],
  );
  const dirty = JSON.stringify(draft) !== savedSnapshot;
  const blocking = flags.filter((f) => f.severity === "blocking");

  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const payload = (mode: "update" | "copy") => ({
    ...(recipeId ? { recipeId } : {}),
    name: draft.name.trim() || "Untitled recipe",
    ageBand: draft.ageBand,
    projectId: draft.projectId,
    ingredients: draft.ingredients,
    totals,
    safetyFlags: flags,
    prepNotes: draft.prepNotes,
    actualOutputG: draft.actualOutputG,
    servingSizeG: draft.servingSizeG,
    description: draft.description,
    isPinned: draft.isPinned,
    mode,
  });

  const invalidateAll = async (id: string) => {
    await queryClient.invalidateQueries({ queryKey: ["recipes"] });
    await queryClient.invalidateQueries({ queryKey: ["recipe", id] });
    await queryClient.invalidateQueries({ queryKey: ["recipe-full", id] });
    await queryClient.invalidateQueries({ queryKey: ["versions", id] });
    await queryClient.invalidateQueries({ queryKey: ["projects"] });
  };

  const folderName = (id: string | null) =>
    (projects.data ?? []).find((p) => p.id === id)?.name ?? "Default";

  const viewAction = (id: string) => ({
    label: "View recipe",
    onClick: () => void navigate({ to: "/recipes/$id", params: { id } }),
  });

  const [confirmUpdate, setConfirmUpdate] = useState(false);

  const save = useMutation({
    mutationFn: () => saveRecipe(payload("update")),
    onSuccess: async ({ recipeId: id, projectId }) => {
      setSavedSnapshot(JSON.stringify(draft));
      await invalidateAll(id);
      toast.success(recipeId ? "Recipe updated" : "Recipe saved", {
        description: `Saved in ${folderName(projectId)}`,
        action: viewAction(id),
      });
      if (!recipeId) await navigate({ to: "/builder", search: { recipe: id } });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Save failed"),
  });

  /** Save as Copy: fork the current draft into a brand-new recipe with its own history. */
  const saveCopy = useMutation({
    mutationFn: () =>
      saveRecipe({ ...payload("copy"), name: `${draft.name.trim() || "Untitled recipe"} (Copy)` }),
    onSuccess: async ({ recipeId: id, projectId }) => {
      await invalidateAll(id);
      toast.success(`Saved as a new recipe in ${folderName(projectId)}`, {
        action: viewAction(id),
      });
      loadedFor.current = undefined;
      await navigate({ to: "/builder", search: { recipe: id } });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Copy failed"),
  });

  const addFood = (food: FoodItem, grams = 10) =>
    setDraft((d) => ({ ...d, ingredients: [...d.ingredients, toRow(food, grams)] }));

  const updateGrams = (key: string, grams: number) =>
    setDraft((d) => ({
      ...d,
      ingredients: d.ingredients.map((i) => (i.key === key ? { ...i, grams } : i)),
    }));

  const remove = (key: string) =>
    setDraft((d) => ({ ...d, ingredients: d.ingredients.filter((i) => i.key !== key) }));

  /** Clears the in-memory draft only — never writes to the database. */
  const resetDraft = () => {
    setDraft({ ...emptyDraft, projectId: draft.projectId ?? defaultProjectId ?? null });
    toast.info(
      recipeId
        ? "Draft cleared — the saved recipe is untouched. Re-open it to restore."
        : "Draft cleared.",
    );
  };

  const waterNote = (() => {
    if (draft.ingredients.length === 0) return "Add ingredients to see the dry batch total.";
    if (serving.moistureDeltaG == null)
      return `Dry batch ${fmt(totals.totalGrams, 0)} g. Enter the actual cooked output to compute water gained or lost.`;
    const d = serving.moistureDeltaG;
    const water = d >= 0 ? `Water gained +${fmt(d, 0)} g` : `Water lost −${fmt(Math.abs(d), 0)} g`;
    const servingsTxt =
      serving.servings != null
        ? ` · Batch yields ${fmt(serving.servings, 1)} serving${serving.servings === 1 ? "" : "s"}`
        : "";
    return `${water} (yield ${serving.yieldFactor}×)${servingsTxt} · Per-serving values scale with actual output.`;
  })();

  const field =
    "mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="space-y-5">
      {/* Header + action bar */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">
            {recipeId ? "Edit recipe" : "New recipe"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {recipeId && existing.data && <>v{existing.data.current?.version_number ?? "—"} · </>}
            {dirty ? "Unsaved draft — nothing is stored until you save." : "All changes saved."}
          </p>
        </div>
        <div className="no-print flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setDraft((d) => ({ ...d, isPinned: !d.isPinned }))}
            aria-pressed={draft.isPinned}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm",
              draft.isPinned ? "border-primary bg-primary/10 text-primary" : "border-border",
            )}
            title="Pin to dashboard"
          >
            {draft.isPinned ? <Pin className="size-4" /> : <PinOff className="size-4" />}
            {draft.isPinned ? "Pinned" : "Pin"}
          </button>
          <button
            onClick={resetDraft}
            title="Clears the form you're typing in. Never touches saved recipes or Master Data."
            className="rounded-lg border border-border px-3 py-2 text-sm"
          >
            Reset
          </button>
          {recipeId ? (
            <>
              <button
                onClick={() => setConfirmUpdate(true)}
                disabled={
                  save.isPending ||
                  saveCopy.isPending ||
                  draft.ingredients.length === 0 ||
                  blocking.length > 0
                }
                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                title="Saves this recipe as a new version"
              >
                {(save.isPending || saveCopy.isPending) && (
                  <Loader2 className="size-4 animate-spin" />
                )}
                Update
              </button>
              {existing.data && (
                <RowActionsMenu
                  label="Recipe actions"
                  actions={[
                    {
                      label: "Save as new",
                      icon: Copy,
                      disabled: draft.ingredients.length === 0 || saveCopy.isPending,
                      onSelect: () => saveCopy.mutate(),
                    },
                    { type: "separator" },
                    ...recipeActions
                      .actionsFor(existing.data)
                      .filter((a) => a.type === "separator" || a.label !== "Edit"),
                  ]}
                />
              )}
            </>
          ) : (
            <button
              onClick={() => save.mutate()}
              disabled={save.isPending || draft.ingredients.length === 0 || blocking.length > 0}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {save.isPending && <Loader2 className="size-4 animate-spin" />}
              Save recipe
            </button>
          )}
        </div>
      </div>

      {blocking.length > 0 && (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Resolve the blocking safety issues before saving.
        </p>
      )}

      {/* Identity row */}
      <div className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="text-sm font-medium" htmlFor="recipe-name">
            Recipe name
          </label>
          <input
            id="recipe-name"
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            placeholder="Ragi Moong Super Mash"
            className={field}
          />
        </div>
        <div>
          <label className="text-sm font-medium" htmlFor="age-band">
            Age band / reference
          </label>
          <select
            id="age-band"
            value={draft.ageBand}
            onChange={(e) => setDraft((d) => ({ ...d, ageBand: e.target.value as AgeBand }))}
            className={field}
          >
            {AGE_BANDS.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium" htmlFor="project">
            Project folder
          </label>
          <select
            id="project"
            value={draft.projectId ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, projectId: e.target.value || null }))}
            className={field}
          >
            {(projects.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium" htmlFor="description">
            Description
          </label>
          <input
            id="description"
            value={draft.description}
            onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
            placeholder="High-protein complementary blend"
            className={field}
          />
        </div>
      </div>

      {/* Sizing & cooking yield */}
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-base font-semibold">Sizing &amp; cooking yield</h2>
          <span className="text-xs text-muted-foreground">
            Dry batch is auto-summed from the ingredient table.
          </span>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div>
            <label className="text-sm font-medium" htmlFor="dry-batch">
              Dry batch total (auto)
            </label>
            <input
              id="dry-batch"
              readOnly
              value={`${Math.round(totals.totalGrams)} g`}
              className="mt-1 w-full rounded-lg border border-input bg-secondary/50 px-3 py-2 text-sm tabular-nums text-muted-foreground"
            />
          </div>
          <div>
            <label className="text-sm font-medium" htmlFor="actual-output">
              Actual output (g)
            </label>
            <input
              id="actual-output"
              type="number"
              min={0}
              step={5}
              value={draft.actualOutputG ?? ""}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  actualOutputG: e.target.value === "" ? null : Number(e.target.value),
                }))
              }
              placeholder="Cooked weight"
              className={`${field} tabular-nums`}
            />
          </div>
          <div>
            <label className="text-sm font-medium" htmlFor="serving-size">
              Serving size (g)
            </label>
            <input
              id="serving-size"
              type="number"
              min={0}
              step={5}
              value={draft.servingSizeG ?? ""}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  servingSizeG: e.target.value === "" ? null : Number(e.target.value),
                }))
              }
              placeholder="120"
              className={`${field} tabular-nums`}
            />
          </div>
        </div>
        <p
          className={cn(
            "mt-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-sm",
            serving.moistureDeltaG == null
              ? "border-border bg-secondary/40 text-muted-foreground"
              : "border-primary/30 bg-primary/5 text-foreground",
          )}
          aria-live="polite"
        >
          <Droplets className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          <span>{waterNote}</span>
        </p>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        {/* Left: ingredients */}
        <div className="space-y-3">
          <FoodPicker onAdd={(f) => addFood(f)} />

          <div className="no-print flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setCustomOpen({ name: "" })}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-secondary"
            >
              <Plus className="size-3.5" /> Custom
            </button>
            <button
              type="button"
              onClick={() => setPasteOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-secondary"
            >
              <ClipboardPaste className="size-3.5" /> Paste ingredients
            </button>
          </div>

          {customOpen && (
            <CustomIngredientDrawer
              initialName={customOpen.name}
              onClose={() => setCustomOpen(null)}
              onAdded={(food, grams) => addFood(food, grams)}
            />
          )}

          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Ingredient</th>
                  <th className="w-24 px-2 py-2 text-right font-medium">Qty (g)</th>
                  <th className="w-28 px-2 py-2 text-right font-medium">
                    <span className="inline-flex items-center gap-1">
                      Protein/100g <Lock className="size-3" aria-label="locked from Master Data" />
                    </span>
                  </th>
                  <th className="w-24 px-2 py-2 text-right font-medium">g protein</th>
                  <th className="w-20 px-2 py-2 text-right font-medium">kcal</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {draft.ingredients.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                      Search above or paste an ingredient list to start this recipe.
                    </td>
                  </tr>
                )}
                {draft.ingredients.map((i) => {
                  const p100 = i.nutrients.protein_g ?? 0;
                  return (
                    <tr key={i.key} className="border-t border-border">
                      <td className="px-3 py-1.5">{i.name}</td>
                      <td className="px-2 py-1.5 text-right">
                        <input
                          type="number"
                          min={0}
                          step="any"
                          value={i.grams}
                          onChange={(e) => updateGrams(i.key, Number(e.target.value))}
                          aria-label={`Quantity of ${i.name} in grams`}
                          className="w-20 rounded-md border border-input bg-background px-2 py-1 text-right text-sm tabular-nums"
                        />
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                        {fmt(p100, 1)}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        {fmt((p100 * i.grams) / 100, 2)}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                        {Math.round(((i.nutrients.kcal ?? 0) * i.grams) / 100)}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <button
                          onClick={() => remove(i.key)}
                          aria-label={`Remove ${i.name}`}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {draft.ingredients.length > 0 && (
                <tfoot className="border-t border-border bg-secondary/30 text-sm font-medium">
                  <tr>
                    <td className="px-3 py-1.5">Dry batch total</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {fmt(totals.totalGrams, 0)}
                    </td>
                    <td />
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {fmt(totals.nutrients.protein_g, 2)}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {fmt(totals.nutrients.kcal, 0)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          <div>
            <label className="text-sm font-medium" htmlFor="prep">
              Preparation notes
            </label>
            <textarea
              id="prep"
              rows={3}
              value={draft.prepNotes}
              onChange={(e) => setDraft((d) => ({ ...d, prepNotes: e.target.value }))}
              placeholder="Roast flours, cook in water 8–10 min, add milk powder off heat, cool to lukewarm."
              className={field}
            />
          </div>

          {recipeId && (
            <p className="text-xs text-muted-foreground">
              Editing a saved recipe.{" "}
              <Link
                to="/recipes/$id"
                params={{ id: recipeId }}
                className="text-primary hover:underline"
              >
                Open the spec sheet
              </Link>
              .
            </p>
          )}
        </div>

        <ResultsPanel totals={totals} flags={flags} serving={serving} />
      </div>

      {pasteOpen && (
        <PasteIngredientsDialog
          onClose={() => setPasteOpen(false)}
          onAdd={(rows) => {
            setDraft((d) => ({
              ...d,
              ingredients: [...d.ingredients, ...rows.map((r) => toRow(r.food, r.grams))],
            }));
            toast.success(`Added ${rows.length} ingredient${rows.length === 1 ? "" : "s"}`);
          }}
          onCustom={(name) => {
            setPasteOpen(false);
            setCustomOpen({ name });
          }}
        />
      )}
      {recipeActions.dialogs}
      <ConfirmDialog
        open={confirmUpdate}
        title="Overwrite recipe?"
        description="This will overwrite the recipe."
        confirmLabel="Update"
        onConfirm={() => {
          setConfirmUpdate(false);
          save.mutate();
        }}
        onCancel={() => setConfirmUpdate(false)}
      />
    </div>
  );
}
