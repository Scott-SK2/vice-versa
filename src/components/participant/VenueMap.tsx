"use client";

import { useEffect, useState } from "react";
import { Pill, type StationState } from "./ui";

export type MapStation = { code: string; title: string; state: StationState; is_here: boolean; x_pct: number | null; y_pct: number | null; counts_in_progress: boolean };

/** Plan SVG inline avec pastilles positionnées en % et pin « Je suis ici » (05 § 4). */
export function VenueMap({ svgUrl, width, height, stations, onSelect }: { svgUrl: string; width: number; height: number; stations: MapStation[]; onSelect: (code: string) => void }) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(svgUrl)
      .then((r) => (r.ok ? r.text() : ""))
      .then((s) => alive && setSvg(s.replace(/<\?xml[^>]*>/, "").replace(/<script[\s\S]*?<\/script>/gi, "")))
      .catch(() => alive && setSvg(""));
    return () => {
      alive = false;
    };
  }, [svgUrl]);

  return (
    <div className="relative w-full overflow-hidden rounded-card border border-state-locked bg-white" style={{ aspectRatio: `${width} / ${height}` }}>
      {svg !== null && <div className="absolute inset-0 [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} aria-hidden />}
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
