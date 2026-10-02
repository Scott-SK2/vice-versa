import type { CaptionFile } from "./schema";

function ts(seconds: number): string {
  const ms = Math.round(seconds * 1000);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const r = ms % 1000;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(r).padStart(3, "0")}`;
}

/** WebVTT à partir des segments : repli natif (<track>) et lecteurs d'écran. */
export function toVtt(file: CaptionFile): string {
  const cues = file.segments.map((s) => `${s.id}\n${ts(s.start)} --> ${ts(Math.max(s.end, s.start + 0.2))}\n${s.text.replace(/\r?\n/g, " ").trim()}`);
  return `WEBVTT\nKind: captions\nLanguage: ${file.lang}\n\n${cues.join("\n\n")}\n`;
}
