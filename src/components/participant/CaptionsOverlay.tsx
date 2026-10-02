"use client";

import { type RefObject, useEffect, useRef, useState } from "react";

type Word = { w: string; start: number; end: number };
type Segment = { id: number; start: number; end: number; text: string; words?: Word[] };
type CaptionFile = { segments: Segment[] };
type Group = { start: number; end: number; words: Word[] };
const MAX_WORDS = 3;

/** Découpe chaque segment en groupes de 3 mots maximum, horodatés. */
function buildGroups(file: CaptionFile): Group[] {
  const groups: Group[] = [];
  for (const seg of file.segments) {
    const words = seg.words?.length
      ? seg.words
      : seg.text.split(/\s+/).filter(Boolean).map((w, i, arr) => {
          const d = (seg.end - seg.start) / arr.length;
          return { w, start: seg.start + i * d, end: seg.start + (i + 1) * d };
        });
    for (let i = 0; i < words.length; i += MAX_WORDS) {
      const slice = words.slice(i, i + MAX_WORDS);
      groups.push({ start: slice[0].start, end: slice[slice.length - 1].end, words: slice });
    }
  }
  return groups;
}

/**
 * Sous-titres « façon TikTok » (05 § 5) : groupe courant centré vers 65 % de la hauteur,
 * mot en cours en jaune, synchronisé par requestAnimationFrame sur video.currentTime.
 */
export function CaptionsOverlay({ videoRef, src, onLoaded }: { videoRef: RefObject<HTMLVideoElement | null>; src: string; onLoaded?: (ok: boolean) => void }) {
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [current, setCurrent] = useState<{ group: Group; wordIdx: number } | null>(null);
  const raf = useRef<number>(0);

  useEffect(() => {
    let alive = true;
    fetch(src)
      .then((r) => (r.ok ? r.json() : null))
      .then((f: CaptionFile | null) => {
        if (!alive) return;
        const g = f ? buildGroups(f) : [];
        setGroups(g);
        onLoaded?.(g.length > 0);
      })
      .catch(() => {
        if (!alive) return;
        setGroups([]);
        onLoaded?.(false);
      });
    return () => {
      alive = false;
    };
  }, [src, onLoaded]);

  useEffect(() => {
    if (!groups?.length) return;
    const loop = () => {
      const v = videoRef.current;
      if (v) {
        const tms = v.currentTime;
        const g = groups.find((x) => tms >= x.start - 0.05 && tms <= x.end + 0.15) ?? null;
        if (!g) setCurrent(null);
        else {
          let idx = g.words.findIndex((w) => tms >= w.start && tms < w.end);
          if (idx < 0) idx = tms >= g.words[g.words.length - 1].end ? g.words.length - 1 : 0;
          setCurrent((c) => (c && c.group === g && c.wordIdx === idx ? c : { group: g, wordIdx: idx }));
        }
      }
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
  }, [groups, videoRef]);

  if (!groups?.length) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 flex justify-center px-3 text-center" style={{ top: "65%" }} aria-hidden>
      {current && (
        <p className="font-display font-extrabold leading-tight text-white [text-shadow:_-2px_-2px_0_#000,_2px_-2px_0_#000,_-2px_2px_0_#000,_2px_2px_0_#000]" style={{ fontSize: "7cqw" }}>
          {current.group.words.map((w, i) => (
            <span key={i} className={`inline-block ${i < current.group.words.length - 1 ? "mr-[0.3em]" : ""} ${i === current.wordIdx ? "scale-110 text-yellow" : ""}`}>
              {w.w}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
