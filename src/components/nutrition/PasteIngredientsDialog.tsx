import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ClipboardPaste, X } from "lucide-react";

import { masterItemsQuery, masterToFood } from "@/lib/master";
import type { FoodItem } from "@/lib/nutrition/food-catalog";
import { parseIngredientText, resolveLines, type ResolvedLine } from "@/lib/nutrition/parser";
import { cn } from "@/lib/utils";

/**
 * "Paste ingredients" — free text -> parsed rows -> resolved against Master Data.
 * Unresolved rows can be sent to the custom drawer.
 */
export function PasteIngredientsDialog({
  onClose,
  onAdd,
  onCustom,
}: {
  onClose: () => void;
  onAdd: (rows: { food: FoodItem; grams: number }[]) => void;
  onCustom: (name: string) => void;
}) {
  const master = useQuery(masterItemsQuery());
  const [text, setText] = useState("");
  const [overrides, setOverrides] = useState<Record<number, FoodItem | null>>({});

  const foods = useMemo(
    () => (master.data ?? []).filter((m) => m.is_active).map(masterToFood),
    [master.data],
  );
  const resolved: ResolvedLine[] = useMemo(
    () => resolveLines(parseIngredientText(text), foods),
    [text, foods],
  );
  const rows = resolved.map((r, i) => ({ ...r, food: i in overrides ? overrides[i]! : r.food }));
  // Merge repeats of the same ingredient after unit normalisation.
  const ready = Object.values(
    rows
      .filter((r) => r.food)
      .reduce<Record<string, { food: FoodItem; grams: number }>>((acc, r) => {
        const id = r.food!.id;
        acc[id] = { food: r.food!, grams: (acc[id]?.grams ?? 0) + (r.qty ?? 0) };
        return acc;
      }, {}),
  );

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-foreground/30 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Paste ingredients"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-border bg-card p-5 shadow-lg sm:rounded-2xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
            <ClipboardPaste className="size-4" /> Paste ingredients
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="size-5" />
          </button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          One per line or comma-separated, e.g.{" "}
          <code>1/2 cup ragi, 15g moong dal, 2 tbsp ghee, rice 20</code>. Names are matched against
          Master Data (aliases like ragi, moong, badam understood; cups, tbsp, ml and fractions are
          converted to grams).
        </p>
        <textarea
          autoFocus
          rows={4}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="mt-3 w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-ring"
          placeholder="25 g ragi&#10;15 g moong dal&#10;20 g rice"
        />

        {rows.length > 0 && (
          <table className="mt-3 w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="py-1">Typed</th>
                <th className="py-1">Matched to</th>
                <th className="py-1 text-right">g</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="py-1.5 pr-2 text-muted-foreground">{r.raw}</td>
                  <td className="py-1.5 pr-2">
                    <select
                      value={r.food?.id ?? ""}
                      onChange={(e) => {
                        const f = foods.find((x) => x.id === e.target.value) ?? null;
                        setOverrides((o) => ({ ...o, [i]: f }));
                      }}
                      className={cn(
                        "w-full rounded-md border border-input bg-background px-2 py-1 text-sm",
                        !r.food && "border-destructive/60",
                      )}
                    >
                      <option value="">— pick or add custom —</option>
                      {foods.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                    {!r.food && (
                      <button
                        type="button"
                        onClick={() => onCustom(r.name)}
                        className="mt-1 text-xs text-primary hover:underline"
                      >
                        Add “{r.name}” as custom
                      </button>
                    )}
                    {r.food && r.via && r.via !== "exact" && (
                      <span className="ml-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                        via {r.via}
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">
                    {r.qty ?? 0}
                    {r.approx && (
                      <span className="ml-1 text-[10px] uppercase text-muted-foreground">
                        approx.
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-border px-3 py-1.5 text-sm">
            Cancel
          </button>
          <button
            disabled={ready.length === 0}
            onClick={() => {
              onAdd(ready);
              onClose();
            }}
            className="rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            Add {ready.length} ingredient{ready.length === 1 ? "" : "s"}
          </button>
        </div>
      </div>
    </div>
  );
}
