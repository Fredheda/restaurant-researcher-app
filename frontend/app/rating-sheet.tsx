"use client";

import { useRef, useState } from "react";
import { ScoreBar } from "./score-bar";

export type ScoredLine = { id: string; name: string; price?: string; score: number | null };

export type VisitDraft = {
  visitedOn: string;
  dishes: ScoredLine[];
  cocktails: ScoredLine[];
  restaurant: number | null;
  vibe: number | null;
  staff: number | null;
  service: number | null;
  note: string;
  receiptName?: string;
};

type Aspect = "restaurant" | "vibe" | "staff" | "service";
type LineKind = "dishes" | "cocktails";

const ASPECTS: { key: Aspect; label: string }[] = [
  { key: "restaurant", label: "Restaurant" },
  { key: "vibe", label: "Vibe" },
  { key: "staff", label: "Staff friendliness" },
  { key: "service", label: "Service" },
];

function LineRow({
  line,
  kind,
  onChange,
}: {
  line: ScoredLine;
  kind: "dish" | "cocktail";
  onChange: (next: ScoredLine) => void;
}) {
  return (
    <div
      data-line
      className="flex flex-col gap-1 border-b border-hairline py-2 sm:grid sm:grid-cols-[1fr_24px_auto] sm:items-center sm:gap-2"
    >
      {line.name === "" ? (
        <input
          aria-label={`New ${kind} name`}
          value={line.name}
          onChange={(e) => onChange({ ...line, name: e.target.value })}
          placeholder={`New ${kind}`}
          className="min-w-0 rounded-sm border border-hairline px-2 py-1 text-sm"
        />
      ) : (
        <span className="min-w-0 text-sm break-words">
          {line.name}
          {line.price && <span className="ml-1 text-muted">{line.price}</span>}
        </span>
      )}
      <span className="hidden text-right text-xs text-muted sm:block">{line.score ?? "–"}</span>
      <ScoreBar
        label={`${line.name || `New ${kind}`} score`}
        value={line.score}
        onChange={(score) => onChange({ ...line, score })}
      />
    </div>
  );
}

/** Controlled-by-itself rating form for one visit; Save hands the draft to `onSave`. */
export function RatingSheet({
  placeName,
  initial,
  onSave,
  onClose,
}: {
  placeName: string;
  initial: VisitDraft;
  onSave: (draft: VisitDraft) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<VisitDraft>(initial);
  const counter = useRef(0);

  function setLine(kind: LineKind, next: ScoredLine) {
    setDraft((d) => ({ ...d, [kind]: d[kind].map((l) => (l.id === next.id ? next : l)) }));
  }

  function addLine(kind: LineKind) {
    counter.current += 1;
    const line: ScoredLine = { id: `new-${counter.current}`, name: "", score: null };
    setDraft((d) => ({ ...d, [kind]: [...d[kind], line] }));
  }

  const invalid = [...draft.dishes, ...draft.cocktails].some(
    (l) => l.score !== null && l.name.trim() === ""
  );

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/40 p-3 sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label={`Rate ${placeName}`}
        className="max-h-[90dvh] w-full max-w-3xl overflow-y-auto rounded-lg bg-paper p-3 sm:p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-xl font-semibold break-words text-ink">{placeName}</h2>
            <p className="text-xs text-muted">Visit · {draft.visitedOn}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-muted">
            ✕
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-[1.3fr_1fr]">
          <div className="min-w-0 rounded-lg border border-hairline bg-surface p-3">
            {(
              [
                ["dishes", "Dishes", "dish", "Add a dish"],
                ["cocktails", "Cocktails", "cocktail", "Add a cocktail"],
              ] as const
            ).map(([kind, title, noun, addLabel]) => (
              <div key={kind} className="mb-3">
                <div className="text-sm font-semibold">{title}</div>
                {draft[kind].map((line) => (
                  <LineRow key={line.id} line={line} kind={noun} onChange={(l) => setLine(kind, l)} />
                ))}
                <button
                  type="button"
                  onClick={() => addLine(kind)}
                  className="mt-1 text-xs text-muted underline"
                >
                  {addLabel}
                </button>
              </div>
            ))}
          </div>

          <div className="flex min-w-0 flex-col gap-3">
            <div className="rounded-lg border border-hairline bg-surface p-3">
              <div className="mb-1 text-sm font-semibold">The place</div>
              {ASPECTS.map(({ key, label }) => (
                <div
                  key={key}
                  className="flex flex-col gap-1 border-b border-hairline py-2 last:border-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="text-sm">{label}</span>
                  <ScoreBar
                    label={label}
                    value={draft[key]}
                    onChange={(v) => setDraft((d) => ({ ...d, [key]: v }))}
                  />
                </div>
              ))}
            </div>
            <label className="rounded-lg border border-hairline bg-surface p-3 text-sm font-semibold">
              Note <span className="font-normal text-muted">(optional)</span>
              <textarea
                value={draft.note}
                onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
                className="mt-1 min-h-[3rem] w-full rounded-sm border border-hairline p-1.5 text-sm font-normal"
              />
            </label>
            <div className="mt-auto flex items-center justify-between gap-2">
              <span className="min-w-0 text-xs break-words text-muted">
                {draft.receiptName ? `Receipt: ${draft.receiptName} ✓` : ""}
              </span>
              <button
                type="button"
                disabled={invalid}
                onClick={() => onSave(draft)}
                className="flex-shrink-0 rounded-sm bg-ink px-4 py-2 text-sm font-semibold text-paper disabled:opacity-40"
              >
                Save visit
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
