"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ParticipantApiError } from "@/lib/participant/client/api";
import { useParticipant } from "@/lib/participant/client/store";
import { useApiData, useSubmitAnswer } from "../hooks";
import { type QuestionDto, QuestionForm } from "../QuestionForm";
import { Button, LinkButton, Loading, Notice, Pill, Screen, type StationState, Title } from "../ui";
import { type MediaDto, VideoPlayer } from "../VideoPlayer";
import { Guard } from "./Guard";

type StationPayload = {
  station: { code: string; title: string; intro: string | null; counts_in_progress: boolean; state: StationState; is_here: boolean; media_progress: number };
  media: MediaDto[];
  questions: QuestionDto[];
  progress: { completed: number; required: number; percent: number };
  run: { phase: string };
};

export function StationScreen({ code, qrToken }: { code: string; qrToken: string | null }) {
  return (
    <Guard>
      <StationInner code={code} qrToken={qrToken} />
    </Guard>
  );
}

function StationInner({ code, qrToken }: { code: string; qrToken: string | null }) {
  const { t, lang, me, run, refreshMe, setProgress } = useParticipant();
  const router = useRouter();
  const submit = useSubmitAnswer();
  const [scanState, setScanState] = useState<"pending" | "done" | "failed">(qrToken ? "pending" : "done");
  const [needsBefore, setNeedsBefore] = useState(false);
  const [readOnly, setReadOnly] = useState(false);
  const scanned = useRef(false);

  const doScan = useCallback(async () => {
    if (!qrToken) return;
    try {
      const r = await api<{ station: { code: string; read_only: boolean }; progress: StationPayload["progress"]; needs_before_questions: boolean }>("/api/scan", {
        method: "POST",
        body: { token: qrToken },
      });
      setProgress(r.progress);
      setNeedsBefore(r.needs_before_questions);
      setReadOnly(r.station.read_only);
      window.history.replaceState(null, "", `/vv26/s/${r.station.code}`);
      if (r.station.code !== code) router.replace(`/vv26/s/${r.station.code}`);
      setScanState("done");
    } catch (e) {
      if (e instanceof ParticipantApiError && !e.isNetwork && e.code !== "RATE_LIMITED") {
        setScanState("done"); // code inconnu ou phase fermée : la page station expliquera
      } else setScanState("failed");
    }
  }, [qrToken, code, router, setProgress]);

  useEffect(() => {
    if (scanned.current) return;
    scanned.current = true;
    const id = setTimeout(doScan, 0);
    return () => clearTimeout(id);
  }, [doScan]);

  const { data, error, loading, reload, setData } = useApiData<StationPayload>(scanState === "done" ? `/api/stations/${code}` : null);

  if (scanState === "pending") return <Loading label={t("station.unlocking")} />;
  if (scanState === "failed") {
    return (
      <Screen>
        <Title>{t("station.title", { code })}</Title>
        <Notice kind="error">{t("station.scanFailed")}</Notice>
        <Button onClick={() => { setScanState("pending"); doScan(); }}>{t("common.retry")}</Button>
      </Screen>
    );
  }
  if (loading) return <Loading label={t("common.loading")} />;
  if (error?.code === "STATION_LOCKED" || error?.status === 404) {
    return (
      <Screen>
        <Title>{t("station.title", { code })}</Title>
        <Notice kind="info">{t("station.locked", { code })}</Notice>
        <LinkButton href="/vv26/scanner" variant="secondary">{t("tabs.scanner")}</LinkButton>
        <LinkButton href="/vv26/parcours" variant="ghost">{t("station.backToList")}</LinkButton>
      </Screen>
    );
  }
  if (!data) {
    return (
      <Screen>
        <Notice kind="error">{t("common.error")}</Notice>
        <Button onClick={reload}>{t("common.retry")}</Button>
      </Screen>
    );
  }

  const s = data.station;
  const phase = run?.phase ?? data.run.phase;
  const isReadOnly = readOnly || phase === "discussion" || phase === "trace" || phase === "cloture";
  const requiredQs = data.questions.filter((q) => q.required);
  const mediaOnly = requiredQs.length === 0 && data.media.length > 0;
  const nothingToDo = requiredQs.length === 0 && data.media.length === 0;
  const langs = ["fr", "nl", "en"];

  async function onMediaProgress(ratio: number) {
    if (!mediaOnly || s.state === "completed") return;
    try {
      const r = await api<{ station: { code: string; state: StationState }; progress: StationPayload["progress"] }>(`/api/stations/${code}/media-progress`, {
        method: "POST",
        body: { media_ref: data!.media[0].ref, progress: ratio },
      });
      setProgress(r.progress);
      if (r.station.state === "completed") {
        setData({ ...data!, station: { ...s, state: "completed" } });
        await refreshMe();
        router.push(`/vv26/s/${code}/ok`);
      }
    } catch {
      /* hors ligne : la station se terminera au prochain passage */
    }
  }

  return (
    <Screen>
      <header className="flex items-center gap-3">
        <Pill state={s.state} code={s.code} here={s.is_here} size="lg" />
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-muted">{t("station.title", { code: s.code })}</p>
          <h1 className="text-2xl leading-tight">{s.title}</h1>
        </div>
      </header>
      {s.intro && <p className="text-muted">{s.intro}</p>}
      {isReadOnly && <Notice kind="info">{t("station.readOnly")}</Notice>}
      {needsBefore && me && !me.before_questions_done && (
        <Notice kind="warning">
          {t("station.beforeFirst")}{" "}
          <Link href="/vv26/avant" className="font-bold underline">{t("parcours.beforeGo")}</Link>
        </Notice>
      )}

      {data.media.length === 0 && !nothingToDo && <Notice kind="info">{t("station.noMedia")}</Notice>}
      {data.media.map((m) => (
        <VideoPlayer key={m.ref} media={m} lang={lang} langs={langs} t={t} onProgress={onMediaProgress} />
      ))}
      {mediaOnly && s.state !== "completed" && !isReadOnly && <p className="text-center text-sm text-muted">{t("station.watchToContinue")}</p>}

      {data.questions.map((q) => (
        <section key={q.key} className="rounded-card border border-state-locked bg-white p-4">
          <QuestionForm
            question={{ ...q, locked: q.locked || isReadOnly }}
            t={t}
            onSubmit={async (value) => {
              const r = await submit(q.key, value);
              if (!r.ok) return r;
              const updated = data.questions.map((x) => (x.key === q.key ? { ...x, answer: value } : x));
              setData({ ...data, questions: updated });
              const completed = r.response?.station?.state === "completed";
              if (completed || (r.queued && updated.filter((x) => x.required).every((x) => x.answer))) {
                await refreshMe();
                if (!r.reveal) router.push(`/vv26/s/${code}/ok`);
              }
              return r;
            }}
          />
          {q.type === "guess_reveal" && q.answer && (
            <LinkButton href={`/vv26/s/${code}/ok`} variant="secondary" className="mt-3">{t("common.continue")}</LinkButton>
          )}
        </section>
      ))}

      {(nothingToDo || s.state === "completed") && (
        <LinkButton href={phase === "apres" && s.code === "Z" ? "/vv26/apres" : "/vv26/parcours"} variant="secondary">
          {t("common.continue")}
        </LinkButton>
      )}
    </Screen>
  );
}

