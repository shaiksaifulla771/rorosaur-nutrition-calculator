import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useDebounce } from "@/hooks/useDebounce";
import { useMemo, useState } from "react";
import { Pin } from "lucide-react";

import { recipeFullQuery, type RecipeWithVersion } from "@/lib/recipes";
import { AGE_BANDS, AMINO_LABELS, type AgeBand } from "@/lib/nutrition/reference";
import { fmt } from "@/lib/nutrition/calc";
import { RowActionsMenu } from "@/components/RowActionsMenu";
import { SHOW_AAS_SCORE } from "@/lib/flags";
import { useRecipeActions } from "@/components/recipes/useRecipeActions";
import { cn } from "@/lib/utils";

type SortKey = "name" | "updated_at" | "aas" | "kcal" | "project" | "pinned";

export function RecipeTable({
  recipes,
  loading,
  showProject = true,
  showFilters = true,
  compact = false,
}: {
  recipes: RecipeWithVersion[];
  loading?: boolean;
  showProject?: boolean;
  showFilters?: boolean;
  /** fewer columns — used inside expandable project rows */
  compact?: boolean;
}) {
  const { actionsFor, dialogs, togglePin } = useRecipeActions();
  const queryClient = useQueryClient();
  /** Warm the recipe cache so clicking through opens instantly. */
  const prefetch = (id: string) => void queryClient.prefetchQuery(recipeFullQuery(id));
  const navigate = useNavigate();
  /** Whole-row open, matching project rows. Interactive children stop propagation. */
  const openRecipe = (id: string) => void navigate({ to: "/recipes/$id", params: { id } });
  const [filter, setFilter] = useState("");
  const debouncedFilter = useDebounce(filter, 250);
  const [band, setBand] = useState<AgeBand | "all">("all");
  const [sort, setSort] = useState<SortKey>("updated_at");
  const [asc, setAsc] = useState(false);

  const rows = useMemo(() => {
    const list = recipes.filter(
      (r) =>
        r.name.toLowerCase().includes(debouncedFilter.toLowerCase()) &&
        (band === "all" || r.age_band === band),
    );
    const value = (r: RecipeWithVersion) => {
      if (sort === "name") return r.name.toLowerCase();
      if (sort === "project") return r.project?.name.toLowerCase() ?? "";
      if (sort === "aas") return r.current?.aas_score ?? -1;
      if (sort === "kcal") return r.current?.total_calories ?? -1;
      if (sort === "pinned") return r.is_pinned ? 1 : 0;
      return r.updated_at;
    };
    return [...list].sort((a, b) => {
      const av = value(a);
      const bv = value(b);
      if (av === bv) return 0;
      return (av < bv ? -1 : 1) * (asc ? 1 : -1);
    });
  }, [recipes, debouncedFilter, band, sort, asc]);

  const toggleSort = (key: SortKey) => {
    if (sort === key) setAsc((v) => !v);
    else {
      setSort(key);
      setAsc(key === "name" || key === "project");
    }
  };

  return (
    <div className="space-y-4">
      {showFilters && (
        <div className="no-print flex flex-wrap gap-3">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by name"
            className="w-full max-w-xs rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <select
            value={band}
            onChange={(e) => setBand(e.target.value as AgeBand | "all")}
            className="rounded-lg border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="all">All age bands</option>
            {AGE_BANDS.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading recipes…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <p className="text-muted-foreground">No recipes here yet.</p>
          <Link
            to="/builder"
            className="mt-3 inline-block text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Create recipe
          </Link>
        </div>
      ) : (
        <>
          <div
            className={cn(
              "hidden overflow-x-auto md:block",
              !compact && "rounded-xl border border-border bg-card",
            )}
          >
            <table className="w-full text-sm">
              <thead className="bg-secondary/80 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <Th className="w-8" onClick={() => toggleSort("pinned")}>
                    <Pin className="size-3.5" aria-label="Pinned" />
                  </Th>
                  <Th onClick={() => toggleSort("name")}>Name</Th>
                  {showProject && <Th onClick={() => toggleSort("project")}>Project</Th>}
                  <Th>Reference</Th>
                  {!compact && <Th className="text-right">Dry g</Th>}
                  {!compact && <Th className="text-right">Cooked g</Th>}
                  <Th className="text-right" onClick={() => toggleSort("kcal")}>
                    kcal
                  </Th>
                  <Th className="text-right">Protein g</Th>
                  {SHOW_AAS_SCORE && (
                    <Th className="text-right" onClick={() => toggleSort("aas")}>
                      AAS
                    </Th>
                  )}
                  <Th>Flags</Th>
                  <Th onClick={() => toggleSort("updated_at")}>Updated</Th>
                  <Th className="w-12 text-right">
                    <span className="sr-only">Actions</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    role="link"
                    tabIndex={0}
                    onClick={() => openRecipe(r.id)}
                    onMouseEnter={() => prefetch(r.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openRecipe(r.id);
                      }
                    }}
                    className="cursor-pointer border-t border-border transition-colors hover:bg-secondary/40"
                  >
                    <td className="px-3 py-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          void togglePin(r);
                        }}
                        aria-label={r.is_pinned ? "Unpin" : "Pin"}
                        aria-pressed={r.is_pinned}
                        title={r.is_pinned ? "Unpin from dashboard" : "Pin to dashboard"}
                        className={cn(
                          "transition-colors",
                          r.is_pinned
                            ? "text-primary"
                            : "text-muted-foreground/40 hover:text-foreground",
                        )}
                      >
                        <Pin className={cn("size-4", r.is_pinned && "fill-current")} />
                      </button>
                    </td>
                    <td className="px-3 py-2 font-medium">
                      <Link
                        to="/recipes/$id"
                        params={{ id: r.id }}
                        onMouseEnter={() => prefetch(r.id)}
                        onFocus={() => prefetch(r.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="hover:underline"
                      >
                        {r.name}
                      </Link>
                    </td>
                    {showProject && (
                      <td className="px-3 py-2 text-muted-foreground">
                        {r.project ? (
                          <Link
                            to="/projects/$id"
                            params={{ id: r.project.id }}
                            onClick={(e) => e.stopPropagation()}
                            className="hover:underline"
                          >
                            {r.project.name}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                    )}
                    <td className="px-3 py-2 text-muted-foreground">
                      {AGE_BANDS.find((b) => b.value === r.age_band)?.label ?? r.age_band}
                    </td>
                    {!compact && (
                      <td className="px-3 py-2 text-right tabular-nums">
                        {r.current?.totals?.totalGrams != null
                          ? fmt(r.current.totals.totalGrams, 0)
                          : "–"}
                      </td>
                    )}
                    {!compact && (
                      <td className="px-3 py-2 text-right tabular-nums">
                        {r.current?.actual_output_g ?? "–"}
                      </td>
                    )}
                    <td className="px-3 py-2 text-right tabular-nums">
                      {r.current?.total_calories ?? "–"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmt(r.current?.totals?.nutrients?.protein_g)}
                    </td>
                    {SHOW_AAS_SCORE && (
                      <td className="px-3 py-2 text-right tabular-nums">
                        <AasCell r={r} />
                      </td>
                    )}
                    <td className="px-3 py-2">
                      <FlagPills count={r.current?.safety_flags ?? []} />
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {new Date(r.updated_at).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <RowActionsMenu actions={actionsFor(r)} label={`Actions for ${r.name}`} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 md:hidden">
            {rows.map((r) => (
              <div key={r.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <Link
                    to="/recipes/$id"
                    params={{ id: r.id }}
                    onTouchStart={() => prefetch(r.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="min-w-0 flex-1"
                  >
                    <span className="font-medium">{r.name}</span>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {showProject && r.project ? `${r.project.name} · ` : ""}
                      {AGE_BANDS.find((b) => b.value === r.age_band)?.label} ·{" "}
                      {r.current?.total_calories ?? "–"} kcal
                    </div>
                  </Link>
                  <div className="flex items-center gap-1">
                    {SHOW_AAS_SCORE && (
                      <span className="text-sm tabular-nums">
                        <AasCell r={r} />
                      </span>
                    )}
                    <RowActionsMenu actions={actionsFor(r)} label={`Actions for ${r.name}`} />
                  </div>
                </div>
                <div className="mt-2">
                  <FlagPills count={r.current?.safety_flags ?? []} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      {dialogs}
    </div>
  );
}

export function AasCell({ r }: { r: RecipeWithVersion }) {
  const a = r.current?.aas_score;
  if (a == null) return <span className="text-muted-foreground">–</span>;
  const lim = r.current?.totals?.limitingAminoAcid;
  return (
    <span
      className={cn("font-medium", a >= 100 ? "text-success" : "text-warning")}
      title={lim ? `Limiting: ${AMINO_LABELS[lim]}` : "No limiting amino acid"}
    >
      {(a / 100).toFixed(2)}
    </span>
  );
}

function Th({
  children,
  onClick,
  className = "",
}: {
  children?: React.ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <th className={`px-3 py-2 font-medium ${className}`}>
      {onClick ? (
        <button
          onClick={onClick}
          className="inline-flex items-center uppercase tracking-wide hover:text-foreground"
        >
          {children}
        </button>
      ) : (
        children
      )}
    </th>
  );
}

export function FlagPills({ count }: { count: { severity: string }[] }) {
  const blocking = count.filter((f) => f.severity === "blocking").length;
  const advisory = count.length - blocking;
  if (count.length === 0)
    return (
      <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
        clear
      </span>
    );
  return (
    <span className="flex gap-1">
      {blocking > 0 && (
        <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-xs text-destructive">
          {blocking} blocking
        </span>
      )}
      {advisory > 0 && (
        <span className="rounded-full bg-accent/40 px-2 py-0.5 text-xs text-accent-foreground">
          {advisory} advisory
        </span>
      )}
    </span>
  );
}
