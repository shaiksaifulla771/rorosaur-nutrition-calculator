import { Minus, Plus } from "lucide-react";

/** Gram quantity input with − / + steppers (step 1 g, shift+click = 5 g). */
export function QuantityStepper({
  value,
  onChange,
  label,
  step = 1,
}: {
  value: number;
  onChange: (next: number) => void;
  label: string;
  step?: number;
}) {
  const bump = (dir: 1 | -1, big: boolean) => {
    const s = big ? step * 5 : step;
    onChange(Math.max(0, Math.round((value + dir * s) * 100) / 100));
  };
  const btn =
    "flex size-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-40";
  return (
    <div className="inline-flex items-center gap-1">
      <button
        type="button"
        className={btn}
        onClick={(e) => bump(-1, e.shiftKey)}
        aria-label={`Decrease ${label}`}
        disabled={value <= 0}
      >
        <Minus className="size-3.5" />
      </button>
      <input
        type="number"
        min={0}
        step="any"
        value={value}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
        aria-label={label}
        className="w-16 rounded-md border border-input bg-background px-2 py-1 text-right text-sm tabular-nums outline-none focus:ring-2 focus:ring-ring"
      />
      <button
        type="button"
        className={btn}
        onClick={(e) => bump(1, e.shiftKey)}
        aria-label={`Increase ${label}`}
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}
