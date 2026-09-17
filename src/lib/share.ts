// Client-side share payload builders (Gmail / WhatsApp) and CSV export.
import type { RecipeIngredient, RecipeTotals, ServingInfo } from "./nutrition/calc";
import { fmt, NUTRIENT_KEYS } from "./nutrition/calc";
import {
  AMINO_LABELS,
  NUTRIENT_LABELS,
  type AminoAcidKey,
  type NutrientKey,
} from "./nutrition/reference";
import type { MasterItem } from "./master";
import type { RecipeWithVersion } from "./recipes";
import { SHOW_AAS_SCORE } from "./flags";

const AMINO_KEYS = Object.keys(AMINO_LABELS) as AminoAcidKey[];

export type ShareInput = {
  name: string;
  projectName?: string | null;
  ingredients: RecipeIngredient[];
  totals: RecipeTotals;
  serving: ServingInfo;
  /** Same-origin link to the recipe page (only meaningful for the signed-in owner). */
  url?: string | null;
};

/** Hard cap for client-side CSV exports (keeps the browser responsive). */
export const CSV_MAX_ROWS = 500;

const n = (v: number | undefined | null, d = 0) => (v == null ? "–" : fmt(v, d));

/** Plain-text spec (SRD §5.3 format). */
export function buildShareText(i: ShareInput): string {
  const s = i.serving;
  const perServing = s.perServing;
  const pct = s.perServingRdaPercent ?? i.totals.rdaPercent;
  const aas = (i.totals.aas / 100).toFixed(2);
  const limiting = i.totals.limitingAminoAcid ? AMINO_LABELS[i.totals.limitingAminoAcid] : "none";
  const delta = s.moistureDeltaG;
  const lines = [
    `🌿 *Rorosaur Recipe Spec: ${i.name}*`,
    `📁 Project: ${i.projectName ?? "—"}`,
    `⚖️ Batch Yield: ${n(s.dryBatchG)}g dry ➔ ${n(s.actualOutputG)}g cooked (${s.yieldFactor ?? "–"}x)`,
    `💧 Moisture Delta: ${delta == null ? "–" : `${delta >= 0 ? "+" : ""}${n(delta)}g`}`,
    "",
    "🧾 *Ingredients*",
    ...i.ingredients.map((x) => `• ${x.name}: ${n(x.grams)} g`),
    "",
    "🧬 *Protein Quality (WHO 2007)*",
    ...(SHOW_AAS_SCORE ? [`• AAS Score: ${aas}`] : []),
    `• Limiting AA: ${limiting}`,
    `• Total Protein: ${n(perServing?.protein_g ?? i.totals.nutrients.protein_g, 1)}g/${perServing ? "serving" : "batch"}`,
    "",
    "🥦 *Key Micronutrients (% RDA)*",
    `• Calcium: ${n(pct.calcium_mg)}% · Iron: ${n(pct.iron_mg)}% · Zinc: ${n(pct.zinc_mg)}%`,
    `• Vit A: ${n(pct.vita_ug)}% · Vit C: ${n(pct.vitc_mg)}% · Folate: ${n(pct.folate_ug)}%`,
    "",
    "_Generated via Rorosaur Nutrition Platform_",
  ];
  return lines.join("\n");
}

export function gmailShareUrl(i: ShareInput): string {
  const subject = `Rorosaur Recipe Spec: ${i.name}`;
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(buildShareText(i))}`;
}

export function whatsappShareUrl(i: ShareInput): string {
  return `https://wa.me/?text=${encodeURIComponent(buildShareText(i))}`;
}

export function specSheetFileName(name: string): string {
  const safe = (name || "Recipe")
    .trim()
    .replace(/[^\w\- ]+/g, "")
    .replace(/\s+/g, "_");
  return `${safe || "Recipe"}_SpecSheet.pdf`;
}

/** Strip control characters that could break exports or hide content. */
export function sanitizeExportText(v: unknown): string {
  return (v == null ? "" : String(v)).replace(
    // eslint-disable-next-line no-control-regex
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,
    "",
  );
}

