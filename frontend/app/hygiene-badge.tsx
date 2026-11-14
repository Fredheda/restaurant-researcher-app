/**
 * Food hygiene rating (FSA FHRS), styled after the official sticker: a
 * green field with the large numeral and the "Food hygiene rating" caption.
 * The large size also shows the 0 to 5 scale with the rating highlighted.
 * `null` means the FSA has no match ("Not rated"); `undefined` means the
 * lookup did not run, and the badge is hidden.
 */
export function HygieneBadge({
  rating,
  size = "sm",
}: {
  rating: number | null | undefined;
  size?: "sm" | "lg";
}) {
  if (rating === undefined) return null;
  const large = size === "lg";
  const label =
    rating === null ? "Food hygiene rating: not rated" : `Food hygiene rating ${rating} out of 5`;
  const notRated = rating === null;

  return (
    <span
      role="img"
      aria-label={label}
      className={`inline-flex items-center gap-1.5 rounded-sm border border-hyg-fg/30 bg-hyg-bg text-hyg-fg ${
        large ? "px-2.5 py-1.5" : "px-1.5 py-0.5"
      }`}
    >
      <span aria-hidden="true" className="flex flex-col leading-none">
        <span className={`font-semibold tracking-wide uppercase ${large ? "text-[10px]" : "text-[8px]"}`}>
          Food hygiene rating
        </span>
        {large && rating !== null && (
          <span className="mt-1 flex gap-0.5">
            {[0, 1, 2, 3, 4, 5].map((step) => (
              <span
                key={step}
                data-testid={`hygiene-step-${step}`}
                data-current={String(step === rating)}
                className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold ${
                  step === rating ? "bg-hyg-fg text-surface" : "bg-surface/70 text-hyg-fg/60"
                }`}
              >
                {step}
              </span>
            ))}
          </span>
        )}
      </span>
      <span
        aria-hidden="true"
        className={`font-display font-bold leading-none ${
          notRated ? (large ? "text-sm" : "text-[11px]") : large ? "text-3xl" : "text-lg"
        }`}
      >
        {rating === null ? "Not rated" : rating}
      </span>
    </span>
  );
}
