import type { RecipeIngredient, RecipeTotals, SafetyFlag, ServingInfo } from "./nutrition/calc";
import { fmt, fmtCell, NUTRIENT_KEYS } from "./nutrition/calc";
import {
  AGE_BANDS,
  AMINO_LABELS,
  NUTRIENT_LABELS,
  type AgeBand,
  type NutrientKey,
} from "./nutrition/reference";
import type { MasterItem } from "./master";
import { exportFileName, sanitizeExportText, specSheetFileName } from "./share";
import { SHOW_AAS_SCORE } from "./flags";

/** Date + time of export, so a printed sheet is always traceable to a moment. */
function exportStamp(): string {
  return new Date().toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const PRIMARY: NutrientKey[] = [
  "kcal",
  "protein_g",
  "fat_g",
  "calcium_mg",
  "iron_mg",
  "zinc_mg",
  "vita_ug",
  "vitc_mg",
  "vitd_ug",
  "folate_ug",
  "vitb12_ug",
];

const SAGE: [number, number, number] = [90, 122, 95];
const CLAY: [number, number, number] = [192, 107, 62];

/** Thrown when the PDF library chunk fails to download (offline / flaky network). Callers offer a retry. */
export class PdfLibraryLoadError extends Error {
  constructor() {
    super("The PDF generator could not be loaded. Check your connection and try again.");
    this.name = "PdfLibraryLoadError";
  }
}

async function loadPdfLibs() {
  try {
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
    ]);
    return { jsPDF, autoTable };
  } catch (e) {
    console.error("[pdf] library load failed", e);
    throw new PdfLibraryLoadError();
  }
}

const AMINO_KEYS = Object.keys(AMINO_LABELS) as (keyof typeof AMINO_LABELS)[];

