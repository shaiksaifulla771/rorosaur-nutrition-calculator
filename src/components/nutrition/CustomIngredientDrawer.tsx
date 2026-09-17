import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";

import {
  createMasterItem,
  masterFieldErrors,
  MASTER_CATEGORIES,
  REQUIRED_NUTRIENTS,
  type MasterItemInput,
} from "@/lib/master";
import type { FoodItem } from "@/lib/nutrition/food-catalog";
import { emptyAmino } from "@/lib/nutrition/calc";
import {
  AMINO_LABELS,
  NUTRIENT_LABELS,
  type AminoAcidKey,
  type AminoAcids,
  type NutrientKey,
} from "@/lib/nutrition/reference";

const MACROS: NutrientKey[] = [
  "kcal",
  "protein_g",
  "fat_g",
  "carb_g",
  "fiber_g",
  "sugar_g",
  "sodium_mg",
];
const MICROS: NutrientKey[] = [
  "calcium_mg",
  "iron_mg",
  "zinc_mg",
  "vita_ug",
  "vitc_mg",
  "vitd_ug",
  "folate_ug",
  "vitb12_ug",
];
const AMINOS = Object.keys(AMINO_LABELS) as AminoAcidKey[];

/**
 * Inline "+ Custom" drawer (PRD §4.2). Registers the ingredient in Master Data and
 * hands it back to the calculator immediately.
 */
export function CustomIngredientDrawer({
  initialName = "",
  onClose,
  onAdded,
}: {
  initialName?: string;
  onClose: () => void;
  onAdded: (food: FoodItem, grams: number) => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<MasterItemInput>({
    name: initialName,
    category: "Other",
    quantity_g: 10,
    nutrients: {},
    amino_acids: {},
    notes: "",
    is_active: true,
    source: "custom",
  });
  const grams = Number(form.quantity_g);

  const setN = (k: NutrientKey, v: string) =>
    setForm((f) => ({
      ...f,
      nutrients: { ...f.nutrients, [k]: v === "" ? undefined : Number(v) },
    }));
  const setA = (k: AminoAcidKey, v: string) =>
    setForm((f) => ({
      ...f,
      amino_acids: {
        ...f.amino_acids,
        [k]: v === "" ? undefined : Number(v),
      } as Partial<AminoAcids>,
    }));

  const save = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("Name is required");
      const id = await createMasterItem(form);
      return id;
    },
    onSuccess: async (id) => {
      await queryClient.invalidateQueries({ queryKey: ["master-items"] });
      onAdded(
        {
          id: `master:${id}`,
          name: form.name.trim(),
          nutrients: form.nutrients,
          amino: { ...emptyAmino(), ...stripUndefined(form.amino_acids) },
          category: form.category,
          source: "custom",
        },
        grams,
      );
      toast.success("Added to recipe and registered in Master Data");
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const errors = masterFieldErrors(form);
  const invalid = Object.keys(errors).length > 0;
  const required = (k: string) => (REQUIRED_NUTRIENTS as readonly string[]).includes(k);
  const err = (k: string) =>
    errors[k] ? <span className="mt-1 block text-destructive">{errors[k]}</span> : null;

  const field =
    "mt-1 w-full rounded-lg border border-input bg-background px-2 py-1.5 text-sm tabular-nums outline-none focus:ring-2 focus:ring-ring";

  return (
    <div
      className="rounded-xl border border-primary/40 bg-card p-4"
      role="dialog"
      aria-label="Custom ingredient"
    >
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display text-base font-semibold">Custom ingredient</h3>
          <p className="text-xs text-muted-foreground">
            Per 100 g values. Saved to Master Data and added to this recipe.
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close custom ingredient"
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="size-5" />
        </button>
      </div>

      <form
        className="mt-3 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-[1.6fr_1fr_0.7fr]">
          <label className="text-xs font-medium">
            Name <span className="text-destructive">*</span>
            <input
              aria-invalid={Boolean(errors["name"])}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              className={field}
            />
            {err("name")}
          </label>
          <label className="text-xs font-medium">
            Category <span className="text-destructive">*</span>
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className={field}
            >
              {MASTER_CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium">
            Qty (g) <span className="text-destructive">*</span>
            <input
              type="number"
              min={0}
              step="any"
              value={form.quantity_g}
              onChange={(e) => setForm({ ...form, quantity_g: e.target.value })}
              required
              aria-invalid={Boolean(errors["quantity_g"])}
              className={field}
            />
            {err("quantity_g")}
          </label>
        </div>

        <fieldset>
          <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Proximates
          </legend>
          <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {MACROS.map((k) => (
              <label key={k} className="text-[11px] text-muted-foreground">
                {NUTRIENT_LABELS[k]}
                {required(k) && <span className="text-destructive"> *</span>}
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={form.nutrients[k] ?? ""}
                  onChange={(e) => setN(k, e.target.value)}
                  aria-invalid={Boolean(errors[k])}
                  className={field}
                />
                {err(k)}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Micronutrients per 100 g
          </legend>
          <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {MICROS.map((k) => (
              <label key={k} className="text-[11px] text-muted-foreground">
                {NUTRIENT_LABELS[k]}
                {required(k) && <span className="text-destructive"> *</span>}
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={form.nutrients[k] ?? ""}
                  onChange={(e) => setN(k, e.target.value)}
                  aria-invalid={Boolean(errors[k])}
                  className={field}
                />
                {err(k)}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Amino acids (mg / g protein, optional)
          </legend>
          <div className="mt-1 grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-9">
            {AMINOS.map((k) => (
              <label key={k} className="text-[11px] text-muted-foreground">
                {k.toUpperCase()}
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={form.amino_acids[k] ?? ""}
                  onChange={(e) => setA(k, e.target.value)}
                  className={field}
                />
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-3 py-1.5 text-sm"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={save.isPending || invalid}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {save.isPending && <Loader2 className="size-4 animate-spin" />}
            Add to recipe
          </button>
        </div>
      </form>
    </div>
  );
}

function stripUndefined<T extends Record<string, unknown>>(o: T): T {
  return Object.fromEntries(
    Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ""),
  ) as T;
}
