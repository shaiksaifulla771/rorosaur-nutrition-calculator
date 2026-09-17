import { supabase } from "@/integrations/supabase/client";

export type AuditRow = {
  id: string;
  created_at: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  actor_email: string | null;
  actor_profile_name: string | null;
  changes_json: unknown;
};

export type AuditFilters = { actor?: string; action?: string; from?: string; to?: string };

export async function listAudit(filters: AuditFilters = {}): Promise<AuditRow[]> {
  let q = supabase
    .from("audit_log")
    .select("id, created_at, action, entity_type, entity_id, actor_email, actor_profile_name, changes_json")
    .not("entity_type", "is", null)
    .order("created_at", { ascending: false })
    .limit(200);
  if (filters.actor) q = q.ilike("actor_email", `%${filters.actor}%`);
  if (filters.action) q = q.ilike("action", `%${filters.action}%`);
  if (filters.from) q = q.gte("created_at", filters.from);
  if (filters.to) q = q.lte("created_at", `${filters.to}T23:59:59.999Z`);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as AuditRow[];
}
