import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Fragment, useState } from "react";
import { Loader2 } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useDebounce } from "@/hooks/useDebounce";
import { listAudit } from "@/lib/admin";
import { describeChanges, formatAction, formatEntity } from "@/lib/audit-format";

export const Route = createFileRoute("/_authenticated/admin/activity")({
  head: () => ({
    meta: [
      { title: "Activity log | Rorosaur Admin" },
      {
        name: "description",
        content: "Review every create, update and delete made in the Rorosaur nutrition workspace.",
      },
      { property: "og:title", content: "Activity log | Rorosaur Admin" },
      { property: "og:description", content: "Full audit trail of workspace changes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ActivityLogPage,
});

function ActivityLogPage() {
  const [actor, setActor] = useState("");
  const [action, setAction] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const filters = {
    actor: useDebounce(actor, 300),
    action: useDebounce(action, 300),
    from,
    to,
  };
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "audit", filters],
    queryFn: () => listAudit(filters),
  });
  const [open, setOpen] = useState<string | null>(null);

  // An RDA edit is stored as a remove + add pair; show it as one "Updated" entry.
  const audit = data ?? [];
  const paired = new Set<string>();
  const merged = new Set<string>();
  for (const row of audit) {
    if (row.entity_type !== "rda_settings" || row.action.endsWith(".create")) continue;
    const twin = audit.find(
      (o) =>
        o.entity_type === "rda_settings" &&
        o.action.endsWith(".create") &&
        o.actor_email === row.actor_email &&
        Math.abs(
          new Date(o.created_at).getTime() - new Date(row.created_at).getTime(),
        ) < 5000,
    );
    if (twin) {
      paired.add(row.id);
      merged.add(twin.id);
    }
  }

  const rows = audit
    .filter((row) => !paired.has(row.id))
    .map((row) => ({
      row: merged.has(row.id) ? { ...row, action: "rda_settings.update" } : row,
      changes: describeChanges(row.changes_json),
    }))
    .filter(({ changes }) => changes.length > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Activity log</CardTitle>
        <CardDescription>Latest 200 changes, newest first.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-4">
          <Input placeholder="Filter by email" value={actor} onChange={(e) => setActor(e.target.value)} />
          <Input placeholder="Filter by action" value={action} onChange={(e) => setAction(e.target.value)} />
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Who</TableHead>
              <TableHead>Profile</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Item</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ row, changes }) => {
              return (
                <Fragment key={row.id}>
                  <TableRow
                    className="cursor-pointer"
                    onClick={() => setOpen(open === row.id ? null : row.id)}
                  >
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {new Date(row.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-sm">{row.actor_email ?? "—"}</TableCell>
                    <TableCell className="text-sm">{row.actor_profile_name ?? "—"}</TableCell>
                    <TableCell className="font-medium">
                      {formatAction(row.action, row.entity_type)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatEntity(row.entity_type)}
                    </TableCell>
                  </TableRow>
                  {open === row.id && (
                    <TableRow>
                      <TableCell colSpan={5}>
                        <div className="space-y-1 py-1">
                          <p className="text-xs font-medium text-muted-foreground">Changes</p>
                          <ul className="space-y-0.5 text-sm">
                            {changes.map((c) => (
                              <li key={c.field}>
                                <span className="font-medium">{c.field}:</span> {c.before}
                                {" → "}
                                {c.after}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
            {isLoading && (
              <TableRow>
                <TableCell colSpan={5}>
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            )}
            {!isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-sm text-muted-foreground">
                  No activity matches these filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
