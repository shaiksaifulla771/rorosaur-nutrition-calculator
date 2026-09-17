import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Plus, Search } from "lucide-react";

import { searchFoods } from "@/lib/foods.functions";
import type { FoodItem } from "@/lib/nutrition/food-catalog";
import { rankFoods } from "@/lib/nutrition/parser";
import { masterItemsQuery, masterToFood } from "@/lib/master";
import { cn } from "@/lib/utils";

/**
 * Autocomplete ingredient picker: Master Data first (grouped by category), then the
 * external food API. Arrow keys move, Enter adds, Escape closes.
 */
export function FoodPicker({
  onAdd,
  autoFocus = false,
}: {
  onAdd: (food: FoodItem) => void;
  autoFocus?: boolean;
}) {
  const search = useServerFn(searchFoods);
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(term), 250);
    return () => clearTimeout(t);
  }, [term]);

  const master = useQuery(masterItemsQuery());
  const remote = useQuery({
    queryKey: ["foods", debounced],
    queryFn: () => search({ data: { query: debounced } }),
    enabled: debounced.trim().length >= 2,
  });

  const groups = useMemo(() => {
    const q = debounced.trim();
    const masterFoods = (master.data ?? []).filter((m) => m.is_active).map(masterToFood);
    const ranked = rankFoods(q, masterFoods, q ? 40 : 200);
    const byCat = new Map<string, FoodItem[]>();
    for (const f of ranked) {
      const c = f.category ?? "Other";
      if (!byCat.has(c)) byCat.set(c, []);
      byCat.get(c)!.push(f);
    }
    const out: { label: string; items: FoodItem[] }[] = [...byCat.entries()].map(
      ([label, items]) => ({ label, items }),
    );
    const have = new Set(ranked.map((f) => f.name.toLowerCase()));
    const external = (remote.data?.items ?? [])
      .filter((f) => !have.has(f.name.toLowerCase()))
      .slice(0, 15);
    if (external.length > 0) out.push({ label: "Food database", items: external });
    return out;
  }, [master.data, remote.data, debounced]);

  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  useEffect(() => setActive(0), [debounced]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const choose = (food: FoodItem) => {
    onAdd(food);
    setTerm("");
    setDebounced("");
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) setOpen(true);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, flat.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const f = flat[active];
      if (f) choose(f);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  let index = -1;

  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-lg border border-input bg-background px-3 py-2 focus-within:ring-2 focus-within:ring-ring">
        <Search className="size-4 text-muted-foreground" />
        <input
          autoFocus={autoFocus}
          value={term}
          onChange={(e) => {
            setTerm(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded={open}
          aria-controls="food-picker-list"
          aria-autocomplete="list"
          placeholder="Search ingredient (ragi, moong dal, milk powder…) — ↑↓ to move, Enter to add"
          className="w-full bg-transparent text-sm outline-none"
        />
        {remote.isFetching && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
      </div>

      {open && flat.length > 0 && (
        <ul
          id="food-picker-list"
          ref={listRef}
          role="listbox"
          className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-border bg-card p-1 shadow-lg"
        >
          {groups.map((g) => (
            <li key={g.label}>
              <div className="px-2 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {g.label}
              </div>
              <ul>
                {g.items.map((food) => {
                  index += 1;
                  const i = index;
                  return (
                    <li
                      key={food.id}
                      role="option"
                      aria-selected={i === active}
                      data-index={i}
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => choose(food)}
                      className={cn(
                        "flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm",
                        i === active ? "bg-secondary" : "hover:bg-secondary/60",
                      )}
                    >
                      <span className="truncate">
                        {food.name}
                        <span className="ml-2 text-xs tabular-nums text-muted-foreground">
                          {Math.round(food.nutrients.kcal ?? 0)} kcal ·{" "}
                          {(food.nutrients.protein_g ?? 0).toFixed(1)} g protein
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        {food.source && (
                          <span className="rounded-full bg-accent/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-accent-foreground">
                            {food.source}
                          </span>
                        )}
                        <Plus className="size-4 text-primary" />
                      </span>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}
      {open && flat.length === 0 && debounced.trim().length >= 2 && !remote.isFetching && (
        <div className="absolute z-20 mt-1 w-full rounded-xl border border-border bg-card p-3 text-sm text-muted-foreground shadow-lg">
          No match for “{debounced}”. Use <strong>+ Custom</strong> to add it to Master Data.
        </div>
      )}
    </div>
  );
}
