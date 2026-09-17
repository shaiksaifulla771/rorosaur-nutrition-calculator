import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { withTimeout } from "@/lib/utils";
import type { FoodItem } from "./nutrition/food-catalog";
import {
  NUTRIENT_LABELS,
  type AminoAcids,
  type NutrientKey,
  type Nutrients,
} from "./nutrition/reference";
import { emptyAmino } from "./nutrition/calc";

/** PRD §4.5 taxonomy */
export const MASTER_CATEGORIES = [
  "Cereals",
  "Millets",
  "Pulses",
  "Dairy",
  "Nuts & Seeds",
  "Vegetables",
  "Fruits",
  "Fats & Oils",
  "Sweeteners",
  "Egg, Meat & Fish",
  "Other",
] as const;
export type MasterCategory = (typeof MASTER_CATEGORIES)[number];

export type MasterSource = "IFCT" | "USDA" | "custom" | string;

export type MasterItem = {
  id: string;
  /** null = shared built-in; otherwise owner of a custom item */
  user_id: string | null;
  name: string;
  category: string;
  source: MasterSource;
  is_locked: boolean;
  is_pinned: boolean;
  /** Reference quantity the nutrient values describe (grams). */
  quantity_g: number;
  nutrients: Nutrients;
  amino_acids: Partial<AminoAcids>;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type MasterItemInput = {
  name: string;
  category: string;
  quantity_g: number | string;
  nutrients: Nutrients;
  amino_acids: Partial<AminoAcids>;
  notes?: string;
  is_active?: boolean;
  source?: MasterSource;
};

function asItem(row: unknown): MasterItem {
  const r = row as MasterItem;
  return {
    ...r,
    source: r.source ?? "custom",
    is_locked: Boolean(r.is_locked),
    quantity_g: Number(r.quantity_g ?? 100),
    is_pinned: Boolean(r.is_pinned),
    nutrients: (r.nutrients ?? {}) as Nutrients,
    amino_acids: (r.amino_acids ?? {}) as Partial<AminoAcids>,
  };
}

export function masterToFood(item: MasterItem): FoodItem {
  return {
    id: `master:${item.id}`,
    name: item.name,
    nutrients: item.nutrients,
    amino: { ...emptyAmino(), ...item.amino_acids },
    category: item.category,
    source: item.source,
  };
}

export async function listMasterItems(): Promise<MasterItem[]> {
  const [items, pins] = await Promise.all([
    withTimeout(
      supabase.from("master_items").select("*").order("name"),
      undefined,
      "Loading master data",
    ),
    supabase.from("master_item_pins").select("item_id"),
  ]);
  if (items.error) throw items.error;
  if (pins.error) throw pins.error;
  const pinned = new Set((pins.data ?? []).map((p) => p.item_id));
  return (items.data ?? [])
    .map(asItem)
    .map((i) => ({ ...i, is_pinned: pinned.has(i.id) }))
    .sort((a, b) =>
      a.is_pinned === b.is_pinned ? a.name.localeCompare(b.name) : a.is_pinned ? -1 : 1,
    );
}

const NAME_MAX = 120;
const NOTES_MAX = 2000;

function labelFor(key: string): string {
  if (key === "name") return "Name";
  if (key === "category") return "Category";
  if (key === "notes") return "Notes";
  if (key === "quantity_g") return "Quantity (g)";
  return NUTRIENT_LABELS[key as NutrientKey] ?? key;
}

/** Every nutrient is mandatory on a custom ingredient (per 100 g); 0 is valid. */
export const REQUIRED_NUTRIENTS = Object.keys(NUTRIENT_LABELS) as NutrientKey[];
export type RequiredNutrient = NutrientKey;

/**
 * Field-level validation shared by every ingredient form and by the save path.
 * Returns a map of field key -> message; empty object means valid.
 */
export type ValidationOptions = {
  /** When false, nutrients that are absent are left alone (quick-edit rows). */
  requireAllNutrients?: boolean;
};

export function masterFieldErrors(
  input: MasterItemInput,
  options: ValidationOptions = {},
): Record<string, string> {
  const requireAll = options.requireAllNutrients !== false;
  const errors: Record<string, string> = {};
  const name = input.name?.trim() ?? "";
  if (!name) errors["name"] = "Name is required";
  else if (name.length > NAME_MAX) errors["name"] = `Use at most ${NAME_MAX} characters`;
  if (!MASTER_CATEGORIES.includes(input.category as MasterCategory))
    errors["category"] = "Choose a category";
  const qty = Number(input.quantity_g);
  if (input.quantity_g === undefined || input.quantity_g === null || input.quantity_g === "")
    errors["quantity_g"] = "Required";
  else if (!Number.isFinite(qty) || qty <= 0) errors["quantity_g"] = "Enter a quantity above 0";
  for (const k of REQUIRED_NUTRIENTS) {
    const v = (input.nutrients as Record<string, unknown>)?.[k];
    if (v === undefined || v === null || v === "") {
      if (requireAll) errors[k] = "Required";
      continue;
    }
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) errors[k] = "Enter a non-negative number";
  }
  if ((input.notes?.trim().length ?? 0) > NOTES_MAX)
    errors["notes"] = `Use at most ${NOTES_MAX} characters`;
  return errors;
}