/** CSV cell: sanitised, quoted, and guarded against spreadsheet formula injection (=, +, -, @, tab, CR). */
export function csvCell(v: unknown): string {
  let s = sanitizeExportText(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV of the recipe catalog (SRD 4.2 export). */
export function recipesToCsv(rows: RecipeWithVersion[]): string {
  const head = [
    "Recipe",
    "Project",
    "Age band",
    "Version",
    "Dry batch g",
    "Actual output g",
    "Serving size g",
    "kcal",
    "Protein g",
    ...(SHOW_AAS_SCORE ? ["AAS %"] : []),
    "Limiting AA",
    "Flags",
    "Updated",
  ];
  const esc = (v: unknown) => csvCell(v);
  const body = rows.map((r) => {
    const t = r.current?.totals;
    return [
      r.name,
      r.project?.name ?? "",
      r.age_band,
      r.current?.version_number ?? "",
      t?.totalGrams != null ? Math.round(t.totalGrams) : "",
      r.current?.actual_output_g ?? "",
      r.current?.serving_size_g ?? "",
      r.current?.total_calories ?? "",
      t?.nutrients?.protein_g != null ? t.nutrients.protein_g.toFixed(1) : "",
      ...(SHOW_AAS_SCORE ? [r.current?.aas_score ?? ""] : []),
      t?.limitingAminoAcid ? AMINO_LABELS[t.limitingAminoAcid] : t ? "none" : "",
      (r.current?.safety_flags ?? []).length,
      r.updated_at,
    ]
      .map(esc)
      .join(",");
  });
  return [head.join(","), ...body].join("\n");
}

/** CSV of master-data rows (per 100 g). Caller is responsible for capping to CSV_MAX_ROWS. */
export function masterItemsToCsv(rows: MasterItem[]): string {
  const head = [
    "Name",
    "Category",
    "Source",
    "Built-in",
    ...NUTRIENT_KEYS.map((k) => NUTRIENT_LABELS[k]),
    ...AMINO_KEYS.map((k) => `${AMINO_LABELS[k]} (mg/g protein)`),
  ];
  const body = rows
    .slice(0, CSV_MAX_ROWS)
    .map((r) =>
      [
        r.name,
        r.category,
        r.source,
        r.is_locked ? "yes" : "no",
        ...NUTRIENT_KEYS.map((k) => numOrBlank(r.nutrients[k])),
        ...AMINO_KEYS.map((k) => numOrBlank(r.amino_acids[k])),
      ]
        .map(csvCell)
        .join(","),
    );
  return [head.join(","), ...body].join("\n");
}

/** Long-format CSV of a single ingredient: one line per nutrient / amino acid. */
export function ingredientToCsv(item: MasterItem): string {
  const head = ["Ingredient", "Section", "Field", "Value", "Unit"];
  const meta = { name: item.name, source: item.is_locked ? item.source : "Custom" };
  const rows: unknown[][] = [
    [meta.name, "Meta", "Category", item.category, ""],
    [meta.name, "Meta", "Source", meta.source, ""],
    ...NUTRIENT_KEYS.map((k) => [
      meta.name,
      "Nutrient per 100 g",
      NUTRIENT_LABELS[k],
      numOrBlank(item.nutrients[k]),
      unitOf(k),
    ]),
    ...AMINO_KEYS.map((k) => [
      meta.name,
      "Amino acid",
      AMINO_LABELS[k],
      numOrBlank(item.amino_acids[k]),
      "mg/g protein",
    ]),
  ];
  return [head.join(","), ...rows.map((r) => r.map(csvCell).join(","))].join("\n");
}

function numOrBlank(v: unknown): string {
  const n = typeof v === "number" ? v : Number(v);
  return v === undefined || v === null || v === "" || !Number.isFinite(n) ? "" : String(n);
}

function unitOf(k: NutrientKey): string {
  if (k === "kcal") return "kcal";
  if (k.endsWith("_g")) return "g";
  if (k.endsWith("_mg")) return "mg";
  return "mcg";
}

export function exportFileName(base: string, ext: string): string {
  const safe = sanitizeExportText(base)
    .trim()
    .replace(/[^\w\- ]+/g, "")
    .replace(/\s+/g, "_");
  return `${safe || "export"}.${ext}`;
}

export function downloadText(filename: string, text: string, mime = "text/csv") {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = sanitizeExportText(filename).replace(/[\\/:*?"<>|]/g, "_");
  a.click();
  URL.revokeObjectURL(url);
}
