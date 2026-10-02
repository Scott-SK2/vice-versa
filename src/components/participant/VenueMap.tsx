"use client";

import { Pill, type StationState } from "./ui";

export type MapStation = { code: string; title: string; state: StationState; is_here: boolean; x_pct: number | null; y_pct: number | null; counts_in_progress: boolean };

/**
 * Plan SVG avec pastilles positionnées en % et pin « Je suis ici » (05 § 4).
 * Le plan est affiché dans une balise <img> : un SVG servi par le CDN ne peut ainsi
 * exécuter aucun script ni gestionnaire d'événement, quelle que soit la CSP.
 */
export function VenueMap({ svgUrl, width, height, stations, onSelect }: { svgUrl: string; width: number; height: number; stations: MapStation[]; onSelect: (code: string) => void }) {
  return (
    <div className="relative w-full overflow-hidden rounded-card border border-state-locked bg-white" style={{ aspectRatio: `${width} / ${height}` }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={svgUrl} alt="" className="absolute inset-0 h-full w-full object-contain" draggable={false} />
      {stations
        .filter((s) => s.x_pct !== null && s.y_pct !== null)
        .map((s) => (
          <button
            key={s.code}
            onClick={() => onSelect(s.code)}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${s.x_pct}%`, top: `${s.y_pct}%` }}
            aria-label={`${s.code} · ${s.title}`}
          >
            <Pill state={s.state} code={s.code} here={s.is_here} />
          </button>
        ))}
    </div>
  );
}
