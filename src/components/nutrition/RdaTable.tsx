import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, Info, Loader2, Pencil, RotateCcw, Save, X } from "lucide-react";
import { toast } from "sonner";

import { DEFAULT_RDA, rdaQuery, resetRdaOverride, saveRdaOverride } from "@/lib/rda";
import {
  AGE_BANDS,
  NUTRIENT_LABELS,
  type AgeBand,
  type NutrientKey,
  type Nutrients,
} from "@/lib/nutrition/reference";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { RouteErrorCard, RoutePending } from "@/components/RouteStates";

/** Primary ICMR-NIN nutrients shown first, in the order requested. */
const PRIMARY: NutrientKey[] = [
  "kcal",
  "protein_g",
  "iron_mg",
  "calcium_mg",
  "zinc_mg",
  "vita_ug",
  "vitc_mg",
  "vitd_ug",
  "folate_ug",
  "vitb12_ug",
];
const MORE: NutrientKey[] = ["fat_g", "carb_g", "fiber_g", "sugar_g", "sodium_mg"];

const UNIT: Record<NutrientKey, string> = {
  kcal: "kcal",
  protein_g: "g",
  fat_g: "g",
  carb_g: "g",
  fiber_g: "g",
  sugar_g: "g",
  sodium_mg: "mg",
  iron_mg: "mg",
  calcium_mg: "mg",
  zinc_mg: "mg",
  vitc_mg: "mg",
  vita_ug: "mcg RAE",
  folate_ug: "mcg",
  vitd_ug: "mcg",
  vitb12_ug: "mcg",
};

const shortLabel = (k: NutrientKey) => NUTRIENT_LABELS[k].replace(/\s*\(.*\)$/, "");

