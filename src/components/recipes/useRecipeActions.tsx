import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Copy,
  Download,
  FileText,
  FolderInput,
  Pencil,
  Pin,
  PinOff,
  Printer,
  Share2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { cloneRecipe, deleteRecipe, setRecipePinned, type RecipeWithVersion } from "@/lib/recipes";
import { rdaQuery } from "@/lib/rda";
import { deriveRecipe, toShareInput } from "@/lib/recipe-derive";
import { exportRecipePdf, PdfLibraryLoadError } from "@/lib/pdf";
import type { ShareInput } from "@/lib/share";
import type { RowAction } from "@/components/RowActionsMenu";
import { ShareDialog } from "@/components/ShareDialog";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { MoveToProjectDialog } from "@/components/recipes/MoveToProjectDialog";
import { useSession } from "@/hooks/useSession";
import { errorMessage } from "@/components/RouteStates";

/**
 * One place for every recipe row action (Open / Edit / Clone / Delete / Share / Print / Download / Pin).
 * Returns `actionsFor(recipe)` for a RowActionsMenu plus the dialogs to render once.
 */
export function useRecipeActions() {
  const { isAdmin } = useSession();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const rda = useQuery(rdaQuery());
  const [share, setShare] = useState<ShareInput | null>(null);
  const [pendingDelete, setPendingDelete] = useState<RecipeWithVersion | null>(null);
  const [pendingMove, setPendingMove] = useState<RecipeWithVersion | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["recipes"] }),
      queryClient.invalidateQueries({ queryKey: ["projects"] }),
      queryClient.invalidateQueries({ queryKey: ["recipe"] }),
      queryClient.invalidateQueries({ queryKey: ["recipe-full"] }),
    ]);

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const r = pendingDelete;
    setPendingDelete(null);
    try {
      await deleteRecipe(r.id);
      await invalidate();
      toast.success(`Deleted “${r.name}”`);
    } catch (e) {
      toast.error(errorMessage(e, "Delete failed"));
    }
  };

  const clone = async (id: string) => {
    setBusyId(id);
    try {
      const newId = await cloneRecipe(id);
      await invalidate();
      toast.success("Recipe cloned");
      await navigate({ to: "/builder", search: { recipe: newId } });
    } catch (e) {
      toast.error(errorMessage(e, "Clone failed"));
    } finally {
      setBusyId(null);
    }
  };

  const togglePin = async (r: RecipeWithVersion) => {
    try {
      await setRecipePinned(r.id, !r.is_pinned);
      await invalidate();
      toast.success(r.is_pinned ? "Unpinned from dashboard" : "Pinned to dashboard");
    } catch (e) {
      toast.error(errorMessage(e, "Pin failed"));
    }
  };

  const pdf = async (r: RecipeWithVersion) => {
    const d = deriveRecipe(r, rda.data);
    try {
      await exportRecipePdf({
        name: r.name,
        projectName: r.project?.name ?? null,
        ageBand: d.ageBand,
        version: r.current?.version_number ?? null,
        ingredients: d.ingredients,
        totals: d.totals,
        flags: d.flags,
        prepNotes: r.current?.prep_notes ?? "",
        serving: d.serving,
      });
      toast.success("Spec sheet PDF downloaded");
    } catch (e) {
      if (e instanceof PdfLibraryLoadError) {
        toast.error(e.message, { action: { label: "Retry", onClick: () => void pdf(r) } });
      } else {
        toast.error(errorMessage(e, "PDF export failed"));
      }
    }
  };

  const actionsFor = (r: RecipeWithVersion, opts?: { includeOpen?: boolean }): RowAction[] => [
    ...(opts?.includeOpen === false
      ? []
      : [
          {
            label: "Open",
            icon: FileText,
            onSelect: () => void navigate({ to: "/recipes/$id", params: { id: r.id } }),
          } as RowAction,
        ]),
    {
      label: "Edit",
      icon: Pencil,
      onSelect: () => void navigate({ to: "/builder", search: { recipe: r.id } }),
    },
    { label: "Clone", icon: Copy, disabled: busyId === r.id, onSelect: () => void clone(r.id) },
    {
      label: r.is_pinned ? "Unpin" : "Pin to dashboard",
      icon: r.is_pinned ? PinOff : Pin,
      onSelect: () => void togglePin(r),
    },
    {
      label: "Move to Project",
      icon: FolderInput,
      onSelect: () => setPendingMove(r),
    },
    { type: "separator" },
    {
      label: "Share",
      icon: Share2,
      onSelect: () => setShare(toShareInput(r, deriveRecipe(r, rda.data))),
    },
    {
      label: "Print",
      icon: Printer,
      onSelect: () =>
        void navigate({ to: "/recipes/$id", params: { id: r.id }, search: { print: true } }),
    },
    { label: "Download PDF", icon: Download, onSelect: () => void pdf(r) },
    ...(isAdmin
      ? ([
          { type: "separator" },
          {
            label: "Delete",
            icon: Trash2,
            destructive: true,
            onSelect: () => setPendingDelete(r),
          },
        ] as RowAction[])
      : []),
  ];

  const dialogs = (
    <>
      <ShareDialog open={share !== null} onOpenChange={(o) => !o && setShare(null)} input={share} />
      {pendingMove && (
        <MoveToProjectDialog
          recipeId={pendingMove.id}
          recipeName={pendingMove.name}
          currentProjectId={pendingMove.project_id}
          open
          onOpenChange={(o) => !o && setPendingMove(null)}
        />
      )}
      <ConfirmDialog
        open={pendingDelete !== null}
        title={`Delete “${pendingDelete?.name ?? ""}”?`}
        description="This removes the recipe and all of its saved versions. This cannot be undone."
        confirmLabel="Delete"
        destructive
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
      />
    </>
  );

  return {
    actionsFor,
    dialogs,
    togglePin,
    pdf,
    clone,
    openShare: (r: RecipeWithVersion) => setShare(toShareInput(r, deriveRecipe(r, rda.data))),
    requestDelete: setPendingDelete,
    requestMove: setPendingMove,
    rda: rda.data,
  };
}
