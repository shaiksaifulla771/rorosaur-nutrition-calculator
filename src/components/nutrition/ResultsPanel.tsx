import { AlertTriangle, Info, ShieldCheck } from "lucide-react";
import type { RecipeTotals, SafetyFlag, ServingInfo } from "@/lib/nutrition/calc";
import { fmt, NUTRIENT_KEYS } from "@/lib/nutrition/calc";
import { AMINO_LABELS, NUTRIENT_LABELS, type NutrientKey } from "@/lib/nutrition/reference";
import { SHOW_AAS_SCORE } from "@/lib/flags";
import { cn } from "@/lib/utils";

/** PRD §4.2 ordering: energy, protein, fat, then micronutrients; remaining keys after. */
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
const ORDER: NutrientKey[] = [...PRIMARY, ...NUTRIENT_KEYS.filter((k) => !PRIMARY.includes(k))];

export function ResultsPanel({
  totals,
  flags,
  serving,
  compact = false,
}: {
  totals: RecipeTotals;
  flags: SafetyFlag[];
  serving?: ServingInfo | undefined;
  compact?: boolean;
}) {
  const blocking = flags.filter((f) => f.severity === "blocking");
  const advisory = flags.filter((f) => f.severity === "advisory");
  const hasServing = Boolean(serving?.perServing);
  const hasProtein = totals.nutrients.protein_g > 0;
  const aasRatio = totals.aas / 100;
  const good = totals.aas >= 100;
  const proteinShown = hasServing ? serving!.perServing!.protein_g : totals.nutrients.protein_g;

  return (
    <div className="space-y-4">
      {/* Protein quality card */}
      <section className="rounded-xl border border-border bg-card p-4 print-block">
        <h2 className="font-display text-base font-semibold">Protein quality (WHO 2007)</h2>
        <div className="mt-3 grid grid-cols-2 gap-3">
          {SHOW_AAS_SCORE && (
            <ScoreBox
              label="Amino acid score"
              value={hasProtein ? aasRatio.toFixed(2) : "–"}
              tone={!hasProtein ? "muted" : good ? "good" : "clay"}
            />
          )}
          <ScoreBox
            label="Total protein"
            value={fmt(proteinShown, 1)}
            suffix={hasServing ? "g/serv" : "g/batch"}
            tone="ink"
          />
        </div>


        {!compact && (
          <table className="mt-4 w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="py-1.5 font-medium">Indispensable AA</th>
                <th className="py-1.5 text-right font-medium">mg/g prot</th>
                <th className="py-1.5 text-right font-medium">Ref</th>
                <th className="py-1.5 text-right font-medium">Ratio</th>
              </tr>
            </thead>
            <tbody>
              {totals.aminoScores.map((s) => (
                <tr key={s.key} className="border-t border-border">
                  <td className="py-1.5">{AMINO_LABELS[s.key]}</td>
                  <td className="py-1.5 text-right tabular-nums">{fmt(s.mgPerG)}</td>
                  <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                    {fmt(s.requirement)}
                  </td>
                  <td
                    className={cn(
                      "py-1.5 text-right tabular-nums",
                      hasProtein && s.ratio < 1 ? "text-destructive" : "text-primary",
                    )}
                  >
                    {hasProtein ? s.ratio.toFixed(2) : "–"}
                  </td>
                </tr>
              ))}
            </tbody>

          </table>
        )}
      </section>

      {/* Safety flags */}
      {(blocking.length > 0 || advisory.length > 0) && (
        <div className="space-y-2 print-block">
          {blocking.map((f) => (
            <Flag key={f.id} flag={f} tone="bad" />
          ))}
          {advisory.map((f) => (
            <Flag key={f.id} flag={f} tone="warn" />
          ))}
        </div>
      )}
      {blocking.length === 0 && advisory.length === 0 && totals.totalGrams > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
          <ShieldCheck className="size-4 text-primary" /> No safety flags for this age band.
        </div>
      )}

      {/* %RDA card */}
      <section className="overflow-hidden rounded-xl border border-border bg-card print-block">
        <div className="px-4 pb-1 pt-4">
          <h2 className="font-display text-base font-semibold">
            Vitamins, minerals &amp; fat — {hasServing ? "per serving" : "whole batch"}
          </h2>
          <p className="text-xs text-muted-foreground">
            {hasServing
              ? "Per-serving values scale with actual output. Bars: amber < 20 %, green ≥ 25 % of daily target."
              : "Set actual output and serving size to see per-serving % RDA."}
          </p>
        </div>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-1.5 font-medium">Nutrient</th>
              {hasServing && <th className="px-2 py-1.5 text-right font-medium">Per serving</th>}
              <th className="px-2 py-1.5 text-right font-medium">Batch</th>
              {serving?.per100gCooked && (
                <th className="px-2 py-1.5 text-right font-medium">/100 g cooked</th>
              )}
              <th className="px-2 py-1.5 text-right font-medium">RDA</th>
              <th className="w-40 px-4 py-1.5 text-right font-medium">% RDA</th>
            </tr>
          </thead>
          <tbody>
            {ORDER.map((key) => {
              const target = totals.rdaUsed?.[key];
              const pct = hasServing
                ? serving!.perServingRdaPercent?.[key]
                : totals.rdaPercent[key];
              return (
                <tr key={key} className="border-t border-border">
                  <td className="px-4 py-1.5">{NUTRIENT_LABELS[key]}</td>
                  {hasServing && (
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {fmt(serving!.perServing![key])}
                    </td>
                  )}
                  <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                    {fmt(totals.nutrients[key])}
                  </td>
                  {serving?.per100gCooked && (
                    <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                      {fmt(serving.per100gCooked[key])}
                    </td>
                  )}
                  <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                    {target ? fmt(target) : "–"}
                  </td>
                  <td className="px-4 py-1.5">
                    <PctBar pct={pct} nutrient={key} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {totals.rdaUsed && (
          <p className="border-t border-border px-4 py-1.5 text-[11px] text-muted-foreground">
            RDA targets: ICMR-NIN 2020 / band defaults, editable under Master Data → RDA targets.
          </p>
        )}
      </section>
    </div>
  );
}

function PctBar({ pct, nutrient }: { pct: number | undefined; nutrient: NutrientKey }) {
  if (pct === undefined) return <span className="block text-right text-muted-foreground">–</span>;
  const excess = nutrient === "sodium_mg" && pct > 100;
  const tone = excess
    ? "bg-destructive"
    : pct >= 25
      ? "bg-success"
      : pct < 20
        ? "bg-warning"
        : "bg-primary/60";
  return (
    <div className="flex items-center justify-end gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-secondary">
        <div
          className={cn("h-full rounded-full", tone)}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <span className={cn("w-12 text-right tabular-nums", excess && "text-destructive")}>
        {fmt(pct, 0)}%
      </span>
    </div>
  );
}

function ScoreBox({
  label,
  value,
  suffix,
  tone,
  small = false,
}: {
  label: string;
  value: string;
  suffix?: string;
  tone: "good" | "clay" | "ink" | "muted";
  small?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-1 font-display font-semibold leading-none",
          small ? "text-base" : "text-2xl",
          tone === "good" && "text-success",
          tone === "clay" && "text-warning",
          tone === "muted" && "text-muted-foreground",
        )}
      >
        {value}
        {suffix && (
          <small className="ml-1 text-xs font-normal text-muted-foreground">{suffix}</small>
        )}
      </div>
    </div>
  );
}

function Flag({ flag, tone }: { flag: SafetyFlag; tone: "bad" | "warn" }) {
  const Icon = tone === "bad" ? AlertTriangle : Info;
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-lg border px-3 py-2 text-sm",
        tone === "bad"
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : "border-border bg-secondary text-secondary-foreground",
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      <span>
        {flag.message}
        {flag.ingredient && <span className="opacity-70"> ({flag.ingredient})</span>}
      </span>
    </div>
  );
}