/** Single-ingredient composition sheet (nutrients per 100 g + amino-acid profile). */
export async function exportIngredientPdf(item: MasterItem): Promise<void> {
  const { jsPDF, autoTable } = await loadPdfLibs();
  const clean = (v: unknown) => sanitizeExportText(v).slice(0, 2000);
  const doc = new jsPDF({ unit: "pt", format: "a4" });

  doc.setFontSize(9);
  doc.setTextColor(110);
  doc.text("ROROSAUR INGREDIENT SHEET", 40, 40);
  doc.setFontSize(18);
  doc.setTextColor(28, 38, 33);
  doc.text(clean(item.name) || "Ingredient", 40, 62);
  doc.setFontSize(10);
  doc.setTextColor(110);
  doc.text(
    [
      `Category: ${clean(item.category)}`,
      item.is_locked ? `Source: ${clean(item.source)} (built-in)` : "Source: custom",
      exportStamp(),
    ].join("  ·  "),
    40,
    78,
  );
  doc.setTextColor(0);

  autoTable(doc, {
    startY: 96,
    head: [["Nutrient (per 100 g)", "Value"]],
    body: NUTRIENT_KEYS.map((k) => [NUTRIENT_LABELS[k], fmtCell(item.nutrients[k])]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: SAGE },
    columnStyles: { 1: { halign: "right" } },
  });
  autoTable(doc, {
    head: [["Indispensable amino acid", "mg / g protein"]],
    body: AMINO_KEYS.map((k) => [AMINO_LABELS[k], fmtCell(item.amino_acids[k])]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: SAGE },
    columnStyles: { 1: { halign: "right" } },
  });
  if (item.notes?.trim()) {
    const y =
      (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 700;
    doc.setFontSize(12);
    doc.text("Notes", 40, y + 30);
    doc.setFontSize(10);
    doc.text(doc.splitTextToSize(clean(item.notes), 515) as string[], 40, y + 48);
  }
  doc.setFontSize(8);
  doc.setTextColor(140);
  doc.text("Generated via Rorosaur Nutrition Platform", 40, 820);
  doc.save(exportFileName(`${item.name}_Ingredient`, "pdf"));
}

/**
 * Rorosaur clinical spec sheet (SRD §5.2) — strictly one A4 page.
 * Rendered with compact tables; if the content still overflows, optional
 * sections are dropped in order (amino-acid detail → notes → safety table)
 * until the document fits on page 1 of 1.
 */
export async function exportRecipePdf(input: {
  name: string;
  projectName?: string | null;
  ageBand: AgeBand;
  version?: number | null;
  ingredients: RecipeIngredient[];
  totals: RecipeTotals;
  flags: SafetyFlag[];
  prepNotes: string;
  serving?: ServingInfo;
}): Promise<void> {
  const { jsPDF, autoTable } = await loadPdfLibs();
  const clean = (v: unknown) => sanitizeExportText(v).slice(0, 2000);
  const bandLabel = AGE_BANDS.find((b) => b.value === input.ageBand)?.label ?? input.ageBand;
  const s = input.serving;
  const t = input.totals;
  const perServing = s?.perServing ?? null;

  const MARGIN = 30;
  const PAGE_H = 842;
  const FOOTER_Y = PAGE_H - 22;
  const CONTENT_BOTTOM = FOOTER_Y - 14;
  const base = {
    margin: { left: MARGIN, right: MARGIN, top: MARGIN, bottom: PAGE_H - CONTENT_BOTTOM },
    styles: { fontSize: 8.5, cellPadding: 2.5 },
    headStyles: { fillColor: SAGE, fontSize: 8.5 },
    pageBreak: "avoid" as const,
    rowPageBreak: "avoid" as const,
  };

  type Level = { amino: boolean; notes: boolean; safety: boolean; maxIngredients: number };
  const LEVELS: Level[] = [
    { amino: true, notes: true, safety: true, maxIngredients: 40 },
    { amino: false, notes: true, safety: true, maxIngredients: 40 },
    { amino: false, notes: false, safety: true, maxIngredients: 40 },
    { amino: false, notes: false, safety: false, maxIngredients: 25 },
    { amino: false, notes: false, safety: false, maxIngredients: 15 },
  ];

  const render = (level: Level) => {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const lastY = () =>
      (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 96;

    // Header
    doc.setFontSize(8);
    doc.setTextColor(110);
    doc.text("ROROSAUR RECIPE SPEC", MARGIN, 34);
    doc.setFontSize(16);
    doc.setTextColor(28, 38, 33);
    doc.text(clean(input.name) || "Untitled recipe", MARGIN, 54);
    doc.setFontSize(9);
    doc.setTextColor(110);
    doc.text(
      [
        input.projectName ? `Project: ${clean(input.projectName)}` : null,
        `Reference: ${bandLabel}`,
        input.version ? `v${input.version}` : null,
        exportStamp(),
      ]
        .filter(Boolean)
        .join("  ·  "),
      MARGIN,
      68,
    );
    doc.setTextColor(0);

    // Yield summary
    const delta = s?.moistureDeltaG;
    autoTable(doc, {
      ...base,
      startY: 80,
      head: [
        [
          "Dry weight",
          "Cooked weight",
          "Yield factor",
          "Water gained / lost",
          "Serving size",
          "Servings",
        ],
      ],
      body: [
        [
          `${fmt(t.totalGrams, 0)} g`,
          s?.actualOutputG ? `${fmt(s.actualOutputG, 0)} g` : "–",
          s?.yieldFactor != null ? `${s.yieldFactor}×` : "–",
          delta == null ? "–" : `${delta >= 0 ? "+" : "−"}${fmt(Math.abs(delta), 0)} g`,
          s?.servingSizeG ? `${fmt(s.servingSizeG, 0)} g` : "–",
          s?.servings != null ? fmt(s.servings, 1) : "–",
        ],
      ],
      styles: { ...base.styles, halign: "center" },
    });

    // Ingredients
    const shown = input.ingredients.slice(0, level.maxIngredients);
    const hidden = input.ingredients.length - shown.length;
    autoTable(doc, {
      ...base,
      startY: lastY() + 6,
      head: [["Ingredient", "Dry qty (g)", "Protein/100 g", "Protein (g)", "kcal"]],
      body: [
        ...shown.map((i) => [
          clean(i.name),
          fmt(i.grams, 0),
          fmt(i.nutrients?.protein_g ?? 0, 1),
          fmt(((i.nutrients?.protein_g ?? 0) * i.grams) / 100, 2),
          String(Math.round(((i.nutrients?.kcal ?? 0) * i.grams) / 100)),
        ]),
        ...(hidden > 0
          ? [[`+ ${hidden} more ingredient${hidden === 1 ? "" : "s"}`, "", "", "", ""]]
          : []),
      ],
      foot: [
        [
          "Dry batch total",
          fmt(t.totalGrams, 0),
          "",
          fmt(t.nutrients.protein_g, 2),
          fmt(t.nutrients.kcal, 0),
        ],
      ],
      footStyles: { fillColor: [240, 236, 226], textColor: 30, fontStyle: "bold", fontSize: 8.5 },
      columnStyles: {
        1: { halign: "right" },
        2: { halign: "right" },
        3: { halign: "right" },
        4: { halign: "right" },
      },
    });

    // Protein quality
    const aas = (t.aas / 100).toFixed(2);
    autoTable(doc, {
      ...base,
      startY: lastY() + 6,
      head: [["Protein quality (WHO/FAO/UNU 2007)", "Value", "Assessment"]],
      body: [
        ...(SHOW_AAS_SCORE
          ? [["Amino acid score", aas, t.aas >= 100 ? "sufficient" : "below reference"]]
          : []),
        [
          "Total protein",
          `${fmt(perServing?.protein_g ?? t.nutrients.protein_g, 1)} g`,
          perServing ? "per serving" : "per batch",
        ],
      ],
      bodyStyles: { fontStyle: "bold" },
    });

    if (level.amino) {
      autoTable(doc, {
        ...base,
        startY: lastY() + 6,
        head: [["Indispensable amino acid", "mg / g protein", "Reference", "Ratio"]],
        body: t.aminoScores.map((a) => [
          AMINO_LABELS[a.key],
          fmt(a.mgPerG),
          fmt(a.requirement),
          a.ratio.toFixed(2),
        ]),
        columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" } },
      });
    }

    // Key micronutrients (%RDA) — primary nutrients only
    const pct = perServing ? (s!.perServingRdaPercent ?? {}) : t.rdaPercent;
    autoTable(doc, {
      ...base,
      startY: lastY() + 6,
      head: [
        [
          "Key nutrient",
          perServing ? "Per serving" : "Batch",
          ...(s?.per100gCooked ? ["Per 100 g cooked"] : []),
          "RDA target",
          "% RDA",
        ],
      ],
      body: PRIMARY.map((k) => [
        NUTRIENT_LABELS[k],
        fmt(perServing ? perServing[k] : t.nutrients[k]),
        ...(s?.per100gCooked ? [fmt(s.per100gCooked[k])] : []),
        t.rdaUsed?.[k] ? fmt(t.rdaUsed[k]) : "–",
        pct[k] === undefined ? "–" : `${fmt(pct[k], 0)}%`,
      ]),
      columnStyles: {
        1: { halign: "right" },
        2: { halign: "right" },
        3: { halign: "right" },
        4: { halign: "right" },
      },
    });

    if (level.safety && input.flags.length > 0) {
      autoTable(doc, {
        ...base,
        startY: lastY() + 6,
        head: [["Severity", "Safety note"]],
        body: input.flags.slice(0, 6).map((f) => [f.severity, clean(f.message).slice(0, 220)]),
        styles: { ...base.styles, cellWidth: "wrap" },
        headStyles: { fillColor: CLAY, fontSize: 8.5 },
      });
    }

    if (level.notes && input.prepNotes.trim()) {
      const y = lastY() + 16;
      const lines = doc.splitTextToSize(clean(input.prepNotes).slice(0, 600), 535) as string[];
      const maxLines = Math.max(0, Math.floor((CONTENT_BOTTOM - y - 12) / 10));
      if (maxLines > 0) {
        doc.setFontSize(10);
        doc.setTextColor(0);
        doc.text("Preparation", MARGIN, y);
        doc.setFontSize(8.5);
        doc.text(lines.slice(0, maxLines), MARGIN, y + 12);
      }
    }

    const pages = doc.getNumberOfPages();
    doc.setPage(1);
    doc.setFontSize(7.5);
    doc.setTextColor(140);
    doc.text("Generated via Rorosaur Nutrition Platform · Page 1 of 1", MARGIN, FOOTER_Y);
    return { doc, pages };
  };

  let result = render(LEVELS[0]!);
  for (let i = 1; i < LEVELS.length && result.pages > 1; i++) result = render(LEVELS[i]!);
  if (result.pages > 1) {
    // Last resort: never emit a second page.
    while (result.doc.getNumberOfPages() > 1) result.doc.deletePage(result.doc.getNumberOfPages());
  }

  result.doc.save(specSheetFileName(input.name));
}
