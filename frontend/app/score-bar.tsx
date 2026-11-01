const SCORES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/** A 1 to 10 score. Clicking the selected score clears it (unscored is allowed). */
export function ScoreBar({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-0.5">
      {SCORES.map((n) => {
        const checked = value === n;
        const filled = value !== null && n <= value;
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={`Score ${n}`}
            onClick={() => onChange(checked ? null : n)}
            className={`flex h-6 w-6 items-center justify-center rounded-sm text-[10px] sm:h-[18px] sm:w-[14px] ${
              filled ? "bg-forest text-surface" : "bg-chatbg text-muted"
            }`}
          >
            <span className="sm:hidden">{n}</span>
          </button>
        );
      })}
    </div>
  );
}