/** Client-side validation mirror; the database still enforces ownership via RLS. */
function validateInput(input: MasterItemInput, options: ValidationOptions = {}): MasterItemInput {
  const fieldErrors = masterFieldErrors(input, options);
  const first = Object.entries(fieldErrors)[0];
  if (first) throw new Error(labelFor(first[0]) + ": " + first[1]);
  const name = input.name.trim();
  const clean = (obj: Record<string, unknown>, label: string) => {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(obj ?? {})) {
      if (v === undefined || v === null || v === "") continue;
      const n = typeof v === "number" ? v : Number(v);
      if (!Number.isFinite(n) || n < 0)
        throw new Error(`${label} "${k}" must be a non-negative number`);
      out[k] = Math.round(n * 1000) / 1000;
    }
    return out;
  };
  const notes = input.notes?.trim();
  if (notes && notes.length > NOTES_MAX)
    throw new Error(`Notes must be at most ${NOTES_MAX} characters`);
  return {
    ...input,
    name,
    quantity_g: Math.round(Number(input.quantity_g) * 1000) / 1000,
    nutrients: clean(input.nutrients as Record<string, unknown>, "Nutrient") as Nutrients,
    amino_acids: clean(
      input.amino_acids as Record<string, unknown>,
      "Amino acid",
    ) as Partial<AminoAcids>,
    ...(notes !== undefined ? { notes } : {}),
  };
}

/** Shared-workspace owner id (no user accounts). Matches public.workspace_id() in the database. */
export const WORKSPACE_ID = "00000000-0000-0000-0000-000000000001";

async function requireUserId(): Promise<string> {
  return WORKSPACE_ID;
}

export async function createMasterItem(rawInput: MasterItemInput) {
  const input = validateInput(rawInput);
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from("master_items")
    .insert({
      user_id: userId,
      name: input.name.trim(),
      category: input.category,
      quantity_g: Number(input.quantity_g),
      source: input.source ?? "custom",
      is_locked: false,
      nutrients: input.nutrients as never,
      amino_acids: input.amino_acids as never,
      notes: input.notes?.trim() || null,
      is_active: input.is_active ?? true,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function getMasterItem(id: string): Promise<MasterItem | null> {
  const { data, error } = await supabase
    .from("master_items")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? asItem(data) : null;
}

export const masterItemQuery = (id: string) =>
  queryOptions({
    queryKey: ["master-item", id],
    queryFn: () => getMasterItem(id),
    enabled: Boolean(id),
  });

export async function updateMasterItem(
  id: string,
  rawInput: MasterItemInput,
  options: { partialNutrients?: boolean } = {},
) {
  const input = validateInput(rawInput, {
    requireAllNutrients: !options.partialNutrients,
  });
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from("master_items")
    .update({
      name: input.name.trim(),
      category: input.category,
      quantity_g: Number(input.quantity_g),
      nutrients: input.nutrients as never,
      amino_acids: input.amino_acids as never,
      notes: input.notes?.trim() || null,
      is_active: input.is_active ?? true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", userId)
    .eq("is_locked", false)
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw new Error("This item is read-only or no longer exists");
}

export async function deleteMasterItem(id: string) {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from("master_items")
    .delete()
    .eq("id", id)
    .eq("user_id", userId)
    .eq("is_locked", false)
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw new Error("This item is read-only or no longer exists");
}

/** Clone any item (built-in or custom) as an editable custom derivative. */
export async function cloneMasterItem(item: MasterItem, newName?: string): Promise<string> {
  return createMasterItem({
    name: newName?.trim() || `${item.name} (Custom)`,
    category: item.category,
    quantity_g: item.quantity_g,
    nutrients: { ...item.nutrients },
    amino_acids: { ...item.amino_acids },
    ...(item.notes ? { notes: item.notes } : {}),
    is_active: true,
    source: "custom",
  });
}

/**
 * Pins live in `master_item_pins`, so built-in (locked, read-only) ingredients
 * can be pinned too. `master_items.is_pinned` is kept for backwards compatibility.
 */
export async function setMasterPinned(id: string, pinned: boolean) {
  const userId = await requireUserId();
  const { error } = pinned
    ? await supabase
        .from("master_item_pins")
        .upsert({ user_id: userId, item_id: id }, { onConflict: "user_id,item_id" })
    : await supabase.from("master_item_pins").delete().eq("user_id", userId).eq("item_id", id);
  if (error) throw error;
}

export const masterItemsQuery = () =>
  queryOptions({ queryKey: ["master-items"], queryFn: listMasterItems });
