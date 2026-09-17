// Human-readable formatting for audit log entries (UI-only; storage unchanged).

export type FieldChange = { field: string; before: string; after: string };

const ENTITY_LABELS: Record<string, string> = {
  recipes: "Recipe",
  recipe_versions: "Recipe version",
  projects: "Project",
  master_items: "Master item",
  master_item_pins: "Pinned item",
  profiles: "Profile",
  rda_settings: "RDA setting",
};

const VERB_LABELS: Record<string, string> = {
  create: "Created",
  insert: "Created",
  update: "Updated",
  delete: "Deleted",
  clone: "Cloned",
};

const SKIP_FIELDS = new Set([
  "id",
  "user_id",
  "created_at",
  "updated_at",
  "current_version_id",
  "owner_profile_id",
  "project_id",
]);

const FIELD_LABELS: Record<string, string> = {
  name: "Name",
  title: "Title",
  is_pinned: "Pinned",
  age_band: "Age band",
  description: "Description",
  category: "Category",
  quantity_g: "Quantity (g)",
  energy_kcal: "Energy (kcal)",
  protein_g: "Protein (g)",
  fat_g: "Fat (g)",
  carbs_g: "Carbohydrate (g)",
};

function humaniseField(key: string): string {
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Plain-text rendering: never JSON, no braces, no quotes. */
function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) {
    const parts = value.map(formatValue).filter((p) => p !== "-");
    return parts.length ? parts.join(", ") : "-";
  }
  if (typeof value === "object") {
    const parts = Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `${humaniseField(k).toLowerCase()} ${formatValue(v)}`)
      .filter((p) => !p.endsWith(" -"));
    return parts.length ? parts.join(", ") : "-";
  }
  return String(value);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function formatEntity(entityType: string | null): string {
  if (!entityType) return "Item";
  return ENTITY_LABELS[entityType] ?? humaniseField(entityType);
}

export function formatAction(action: string, entityType: string | null): string {
  if (action === "version_saved") return "Saved recipe version";
  const parts = action.split(".");
  const verb = (parts.length > 1 ? parts.at(-1) : parts[0]) ?? action;
  const entity = entityType ?? (parts.length > 1 ? (parts[0] ?? null) : null);
  const verbLabel = VERB_LABELS[verb] ?? humaniseField(verb);
  return `${verbLabel} ${formatEntity(entity)}`;
}

export function describeChanges(changes: unknown): FieldChange[] {
  if (!isRecord(changes)) return [];
  const before = isRecord(changes["before"]) ? changes["before"] : null;
  const after = isRecord(changes["after"]) ? changes["after"] : null;
  if (!before && !after) return [];

  const out: FieldChange[] = [];
  if (before && after) {
    // Update: only differing fields
    for (const key of Object.keys(after)) {
      if (SKIP_FIELDS.has(key)) continue;
      const b = before[key];
      const a = after[key];
      if (JSON.stringify(b) === JSON.stringify(a)) continue;
      out.push({ field: humaniseField(key), before: formatValue(b), after: formatValue(a) });
    }
  } else {
    // Create or delete: show key fields of the record
    const record: Record<string, unknown> = after ?? before!;
    for (const key of Object.keys(record)) {
      if (SKIP_FIELDS.has(key)) continue;
      const v = record[key];
      out.push(
        after
          ? { field: humaniseField(key), before: "—", after: formatValue(v) }
          : { field: humaniseField(key), before: formatValue(v), after: "—" },
      );
    }
  }
  return out.slice(0, 20);
}