type Aggregate =
  | { masked: true; total: number; min: number }
  | { masked: false; type: string; total: number; choices?: { key: string; label: string; count: number; percent: number }[]; correct_percent?: number };

export function StationOkScreen({ code }: { code: string }) {
  return (
    <Guard>
      <StationOkInner code={code} />
    </Guard>
  );
}

function StationOkInner({ code }: { code: string }) {
  const { t, me } = useParticipant();
  const { data, loading } = useApiData<StationPayload>(`/api/stations/${code}`);
  const aggQ = data?.questions.find((q) => q.aggregate_available);
  const { data: agg } = useApiData<Aggregate>(aggQ ? `/api/questions/${aggQ.key}/aggregate` : null);
  if (loading || !data) return <Loading label={t("common.loading")} />;
  const progress = me?.progress ?? data.progress;
  return (
    <Screen>
      <div className="flex flex-col items-center gap-3 pt-6 text-center">
        <span className="flex h-20 w-20 items-center justify-center rounded-full bg-state-done text-4xl text-white" aria-hidden>✓</span>
        <h1 className="text-3xl">{t("station.done")}</h1>
        <p className="text-muted">{data.station.title}</p>
        <p className="font-display text-xl font-extrabold text-green-deep">
          {t("app.progress", { completed: progress.completed, required: progress.required })} · {progress.percent} %
        </p>
      </div>
      {aggQ && (
        <section className="rounded-card border border-state-locked bg-white p-4">
          <h2 className="mb-1 text-lg">{t("station.others")}</h2>
          <p className="mb-3 text-sm text-muted">{aggQ.text}</p>
          {!agg || agg.masked ? (
            <p className="text-sm text-muted">{t("station.othersSoon")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {(agg.choices ?? []).map((c) => (
                <li key={c.key} className="text-sm">
                  <div className="mb-1 flex justify-between font-semibold">
                    <span>{c.label}</span>
                    <span>{c.percent} %</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-state-locked/60" aria-hidden>
                    <div className="h-full rounded-full bg-green-deep" style={{ width: `${c.percent}%` }} />
                  </div>
                </li>
              ))}
              {agg.type === "guess_reveal" && <li className="text-sm font-semibold text-green-deep">{agg.correct_percent} % ✓</li>}
            </ul>
          )}
        </section>
      )}
      <LinkButton href="/vv26/carte">{t("station.seeMap")}</LinkButton>
      <LinkButton href="/vv26/parcours" variant="secondary">{t("station.backToList")}</LinkButton>
    </Screen>
  );
}
