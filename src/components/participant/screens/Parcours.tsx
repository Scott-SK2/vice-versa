"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ParticipantApiError } from "@/lib/participant/client/api";
import { useParticipant } from "@/lib/participant/client/store";
import { useApiData } from "../hooks";
import { Button, LinkButton, Loading, Notice, Pill, Screen, type StationState, Title } from "../ui";
import { type MapStation, VenueMap } from "../VenueMap";
import { Guard } from "./Guard";

export type ProgressPayload = {
  run: { phase: string; kind: string };
  progress: { completed: number; required: number; percent: number };
  last_station: string | null;
  map: { svg_url: string; width: number; height: number } | null;
  stations: MapStation[];
};

export function ParcoursScreen() {
  return (
    <Guard>
      <ParcoursInner />
    </Guard>
  );
}

function ParcoursInner() {
  const { t, me, run } = useParticipant();
  const { data, loading } = useApiData<ProgressPayload>("/api/me/progress", 10_000);
  const [sheet, setSheet] = useState<string | null>(null);
  if (loading || !data) return <Loading label={t("common.loading")} />;
  const phase = run?.phase ?? data.run.phase;
  const afterOpen = phase === "apres";

  return (
    <Screen>
      <Title>{t("parcours.title")}</Title>
      <section className="rounded-card bg-green-deep p-5 text-paper">
        <p className="font-display text-5xl font-extrabold">{data.progress.percent} %</p>
        <p className="font-semibold">{t("app.progress", { completed: data.progress.completed, required: data.progress.required })}</p>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/20" aria-hidden>
          <div className="h-full rounded-full bg-yellow" style={{ width: `${data.progress.percent}%` }} />
        </div>
        <p className="mt-3 text-sm opacity-90">{data.last_station ? t("parcours.lastScan", { code: data.last_station }) : t("parcours.noScan")}</p>
      </section>
      {me && !me.before_questions_done && (
        <Notice kind="warning">
          {t("parcours.beforePending")}{" "}
          <Link href="/vv26/avant" className="font-bold underline">{t("parcours.beforeGo")}</Link>
        </Notice>
      )}
      {afterOpen && (
        <div className="rounded-card border-2 border-yellow bg-yellow/15 p-4">
          <p className="mb-3 text-sm font-semibold">{t("parcours.afterOpen")}</p>
          <LinkButton href="/vv26/apres">{t("parcours.goAfter")}</LinkButton>
        </div>
      )}
      <p className="text-sm text-muted">{t("parcours.hint")}</p>
      <ul className="flex flex-col gap-2">
        {data.stations
          .filter((s) => s.counts_in_progress)
          .map((s) => (
            <StationRow key={s.code} s={s} onLocked={() => setSheet(sheet === s.code ? null : s.code)} open={sheet === s.code} t={t} />
          ))}
      </ul>
    </Screen>
  );
}

function StationRow({ s, onLocked, open, t }: { s: MapStation; onLocked: () => void; open: boolean; t: ReturnType<typeof useParticipant>["t"] }) {
  const stateLabel = t(`state.${s.state}` as "state.locked");
  const inner = (
    <>
      <Pill state={s.state} code={s.code} here={s.is_here} size="lg" />
      <span className="flex-1 text-left">
        <span className="block font-display text-lg font-extrabold leading-tight">{s.title}</span>
        <span className="block text-sm text-muted">
          {stateLabel}
          {s.is_here && <span className="ml-2 font-bold text-here">· {t("state.here")}</span>}
        </span>
      </span>
      <span className="text-muted" aria-hidden>›</span>
    </>
  );
  const cls = "flex min-h-16 w-full items-center gap-3 rounded-card border border-state-locked bg-white px-3 py-2";
  if (s.state === "locked") {
    return (
      <li>
        <button className={cls} onClick={onLocked} aria-expanded={open}>{inner}</button>
        {open && <p className="mt-1 rounded-button bg-state-locked/50 px-4 py-3 text-sm">{t("parcours.lockedSheet")}</p>}
      </li>
    );
  }
  return (
    <li>
      <Link href={`/vv26/s/${s.code}`} className={cls}>{inner}</Link>
    </li>
  );
}

