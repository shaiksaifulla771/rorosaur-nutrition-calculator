import { Loader2 } from "lucide-react";

import {
  MASTER_CATEGORIES,
  masterFieldErrors,
  REQUIRED_NUTRIENTS,
  type MasterItem,
  type MasterItemInput,
} from "@/lib/master";
import {
  AMINO_LABELS,
  NUTRIENT_LABELS,
  type AminoAcidKey,
  type AminoAcids,
  type NutrientKey,
} from "@/lib/nutrition/reference";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const NUTRIENT_KEYS = Object.keys(NUTRIENT_LABELS) as NutrientKey[];
const AMINO_KEYS = Object.keys(AMINO_LABELS) as AminoAcidKey[];

export const emptyMasterForm = (): MasterItemInput => ({
  name: "",
  category: "Other",
  quantity_g: 100,
  nutrients: {},
  amino_acids: {},
  notes: "",
  is_active: true,
  source: "custom",
});

export const masterItemToForm = (item: MasterItem): MasterItemInput => ({
  name: item.name,
  category: item.category,
  quantity_g: item.quantity_g,
  nutrients: { ...item.nutrients },
  amino_acids: { ...item.amino_acids },
  notes: item.notes ?? "",
  is_active: item.is_active,
  source: item.source,
});

export function ItemEditorDialog({
  open,
  title,
  form,
  onChange,
  onClose,
  onSave,
  saving,
}: {
  open: boolean;
  title: string;
  form: MasterItemInput;
  onChange: (f: MasterItemInput) => void;
  onClose: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  const setNutrient = (k: NutrientKey, v: string) =>
    onChange({ ...form, nutrients: { ...form.nutrients, [k]: v === "" ? undefined : Number(v) } });
  const setAmino = (k: AminoAcidKey, v: string) =>
    onChange({
      ...form,
      amino_acids: {
        ...form.amino_acids,
        [k]: v === "" ? undefined : Number(v),
      } as Partial<AminoAcids>,
    });

  const errors = masterFieldErrors(form);
  const invalid = Object.keys(errors).length > 0;
  const required = (k: string) => (REQUIRED_NUTRIENTS as readonly string[]).includes(k);

  const field =
    "mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">{title}</DialogTitle>
          <DialogDescription>
            Nutrients per 100 g edible portion; amino acids in mg per g protein.
          </DialogDescription>
        </DialogHeader>
        <form
          id="master-item-form"
          onSubmit={(e) => {
            e.preventDefault();
            onSave();
          }}
          className="space-y-5"
        >
          <div className="grid gap-3 sm:grid-cols-[1.5fr_1fr_0.7fr_auto]">
            <label className="text-sm font-medium">
              Name <span className="text-destructive">*</span>
              <input
                value={form.name}
                onChange={(e) => onChange({ ...form, name: e.target.value })}
                required
                aria-invalid={Boolean(errors["name"])}
                className={field}
              />
              {errors["name"] && (
                <span className="mt-1 block text-xs font-normal text-destructive">
                  {errors["name"]}
                </span>
              )}
            </label>
            <label className="text-sm font-medium">
              Category <span className="text-destructive">*</span>
              <select
                value={form.category}
                onChange={(e) => onChange({ ...form, category: e.target.value })}
                className={field}
              >
                {MASTER_CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium">
              Qty (g) <span className="text-destructive">*</span>
              <input
                type="number"
                min={0}
                step="any"
                value={form.quantity_g}
                onChange={(e) => onChange({ ...form, quantity_g: e.target.value })}
                required
                aria-invalid={Boolean(errors["quantity_g"])}
                className={field}
              />
              {errors["quantity_g"] && (
                <span className="mt-1 block text-xs font-normal text-destructive">
                  {errors["quantity_g"]}
                </span>
              )}
            </label>
            <label className="flex items-end gap-2 pb-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={form.is_active ?? true}
                onChange={(e) => onChange({ ...form, is_active: e.target.checked })}
                className="size-4"
              />
              Active
            </label>
          </div>

          <fieldset>
            <legend className="text-sm font-semibold">Nutrients per 100 g</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-3 md:grid-cols-4">
              {NUTRIENT_KEYS.map((k) => (
                <label key={k} className="text-xs text-muted-foreground">
                  {NUTRIENT_LABELS[k]}
                  {required(k) && <span className="text-destructive"> *</span>}
                  <input
                    type="number"
                    step="any"
                    min={0}
                    value={form.nutrients[k] ?? ""}
                    onChange={(e) => setNutrient(k, e.target.value)}
                    aria-invalid={Boolean(errors[k])}
                    className={`${field} tabular-nums`}
                  />
                  {errors[k] && <span className="mt-1 block text-destructive">{errors[k]}</span>}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-semibold">Amino acids (mg per g protein)</legend>
            <p className="text-xs text-muted-foreground">
              Leave blank if unknown — the amino-acid score treats missing values as zero.
            </p>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {AMINO_KEYS.map((k) => (
                <label key={k} className="text-xs text-muted-foreground">
                  {AMINO_LABELS[k]}
                  <input
                    type="number"
                    step="any"
                    min={0}
                    value={form.amino_acids[k] ?? ""}
                    onChange={(e) => setAmino(k, e.target.value)}
                    className={`${field} tabular-nums`}
                  />
                </label>
              ))}
            </div>
          </fieldset>

          <label className="block text-sm font-medium">
            Notes
            <textarea
              rows={2}
              value={form.notes ?? ""}
              onChange={(e) => onChange({ ...form, notes: e.target.value })}
              className={field}
            />
          </label>
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="master-item-form" disabled={saving || invalid}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            Save ingredient
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
