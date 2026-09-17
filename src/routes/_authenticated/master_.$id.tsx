import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { errorMessage, RouteErrorCard, RoutePending } from "@/components/RouteStates";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  ArrowLeft,
  Copy,
  Download,
  FileDown,
  FileText,
  Loader2,
  Lock,
  NotebookPen,
  Pencil,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import {
  cloneMasterItem,
  deleteMasterItem,
  masterItemQuery,
  updateMasterItem,
  type MasterItem,
  type MasterItemInput,
} from "@/lib/master";
import {
  AMINO_LABELS,
  NUTRIENT_LABELS,
  type AminoAcidKey,
  type NutrientKey,
} from "@/lib/nutrition/reference";
import { fmtCell } from "@/lib/nutrition/calc";
import { downloadText, exportFileName, ingredientToCsv } from "@/lib/share";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RowActionsMenu } from "@/components/RowActionsMenu";
import { ItemEditorDialog, masterItemToForm } from "@/components/master/ItemEditor";
import { useSession } from "@/hooks/useSession";
import { ConfirmDialog } from "@/components/ConfirmDialog";

export const Route = createFileRoute("/_authenticated/master_/$id")({
  head: () => ({
    meta: [
      { title: "Ingredient — Rorosaur" },
      { name: "description", content: "Full nutrient and amino-acid profile of an ingredient." },
      { property: "og:title", content: "Ingredient — Rorosaur" },
      { property: "og:description", content: "Ingredient detail view." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  errorComponent: RouteErrorCard,
  pendingComponent: RoutePending,
  component: IngredientDetail,
});

const NUTRIENT_KEYS = Object.keys(NUTRIENT_LABELS) as NutrientKey[];
const AMINO_KEYS = Object.keys(AMINO_LABELS) as AminoAcidKey[];

function IngredientDetail() {
  const { isAdmin } = useSession();
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const item = useQuery(masterItemQuery(id));
  const [form, setForm] = useState<MasterItemInput | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const save = useMutation({
    mutationFn: async () => {
      if (!form) return;
      await updateMasterItem(id, form);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["master-item", id] });
      await queryClient.invalidateQueries({ queryKey: ["master-items"] });
      toast.success("Ingredient updated");
      setForm(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const clone = useMutation({
    mutationFn: async () => {
      if (!item.data) throw new Error("Item not loaded");
      return cloneMasterItem(item.data, `${item.data.name} (Custom)`);
    },
    onSuccess: async (newId) => {
      await queryClient.invalidateQueries({ queryKey: ["master-items"] });
      toast.success("Custom copy created");
      navigate({ to: "/master/$id", params: { id: newId } });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Clone failed"),
  });

  const remove = useMutation({
    mutationFn: async () => {
      if (!item.data) throw new Error("Item not loaded");
      await deleteMasterItem(item.data.id);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["master-items"] });
      toast.success("Ingredient deleted");
      navigate({ to: "/master" });
    },
    onError: async (e) => {
      toast.error(errorMessage(e, "Delete failed"));
      // Row may already be gone — resync both caches so the page reflects the database.
      await queryClient.invalidateQueries({ queryKey: ["master-item", id] });
      await queryClient.invalidateQueries({ queryKey: ["master-items"] });
    },
    onSettled: () => setConfirmDelete(false),
  });

  const [pdfBusy, setPdfBusy] = useState(false);
  const exportPdf = async (r: MasterItem) => {
    setPdfBusy(true);
    try {
      const { exportIngredientPdf, PdfLibraryLoadError } = await import("@/lib/pdf");
      try {
        await exportIngredientPdf(r);
        toast.success("Ingredient PDF downloaded");
      } catch (e) {
        if (e instanceof PdfLibraryLoadError) {
          toast.error(e.message, { action: { label: "Retry", onClick: () => void exportPdf(r) } });
        } else {
          toast.error(errorMessage(e, "PDF export failed"));
        }
      }
    } catch {
      toast.error("The PDF generator could not be loaded.", {
        action: { label: "Retry", onClick: () => void exportPdf(r) },
      });
    } finally {
      setPdfBusy(false);
    }
  };
  const exportCsv = (r: MasterItem) => {
    try {
      downloadText(exportFileName(`${r.name}_Ingredient`, "csv"), ingredientToCsv(r));
      toast.success("CSV exported");
    } catch (e) {
      toast.error(errorMessage(e, "CSV export failed"));
    }
  };

  if (item.isLoading) return <RoutePending />;
  if (item.isError) return <RouteErrorCard error={item.error} reset={() => void item.refetch()} />;
  const r = item.data;
  if (!r)
    return (
      <div className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">
        Ingredient not found.{" "}
        <Link to="/master" className="text-primary underline">
          Back to Master Data
        </Link>
      </div>
    );

  const busy = clone.isPending || remove.isPending;

  return (
    <div className="space-y-6">
      <Link
        to="/master"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Master Data
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-display text-2xl font-semibold">{r.name}</h2>
            {r.is_locked && (
              <Lock className="size-4 text-muted-foreground" aria-label="Built-in, read-only" />
            )}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="outline">{r.category}</Badge>
            <Badge variant={r.is_locked ? "secondary" : "outline"} className="uppercase">
              {r.is_locked ? `${r.source} · built-in` : "Custom"}
            </Badge>
            {!r.is_active && <Badge variant="destructive">Inactive</Badge>}
          </div>
          {r.notes && <p className="mt-3 max-w-2xl text-sm text-muted-foreground">{r.notes}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" asChild>
            <Link to="/builder" search={{ add: r.id }}>
              <NotebookPen className="size-4" /> Use in calculator
            </Link>
          </Button>
          <RowActionsMenu
            label="Export options"
            trigger={
              <Button variant="outline" disabled={pdfBusy} aria-label="Export options">
                {pdfBusy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Download className="size-4" />
                )}{" "}
                Export
              </Button>
            }
            actions={[
              {
                label: "Download PDF",
                icon: FileText,
                disabled: pdfBusy,
                onSelect: () => void exportPdf(r),
              },
              { label: "Export CSV", icon: FileDown, onSelect: () => exportCsv(r) },
            ]}
          />
          {r.is_locked ? (
            <Button onClick={() => clone.mutate()} disabled={busy}>
              {clone.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Copy className="size-4" />
              )}{" "}
              Custom
            </Button>
          ) : (
            <>
              <Button onClick={() => setForm(masterItemToForm(r))} disabled={busy}>
                <Pencil className="size-4" /> Edit
              </Button>
              {isAdmin && (
                <RowActionsMenu
                  actions={[
                    {
                      label: "Edit",
                      icon: Pencil,
                      disabled: busy,
                      onSelect: () => setForm(masterItemToForm(r)),
                    },
                    { type: "separator" as const },
                    {
                      label: "Delete",
                      icon: Trash2,
                      destructive: true,
                      disabled: busy,
                      onSelect: () => setConfirmDelete(true),
                    },
                  ]}
                />
              )}
            </>
          )}
        </div>
      </div>

      {r.is_locked && (
        <p className="rounded-lg border border-border bg-secondary/40 px-4 py-2 text-xs text-muted-foreground">
          Built-in reference values are read-only. Clone this ingredient as a custom item to adjust
          its composition.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Nutrients per 100 g</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nutrient</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {NUTRIENT_KEYS.map((k) => (
                  <TableRow key={k}>
                    <TableCell>{NUTRIENT_LABELS[k]}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtCell(r.nutrients[k])}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Amino acids (mg / g protein)</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Amino acid</TableHead>
                  <TableHead className="text-right">mg/g</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {AMINO_KEYS.map((k) => (
                  <TableRow key={k}>
                    <TableCell>{AMINO_LABELS[k]}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtCell(r.amino_acids[k])}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {form && (
        <ItemEditorDialog
          open
          title="Edit ingredient"
          form={form}
          onChange={setForm}
          onClose={() => setForm(null)}
          onSave={() => save.mutate()}
          saving={save.isPending}
        />
      )}
      <ConfirmDialog
        open={confirmDelete}
        title={`Delete "${r.name}"?`}
        description="Existing recipes keep their snapshot values."
        confirmLabel="Delete"
        destructive
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => remove.mutate()}
      />
    </div>
  );
}