export function RdaTable() {
  const queryClient = useQueryClient();
  const rda = useQuery(rdaQuery());
  const [band, setBand] = useState<AgeBand>("1-3y");
  const [editing, setEditing] = useState<NutrientKey | null>(null);
  const [drafts, setDrafts] = useState<Partial<Record<NutrientKey, string>>>({});
  const [inputVal, setInputVal] = useState("");
  const [showMore, setShowMore] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    setDrafts({});
    setEditing(null);
  }, [band]);

  const overrides = rda.data?.[band] ?? {};
  const defaults = DEFAULT_RDA[band];

  const effective = (k: NutrientKey): number | undefined => {
    const d = drafts[k];
    if (d !== undefined && d !== "") return Number(d);
    return overrides[k] ?? defaults[k];
  };

  const dirtyCount = useMemo(() => Object.keys(drafts).length, [drafts]);

  const persist = useMutation({
    mutationFn: async () => {
      const next: Nutrients = { ...overrides };
      for (const [k, v] of Object.entries(drafts) as [NutrientKey, string][]) {
        const n = Number(v);
        if (v === "" || Number.isNaN(n) || n < 0)
          throw new Error(`Invalid value for ${shortLabel(k)}`);
        if (n === defaults[k]) delete next[k];
        else next[k] = n;
      }
      if (Object.keys(next).length === 0) await resetRdaOverride(band);
      else await saveRdaOverride(band, next);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["rda"] });
      setDrafts({});
      setEditing(null);
      toast.success("RDA settings saved");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const reset = useMutation({
    mutationFn: () => resetRdaOverride(band),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["rda"] });
      setDrafts({});
      setEditing(null);
      setConfirmReset(false);
      toast.success("Reset to ICMR-NIN defaults");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Reset failed"),
  });

  const startEdit = (k: NutrientKey) => {
    setEditing(k);
    setInputVal(String(effective(k) ?? ""));
  };
  const commitRow = () => {
    if (!editing) return;
    const n = Number(inputVal);
    if (inputVal === "" || Number.isNaN(n) || n < 0) {
      toast.error("Enter a non-negative number");
      return;
    }
    setDrafts((d) => ({ ...d, [editing]: inputVal }));
    setEditing(null);
  };

  const overriddenCount = Object.keys(overrides).length;

  const renderRow = (k: NutrientKey) => {
    const def = defaults[k];
    const cur = effective(k);
    const isEditing = editing === k;
    const isDirty = drafts[k] !== undefined;
    const isOverridden = isDirty
      ? Number(drafts[k]) !== def
      : overrides[k] !== undefined && overrides[k] !== def;
    return (
      <TableRow key={k} className={cn(isDirty && "bg-primary/5")}>
        <TableCell className="font-medium">
          {shortLabel(k)}
          {isOverridden && (
            <span className="ml-2 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
              custom
            </span>
          )}
        </TableCell>
        <TableCell className="text-right tabular-nums">
          {isEditing ? (
            <input
              autoFocus
              type="number"
              min={0}
              step="any"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRow();
                if (e.key === "Escape") setEditing(null);
              }}
              aria-label={`${shortLabel(k)} value`}
              className="w-28 rounded-md border border-primary bg-background px-2 py-1 text-right text-sm tabular-nums outline-none ring-2 ring-ring/40"
            />
          ) : (
            <span className={cn(isOverridden && "font-semibold text-primary")}>{cur ?? "–"}</span>
          )}
          {isOverridden && def !== undefined && !isEditing && (
            <span className="ml-2 text-[11px] text-muted-foreground">default {def}</span>
          )}
        </TableCell>
        <TableCell className="text-muted-foreground">{UNIT[k]}</TableCell>
        <TableCell className="text-right">
          {isEditing ? (
            <div className="flex justify-end gap-1">
              <Button
                size="sm"
                variant="ghost"
                className="size-8 p-0"
                onClick={commitRow}
                aria-label="Apply"
              >
                <Check className="size-4 text-primary" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="size-8 p-0"
                onClick={() => setEditing(null)}
                aria-label="Cancel"
              >
                <X className="size-4" />
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => startEdit(k)}
              aria-label={`Edit ${shortLabel(k)}`}
            >
              <Pencil className="size-3.5" /> Edit
            </Button>
          )}
        </TableCell>
      </TableRow>
    );
  };

  if (rda.isLoading) return <RoutePending />;
  if (rda.error) return <RouteErrorCard error={rda.error} reset={() => void rda.refetch()} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={band} onValueChange={(v) => setBand(v as AgeBand)}>
          <TabsList>
            {AGE_BANDS.map((b) => (
              <TabsTrigger key={b.value} value={b.value}>
                {b.label.replace(" (ICMR-NIN)", "")}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setConfirmReset(true)}
            disabled={overriddenCount === 0 && dirtyCount === 0}
          >
            <RotateCcw className="size-4" /> Reset to ICMR defaults
          </Button>
          <Button onClick={() => persist.mutate()} disabled={dirtyCount === 0 || persist.isPending}>
            {persist.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            Save RDA Settings{dirtyCount > 0 ? ` (${dirtyCount})` : ""}
          </Button>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-border bg-secondary/40 px-4 py-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0 text-primary" />
        <p>
          These values are based on ICMR-NIN 2020 and can be customized for recipe trials. Your
          edits apply only to your account and are used for every %RDA figure in the calculator,
          recipe pages and spec-sheet PDFs.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-secondary/60 hover:bg-secondary/60">
              <TableHead>Nutrient</TableHead>
              <TableHead className="text-right">Current value</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead className="w-28 text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {PRIMARY.map(renderRow)}
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={4} className="p-0">
                <button
                  type="button"
                  onClick={() => setShowMore((s) => !s)}
                  className="flex w-full items-center gap-2 px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-secondary/40"
                  aria-expanded={showMore}
                >
                  <ChevronDown
                    className={cn("size-4 transition-transform", showMore && "rotate-180")}
                  />
                  {showMore ? "Hide" : "Show"} macronutrient & sodium references ({MORE.length})
                </button>
              </TableCell>
            </TableRow>
            {showMore && MORE.map(renderRow)}
          </TableBody>
        </Table>
      </div>

      <ConfirmDialog
        open={confirmReset}
        title="Reset this age band to ICMR-NIN defaults?"
        description="All your custom values for this band will be removed."
        confirmLabel="Reset"
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => reset.mutate()}
      />
    </div>
  );
}
