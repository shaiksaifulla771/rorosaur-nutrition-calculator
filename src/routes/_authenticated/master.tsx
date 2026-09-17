import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Copy,
  Eye,
  FileDown,
  Loader2,
  Lock,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  cloneMasterItem,
  createMasterItem,
  deleteMasterItem,
  MASTER_CATEGORIES,
  masterItemsQuery,
  setMasterPinned,
  updateMasterItem,
  type MasterItem,
  type MasterItemInput,
} from "@/lib/master";
import { CSV_MAX_ROWS, downloadText, exportFileName, masterItemsToCsv } from "@/lib/share";
import { fmtCell } from "@/lib/nutrition/calc";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useDebounce } from "@/hooks/useDebounce";
import { errorMessage, RouteErrorCard, RoutePending } from "@/components/RouteStates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useSession } from "@/hooks/useSession";
import { PageHeader, RowActionsMenu, type RowAction } from "@/components/RowActionsMenu";
import {
  ItemEditorDialog,
  emptyMasterForm,
  masterItemToForm,
} from "@/components/master/ItemEditor";
import { ConfirmDialog } from "@/components/ConfirmDialog";

export const Route = createFileRoute("/_authenticated/master")({
  head: () => ({
    meta: [
      { title: "Master Data — Rorosaur" },
      {
        name: "description",
        content:
          "Shared IFCT/USDA ingredient library plus your private custom ingredients: per-100 g nutrients and amino-acid profiles.",
      },
      { property: "og:title", content: "Master Data — Rorosaur" },
      { property: "og:description", content: "Manage the ingredient master catalog." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  errorComponent: RouteErrorCard,
  pendingComponent: RoutePending,
  component: MasterDataPage,
});

type Tab = "all" | "custom" | "builtin";

type InlineDraft = {
  name: string;
  category: string;
  protein_g: string;
  iron_mg: string;
  calcium_mg: string;
};

function toDraft(r: MasterItem): InlineDraft {
  const n = (v: number | undefined) => (v === undefined || v === null ? "" : String(v));
  return {
    name: r.name,
    category: r.category,
    protein_g: n(r.nutrients.protein_g),
    iron_mg: n(r.nutrients.iron_mg),
    calcium_mg: n(r.nutrients.calcium_mg),
  };
}

function parseNum(v: string, label: string): number | undefined {
  if (v.trim() === "") return undefined;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${label} must be a non-negative number`);
  return Math.round(n * 100) / 100;
}

/** Pick a "(Custom)" name that does not collide with an existing item in the visible library. */
function uniqueCopyName(base: string, existing: MasterItem[]): string {
  const taken = new Set(existing.map((i) => i.name.trim().toLowerCase()));
  const first = `${base} (Custom)`;
  if (!taken.has(first.toLowerCase())) return first;
  for (let n = 2; n < 100; n++) {
    const candidate = `${base} (Custom ${n})`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return `${base} (Custom ${Date.now()})`;
}

const logMutation = (action: string, detail: Record<string, unknown>) => {
  if (import.meta.env.DEV) console.debug(`[master] ${action}`, detail);
};

function MasterDataPage() {
  const { isAdmin } = useSession();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const items = useQuery(masterItemsQuery());
  const [filter, setFilter] = useState("");
  const debouncedFilter = useDebounce(filter, 250);
  const [category, setCategory] = useState<string>("all");
  const [tab, setTab] = useState<Tab>("all");
  const [editor, setEditor] = useState<{ form: MasterItemInput } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<MasterItem | null>(null);
  const [inline, setInline] = useState<{ id: string; draft: InlineDraft } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  useEffect(() => {
    const channel = supabase
      .channel("master-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "master_items" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["master-items"] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const all = useMemo(() => items.data ?? [], [items.data]);
  const customCount = all.filter((i) => !i.is_locked).length;
  const builtinCount = all.length - customCount;

  // Cancel an inline edit if the row vanished (deleted elsewhere / became locked).
  useEffect(() => {
    if (!inline) return;
    const row = all.find((i) => i.id === inline.id);
    if (!row || row.is_locked) setInline(null);
  }, [all, inline]);

  // Highlight fades after a few seconds.
  useEffect(() => {
    if (!highlightId) return;
    const t = setTimeout(() => setHighlightId(null), 4000);
    return () => clearTimeout(t);
  }, [highlightId]);

  const rows = useMemo(() => {
    const q = debouncedFilter.trim().toLowerCase();
    return all.filter(
      (i) =>
        (tab === "all" || (tab === "custom" ? !i.is_locked : i.is_locked)) &&
        (category === "all" || i.category === category) &&
        (!q || i.name.toLowerCase().includes(q)),
    );
  }, [all, tab, category, debouncedFilter]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["master-items"] });

  const create = useMutation({
    mutationFn: async () => {
      if (!editor) return;
      if (!editor.form.name.trim()) throw new Error("Name is required");
      return createMasterItem(editor.form);
    },
    onSuccess: async (id) => {
      logMutation("create ok", { id });
      await invalidate();
      toast.success("Ingredient added");
      setEditor(null);
      if (id) {
        setTab("custom");
        setHighlightId(id);
      }
    },
    onError: (e) => {
      logMutation("create failed", { error: errorMessage(e) });
      toast.error(errorMessage(e, "Save failed"));
    },
  });

  const saveInline = useMutation({
    mutationFn: async () => {
      if (!inline) return;
      const item = all.find((i) => i.id === inline.id);
      if (!item) throw new Error("Item no longer exists");
      if (item.is_locked) throw new Error("Built-in items are read-only");
      const d = inline.draft;
      if (!d.name.trim()) throw new Error("Name is required");
      const nutrients = { ...item.nutrients };
      const set = (k: "protein_g" | "iron_mg" | "calcium_mg", label: string) => {
        const v = parseNum(d[k], label);
        if (v === undefined) delete nutrients[k];
        else nutrients[k] = v;
      };
      set("protein_g", "Protein");
      set("iron_mg", "Iron");
      set("calcium_mg", "Calcium");
      await updateMasterItem(
        item.id,
        {
          name: d.name,
          category: d.category,
          quantity_g: item.quantity_g,
          nutrients,
          amino_acids: item.amino_acids,
          ...(item.notes ? { notes: item.notes } : {}),
          is_active: item.is_active,
        },
        // The quick-edit row only shows three nutrients; older items may miss
        // others, so we validate what is present and leave the rest untouched.
        { partialNutrients: true },
      );
      return item.id;
    },
    onSuccess: async (id) => {
      logMutation("update ok", { id });
      await invalidate();
      toast.success("Ingredient updated");
      setInline(null);
      if (id) setHighlightId(id);
    },
    onError: async (e) => {
      logMutation("update failed", { error: errorMessage(e) });
      toast.error(errorMessage(e, "Update failed"));
      // The row may have been removed or locked elsewhere — resync so the UI matches the database.
      await invalidate();
    },
  });

  const remove = useMutation({
    mutationFn: async () => {
      if (!pendingDelete) return;
      setBusyId(pendingDelete.id);
      await deleteMasterItem(pendingDelete.id);
      return pendingDelete.id;
    },
    onSuccess: async (id) => {
      logMutation("delete ok", { id });
      await invalidate();
      toast.success("Ingredient deleted");
    },
    onError: async (e) => {
      logMutation("delete failed", { error: errorMessage(e) });
      toast.error(errorMessage(e, "Delete failed"));
      await invalidate();
    },
    onSettled: () => {
      setBusyId(null);
      setPendingDelete(null);
    },
  });

  const clone = useMutation({
    mutationFn: async (item: MasterItem) => {
      setBusyId(item.id);
      return cloneMasterItem(item, uniqueCopyName(item.name, all));
    },
    onSuccess: async (id) => {
      logMutation("clone ok", { id });
      await invalidate();
      toast.success("Custom copy created — now editable under “Custom items”");
      setTab("custom");
      setFilter("");
      setCategory("all");
      setHighlightId(id);
    },
    onError: (e) => {
      logMutation("clone failed", { error: errorMessage(e) });
      toast.error(errorMessage(e, "Clone failed"));
    },
    onSettled: () => setBusyId(null),
  });

  const togglePin = useMutation({
    mutationFn: async (item: MasterItem) => {
      await setMasterPinned(item.id, !item.is_pinned);
      return !item.is_pinned;
    },
    onSuccess: async (pinned) => {
      await invalidate();
      toast.success(pinned ? "Pinned" : "Unpinned");
    },
    onError: (e) => toast.error(errorMessage(e, "Pin failed")),
  });

  const anyBusy = (id: string) => busyId === id || (saveInline.isPending && inline?.id === id);

  const startInlineEdit = (r: MasterItem) => {
    if (r.is_locked) {
      toast.error("Built-in items are read-only — clone it first");
      return;
    }
    setInline({ id: r.id, draft: toDraft(r) });
  };

  const exportCsv = () => {
    if (rows.length === 0) return;
    const truncated = rows.length > CSV_MAX_ROWS;
    downloadText(
      exportFileName(`rorosaur_master_${tab}_${new Date().toISOString().slice(0, 10)}`, "csv"),
      masterItemsToCsv(rows),
    );
    if (truncated)
      toast.warning(
        `Exported the first ${CSV_MAX_ROWS} of ${rows.length} rows — narrow the filter to export the rest`,
      );
    else toast.success(`CSV exported (${rows.length} rows)`);
  };

  const actionsFor = (r: MasterItem): RowAction[] => {
    const disabled = anyBusy(r.id);
    const view: RowAction = {
      label: "View",
      icon: Eye,
      disabled,
      onSelect: () => navigate({ to: "/master/$id", params: { id: r.id } }),
    };
    const pin: RowAction = {
      label: r.is_pinned ? "Unpin" : "Pin",
      icon: r.is_pinned ? PinOff : Pin,
      disabled,
      onSelect: () => togglePin.mutate(r),
    };
    if (r.is_locked) {
      return [
        view,
        pin,
        { label: "Custom", icon: Copy, disabled, onSelect: () => clone.mutate(r) },
      ];
    }
    return [
      view,
      pin,
      {
        label: "Edit",
        icon: Pencil,
        disabled,
        onSelect: () => startInlineEdit(r),
      },
      ...(isAdmin
        ? ([
            { type: "separator" },
            {
              label: "Delete",
              icon: Trash2,
              destructive: true,
              disabled,
              onSelect: () => setPendingDelete(r),
            },
          ] as RowAction[])
        : []),
    ];
  };

  /** Row click opens the detail page — unless the click came from the actions cell or an interactive control. */
  const onRowClick = (e: React.MouseEvent, r: MasterItem) => {
    const target = e.target as HTMLElement;
    if (target.closest("[data-row-actions], button, a, input, select, [role=menu], [role=dialog]"))
      return;
    navigate({ to: "/master/$id", params: { id: r.id } });
  };

  const onInlineKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (!saveInline.isPending) saveInline.mutate();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setInline(null);
    }
  };

  const setDraft = (patch: Partial<InlineDraft>) =>
    setInline((cur) => (cur ? { ...cur, draft: { ...cur.draft, ...patch } } : cur));

  const cell = "h-8 w-full rounded-md border border-input bg-background px-2 text-sm";

  return (
    <div>
      <PageHeader
        title="Master Data"
        subtitle="Shared IFCT 2017 / USDA reference library (read-only) plus custom ingredients added by the team. Values per 100 g."
        actions={
          <>
            <Button variant="outline" onClick={exportCsv} disabled={rows.length === 0}>
              <FileDown className="size-4" /> Export CSV
            </Button>
            <Button onClick={() => setEditor({ form: emptyMasterForm() })}>
              <Plus className="size-4" /> Add Ingredient
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
          <TabsList>
            <TabsTrigger value="all">All ({all.length})</TabsTrigger>
            <TabsTrigger value="custom">Custom items ({customCount})</TabsTrigger>
            <TabsTrigger value="builtin">Built-in ({builtinCount})</TabsTrigger>
          </TabsList>
        </Tabs>
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search ingredients"
          className="max-w-xs"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="all">All categories</option>
          {MASTER_CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>

      {items.isError ? (
        <RouteErrorCard error={items.error} reset={() => void items.refetch()} />
      ) : items.isLoading ? (
        <RoutePending />
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">
          Nothing matches. Add an ingredient or clone a built-in one to tweak its values.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/60 hover:bg-secondary/60">
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Source</TableHead>
                <TableHead className="text-right">Protein g</TableHead>
                <TableHead className="text-right">Iron mg</TableHead>
                <TableHead className="text-right">Calcium mg</TableHead>
                <TableHead className="w-24 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const editing = inline?.id === r.id;
                const busy = anyBusy(r.id);
                if (editing && inline) {
                  const d = inline.draft;
                  return (
                    <TableRow key={r.id} className="bg-primary/5" onKeyDown={onInlineKey}>
                      <TableCell>
                        <input
                          autoFocus
                          value={d.name}
                          onChange={(e) => setDraft({ name: e.target.value })}
                          className={cell}
                          aria-label="Name"
                        />
                      </TableCell>
                      <TableCell>
                        <select
                          value={d.category}
                          onChange={(e) => setDraft({ category: e.target.value })}
                          className={cell}
                          aria-label="Category"
                        >
                          {MASTER_CATEGORIES.map((c) => (
                            <option key={c}>{c}</option>
                          ))}
                        </select>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] uppercase">
                          Custom
                        </Badge>
                      </TableCell>
                      {(["protein_g", "iron_mg", "calcium_mg"] as const).map((k) => (
                        <TableCell key={k}>
                          <input
                            type="number"
                            min={0}
                            step="any"
                            inputMode="decimal"
                            value={d[k]}
                            onChange={(e) => setDraft({ [k]: e.target.value })}
                            className={cn(cell, "text-right")}
                            aria-label={k}
                          />
                        </TableCell>
                      ))}
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            onClick={() => saveInline.mutate()}
                            disabled={saveInline.isPending}
                            aria-label="Save"
                          >
                            {saveInline.isPending ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <Check className="size-4" />
                            )}
                            Save
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setInline(null)}
                            disabled={saveInline.isPending}
                            aria-label="Cancel"
                          >
                            <X className="size-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                }
                return (
                  <TableRow
                    key={r.id}
                    data-highlight={highlightId === r.id || undefined}
                    onClick={(e) => onRowClick(e, r)}
                    className={cn(
                      "cursor-pointer transition-colors",
                      !r.is_active && "opacity-50",
                      busy && "pointer-events-none opacity-60",
                      highlightId === r.id && "bg-primary/10",
                    )}
                  >
                    <TableCell className="font-medium">
                      <span className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            togglePin.mutate(r);
                          }}
                          aria-label={r.is_pinned ? `Unpin ${r.name}` : `Pin ${r.name}`}
                          aria-pressed={r.is_pinned}
                          title={r.is_pinned ? "Unpin" : "Pin"}
                          className={cn(
                            "shrink-0 transition-colors",
                            r.is_pinned
                              ? "text-primary"
                              : "text-muted-foreground/40 hover:text-foreground",
                          )}
                        >
                          <Pin className={cn("size-3.5", r.is_pinned && "fill-current")} />
                        </button>
                        {r.is_locked && (
                          <Lock
                            className="size-3.5 shrink-0 text-muted-foreground"
                            aria-label="Built-in, read-only"
                          />
                        )}
                        {r.name}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{r.category}</TableCell>
                    <TableCell>
                      <Badge
                        variant={r.is_locked ? "secondary" : "outline"}
                        className="text-[10px] uppercase"
                      >
                        {r.is_locked ? r.source : "Custom"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtCell(r.nutrients.protein_g)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtCell(r.nutrients.iron_mg)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtCell(r.nutrients.calcium_mg)}
                    </TableCell>
                    <TableCell className="text-right" data-row-actions>
                      {busy ? (
                        <Loader2 className="ml-auto size-4 animate-spin text-muted-foreground" />
                      ) : (
                        <RowActionsMenu actions={actionsFor(r)} label={`Actions for ${r.name}`} />
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {editor && (
        <ItemEditorDialog
          open
          title="New ingredient"
          form={editor.form}
          onChange={(form) => setEditor({ form })}
          onClose={() => setEditor(null)}
          onSave={() => create.mutate()}
          saving={create.isPending}
        />
      )}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title={`Delete "${pendingDelete?.name}"?`}
        description="Existing recipes keep their snapshot values. This cannot be undone."
        confirmLabel="Delete"
        destructive
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => remove.mutate()}
      />
    </div>
  );
}
