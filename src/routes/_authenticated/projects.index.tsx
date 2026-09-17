import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { errorMessage, RouteErrorCard, RoutePending } from "@/components/RouteStates";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  ChevronRight,
  FolderKanban,
  FolderOpen,
  Loader2,
  Lock,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import {
  createProject,
  deleteProject,
  isDefaultProject,
  projectsQuery,
  updateProject,
  type ProjectRow,
} from "@/lib/projects";
import { recipesQuery, type RecipeWithVersion } from "@/lib/recipes";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, RowActionsMenu } from "@/components/RowActionsMenu";
import { useSession } from "@/hooks/useSession";
import { ConfirmDialog } from "@/components/ConfirmDialog";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/projects/")({
  head: () => ({
    meta: [
      { title: "Projects — Rorosaur" },
      {
        name: "description",
        content:
          "Group recipes into projects for a client, menu or trial. Expand a project to work with its recipes.",
      },
      { property: "og:title", content: "Projects — Rorosaur" },
      { property: "og:description", content: "Your recipe projects." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  errorComponent: RouteErrorCard,
  pendingComponent: RoutePending,
  component: ProjectsPage,
});

type ProjectForm = { id?: string; name: string; description: string };

function ProjectsPage() {
  const { isAdmin } = useSession();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const projects = useQuery(projectsQuery());
  const recipes = useQuery(recipesQuery());
  const [form, setForm] = useState<ProjectForm | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ProjectRow | null>(null);

  useEffect(() => {
    const channel = supabase
      .channel("projects-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "projects" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["projects"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "recipes" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["projects"] });
        void queryClient.invalidateQueries({ queryKey: ["recipes"] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const byProject = useMemo(() => {
    const m = new Map<string, RecipeWithVersion[]>();
    for (const r of recipes.data ?? []) {
      if (!r.project_id) continue;
      m.set(r.project_id, [...(m.get(r.project_id) ?? []), r]);
    }
    return m;
  }, [recipes.data]);

  const save = useMutation({
    mutationFn: async (f: ProjectForm) =>
      f.id
        ? updateProject(f.id, { name: f.name.trim(), description: f.description })
        : createProject({ name: f.name.trim(), description: f.description }),
    onSuccess: async (_, f) => {
      setForm(null);
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      await queryClient.invalidateQueries({ queryKey: ["recipes"] });
      toast.success(f.id ? "Project updated" : "Project created");
    },
    onError: (e) => toast.error(errorMessage(e, "Could not save project")),
  });

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const p = pendingDelete;
    setPendingDelete(null);
    try {
      await deleteProject(p.id);
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      await queryClient.invalidateQueries({ queryKey: ["recipes"] });
      toast.success(`Deleted project “${p.name}”`);
    } catch (e) {
      toast.error(errorMessage(e, "Delete failed"));
    }
  };

  const list = projects.data ?? [];
  const openProject = (id: string) => void navigate({ to: "/projects/$id", params: { id } });

  return (
    <div>
      <PageHeader
        title="Projects"
        subtitle="Every recipe lives inside a project folder. Click a folder to manage its recipes."
        actions={
          <Button onClick={() => setForm({ name: "", description: "" })}>
            <Plus className="size-4" /> Create project
          </Button>
        }
      />

      {projects.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading projects…</p>
      ) : list.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <FolderKanban className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 text-muted-foreground">No projects yet.</p>
          <Button className="mt-4" onClick={() => setForm({ name: "", description: "" })}>
            <Plus className="size-4" /> Create your first project
          </Button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="hidden grid-cols-[2rem_1fr_6rem_8rem_3rem] items-center gap-3 border-b border-border bg-secondary/60 px-4 py-2 text-xs uppercase tracking-wide text-muted-foreground md:grid">
            <span />
            <span>Project folder</span>
            <span className="text-right">Recipes</span>
            <span>Created</span>
            <span />
          </div>
          {list.map((p) => {
            const rows = byProject.get(p.id) ?? [];
            const isDefault = isDefaultProject(p);
            return (
              <div key={p.id} className="border-b border-border last:border-b-0">
                <div
                  role="link"
                  tabIndex={0}
                  onClick={() => openProject(p.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openProject(p.id);
                    }
                  }}
                  className="grid cursor-pointer grid-cols-[2rem_1fr_3rem] items-center gap-3 px-4 py-3 transition-colors hover:bg-secondary/40 md:grid-cols-[2rem_1fr_6rem_8rem_3rem]"
                >
                  <FolderKanban className="size-4 text-primary" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{p.name}</span>
                      {isDefault && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
                          <Lock className="size-3" /> Default folder
                        </span>
                      )}
                      <ChevronRight className="size-4 text-muted-foreground md:hidden" />
                    </div>
                    {p.description && (
                      <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                        {p.description}
                      </p>
                    )}
                    <p className="mt-0.5 text-xs text-muted-foreground md:hidden">
                      {rows.length} recipe{rows.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <span className="hidden text-right tabular-nums md:block">{rows.length}</span>
                  <span className="hidden text-sm text-muted-foreground md:block">
                    {new Date(p.created_at).toLocaleDateString()}
                  </span>
                  <div className="flex justify-end">
                    <RowActionsMenu
                      label={`Actions for ${p.name}`}
                      actions={[
                        { label: "Open", icon: FolderOpen, onSelect: () => openProject(p.id) },
                        {
                          label: "Add recipe",
                          icon: Plus,
                          onSelect: () =>
                            void navigate({ to: "/builder", search: { project: p.id } }),
                        },
                        ...(isDefault
                          ? []
                          : [
                              {
                                label: "Edit",
                                icon: Pencil,
                                onSelect: () =>
                                  setForm({
                                    id: p.id,
                                    name: p.name,
                                    description: p.description ?? "",
                                  }),
                              },
                              ...(isAdmin
                                ? [
                                    { type: "separator" as const },
                                    {
                                      label: "Delete",
                                      icon: Trash2,
                                      destructive: true,
                                      onSelect: () => setPendingDelete(p),
                                    },
                                  ]
                                : []),
                            ]),
                      ]}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={form !== null} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="sm:max-w-md">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (form?.name.trim()) save.mutate(form);
            }}
          >
            <DialogHeader>
              <DialogTitle>{form?.id ? "Edit project" : "Create project"}</DialogTitle>
              <DialogDescription>
                Projects are visible to everyone in the workspace.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="project-name">Name</Label>
                <Input
                  id="project-name"
                  autoFocus
                  required
                  value={form?.name ?? ""}
                  onChange={(e) => setForm((f) => (f ? { ...f, name: e.target.value } : f))}
                  placeholder="e.g. Ragi trial — Q3"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="project-desc">Description (optional)</Label>
                <Textarea
                  id="project-desc"
                  rows={3}
                  value={form?.description ?? ""}
                  onChange={(e) => setForm((f) => (f ? { ...f, description: e.target.value } : f))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setForm(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={save.isPending || !form?.name.trim()}>
                {save.isPending && <Loader2 className="size-4 animate-spin" />}
                {form?.id ? "Save changes" : "Create project"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={pendingDelete !== null}
        title={`Delete project “${pendingDelete?.name ?? ""}”?`}
        description="Its recipes are moved to the Default folder — nothing is lost."
        confirmLabel="Delete project"
        destructive
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