export function CarteScreen() {
  return (
    <Guard>
      <CarteInner />
    </Guard>
  );
}

function CarteInner() {
  const { t } = useParticipant();
  const { data, loading } = useApiData<ProgressPayload>("/api/me/progress", 10_000);
  const [selected, setSelected] = useState<string | null>(null);
  if (loading || !data) return <Loading label={t("common.loading")} />;
  const sel = data.stations.find((s) => s.code === selected);
  const legend: { state: StationState; label: string }[] = [
    { state: "locked", label: t("state.locked") },
    { state: "in_progress", label: t("state.in_progress") },
    { state: "completed", label: t("state.completed") },
  ];
  return (
    <Screen>
      <Title>{t("carte.title")}</Title>
      {data.map ? (
        <VenueMap svgUrl={data.map.svg_url} width={data.map.width} height={data.map.height} stations={data.stations} onSelect={setSelected} />
      ) : (
        <Notice kind="info">{t("station.noMedia")}</Notice>
      )}
      {!data.last_station && <p className="text-sm text-muted">{t("carte.noPin")}</p>}
      {sel && (
        <section className="rounded-card border border-state-locked bg-white p-4" aria-live="polite">
          <div className="flex items-center gap-3">
            <Pill state={sel.state} code={sel.code} here={sel.is_here} />
            <div className="flex-1">
              <p className="font-display text-lg font-extrabold leading-tight">{sel.title}</p>
              <p className="text-sm text-muted">{t(`state.${sel.state}` as "state.locked")}{sel.is_here ? ` · ${t("state.here")}` : ""}</p>
            </div>
          </div>
          <div className="mt-3">
            {sel.state === "locked" ? (
              <p className="text-sm">{t("parcours.lockedSheet")}</p>
            ) : (
              <LinkButton href={`/vv26/s/${sel.code}`} variant="secondary">{t("parcours.open")}</LinkButton>
            )}
          </div>
        </section>
      )}
      <ul className="flex flex-wrap gap-x-4 gap-y-2 text-sm" aria-label={t("carte.legend")}>
        {legend.map((l) => (
          <li key={l.state} className="flex items-center gap-2"><Pill state={l.state} code="" /> {l.label}</li>
        ))}
        <li className="flex items-center gap-2"><span className="inline-block h-4 w-4 rounded-full bg-here" aria-hidden /> {t("state.here")}</li>
      </ul>
    </Screen>
  );
}

export function ScannerScreen() {
  return (
    <Guard>
      <ScannerInner />
    </Guard>
  );
}

function ScannerInner() {
  const { t } = useParticipant();
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ station: { code: string } }>("/api/scan", { method: "POST", body: { short_code: code } });
      router.push(`/vv26/s/${r.station.code}`);
    } catch (err) {
      if (err instanceof ParticipantApiError && err.code === "UNKNOWN_CODE") setError(t("scanner.unknown"));
      else if (err instanceof ParticipantApiError && err.code === "PHASE_LOCKED") setError(t("common.phaseLocked"));
      else setError(t("common.error"));
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Title>{t("scanner.title")}</Title>
      <p className="text-muted">{t("scanner.instruction")}</p>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <input
          className="block min-h-16 w-full rounded-button border-2 border-state-locked bg-white px-4 text-center font-display text-3xl font-extrabold uppercase tracking-[0.3em]"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4))}
          placeholder={t("scanner.placeholder")}
          autoCapitalize="characters"
          autoComplete="off"
          inputMode="text"
          aria-label={t("scanner.title")}
          maxLength={4}
        />
        {error && <Notice kind="error">{error}</Notice>}
        <Button type="submit" disabled={code.length < 4 || busy}>{t("scanner.validate")}</Button>
      </form>
    </Screen>
  );
}
