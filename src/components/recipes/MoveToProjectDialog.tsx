import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Folder, FolderPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { projectsQuery, createProject } from "@/lib/projects";
import { moveRecipeToProject } from "@/lib/recipes";
import { cn } from "@/lib/utils";

export function MoveToProjectDialog({
  recipeId,
  recipeName,
  currentProjectId,
  open,
  onOpenChange,
}: {
  recipeId: string;
  recipeName: string;
  currentProjectId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const projects = useQuery(projectsQuery());
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  const effectiveSelected = selected ?? currentProjectId ?? null;

  const close = () => {
    if (busy) return;
    onOpenChange(false);
    // reset for next open
    setTimeout(() => {
      setSelected(null);
      setCreating(false);
      setNewName("");
    }, 150);
  };

  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["recipes"] }),
      queryClient.invalidateQueries({ queryKey: ["projects"] }),
      queryClient.invalidateQueries({ queryKey: ["recipe", recipeId] }),
    ]);

  const move = async () => {
    if (busy) return;
    let targetId: string | null = effectiveSelected;
    setBusy(true);
    try {
      if (creating && newName.trim()) {
        targetId = await createProject({ name: newName.trim() });
      }
      if (targetId === (currentProjectId ?? null)) {
        close();
        return;
      }
      await moveRecipeToProject(recipeId, targetId);
      await invalidate();
      toast.success("Recipe moved to project");
      onOpenChange(false);
      setTimeout(() => {
        setSelected(null);
        setCreating(false);
        setNewName("");
      }, 150);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Move failed");
    } finally {
      setBusy(false);
    }
  };

  const list = projects.data ?? [];
  const hasProjects = list.length > 0;

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Move to Project</DialogTitle>
          <DialogDescription>
            Choose where “{recipeName}” should live. This only affects internal organization —
            sharing stays unchanged.
          </DialogDescription>
        </DialogHeader>

        {projects.isPending ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading projects…
          </div>
        ) : creating ? (
          <div className="space-y-3">
            <label className="text-sm font-medium" htmlFor="new-project-name">
              New project name
            </label>
            <Input
              id="new-project-name"
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Trials Q3"
              maxLength={120}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newName.trim()) void move();
                if (e.key === "Escape") setCreating(false);
              }}
            />
            <p className="text-xs text-muted-foreground">
              The recipe will be moved into the new project once you click Move.
            </p>
          </div>
        ) : hasProjects ? (
          <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
            {list.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelected(p.id)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
                  effectiveSelected === p.id
                    ? "border-primary bg-primary/5 font-medium"
                    : "border-border hover:bg-muted/60",
                )}
              >
                <Folder className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                {typeof p.recipe_count === "number" && (
                  <span className="text-xs text-muted-foreground">{p.recipe_count}</span>
                )}
              </button>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed py-8 text-center">
            <Folder className="mx-auto size-8 text-muted-foreground/50" />
            <p className="mt-2 text-sm text-muted-foreground">No projects yet.</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => setCreating(true)}>
              <FolderPlus className="size-4" /> Create project
            </Button>
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          {!creating && hasProjects ? (
            <Button variant="ghost" size="sm" onClick={() => setCreating(true)} disabled={busy}>
              <FolderPlus className="size-4" /> New project
            </Button>
          ) : creating ? (
            <Button variant="ghost" size="sm" onClick={() => setCreating(false)} disabled={busy}>
              Back to list
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={() => void move()} disabled={busy || (creating && !newName.trim())}>
              {busy && <Loader2 className="size-4 animate-spin" />} Move
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
