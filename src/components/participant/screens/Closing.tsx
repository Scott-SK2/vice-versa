"use client";

import { useState } from "react";
import { useParticipant } from "@/lib/participant/client/store";
import { useApiData } from "../hooks";
import { Button, LinkButton, Loading, Notice, Screen, Title } from "../ui";
import { Guard } from "./Guard";

type Rendered = { choice?: string | null; choices?: (string | null)[]; words?: string[]; text?: string } | null;
type Summary = {
  progress: { completed: number; required: number; percent: number };
  pairs: { key: string; type: string; text: string; before: Rendered; after: Rendered }[];
  extra: { key: string; text: string; answer: Rendered }[];
};

function show(r: Rendered, fallback: string): string {
  if (!r) return fallback;
  if (r.choice) return r.choice;
  if (r.choices) return r.choices.filter(Boolean).join(", ");
  if (r.words) return r.words.join(" · ");
  if (r.text) return r.text;
  return fallback;
}

export function BilanScreen() {
  return (
    <Guard>
      <BilanInner />
    </Guard>
  );
}

function BilanInner() {
  const { t, run } = useParticipant();
  const { data, loading, error } = useApiData<Summary>("/api/me/summary");
  if (loading) return <Loading label={t("common.loading")} />;
  if (error?.code === "PHASE_LOCKED" || !data) {
    return (
      <Screen>
        <Title>{t("bilan.title")}</Title>
        <Notice kind="info">{t("common.phaseLocked")}</Notice>
        <LinkButton href="/vv26/parcours" variant="secondary">{t("station.backToList")}</LinkButton>
      </Screen>
    );
  }
  return (
    <Screen>
      <Title sub={t("bilan.explored", { completed: data.progress.completed, required: data.progress.required })}>{t("bilan.title")}</Title>
      <ul className="flex flex-col gap-3">
        {data.pairs.map((p) => (
          <li key={p.key} className="rounded-card border border-state-locked bg-white p-4">
            <p className="mb-3 font-semibold leading-snug">{p.text}</p>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-button bg-state-locked/40 p-3">
                <p className="text-xs font-bold uppercase tracking-wide text-muted">{t("bilan.before")}</p>
                <p className="mt-1 font-semibold">{show(p.before, t("bilan.noAnswer"))}</p>
              </div>
              <div className="rounded-button bg-green-deep p-3 text-paper">
                <p className="text-xs font-bold uppercase tracking-wide opacity-80">{t("bilan.after")}</p>
                <p className="mt-1 font-semibold">{show(p.after, t("bilan.noAnswer"))}</p>
              </div>
            </div>
          </li>
        ))}
        {data.extra.map((e) => (
          <li key={e.key} className="rounded-card border border-state-locked bg-white p-4">
            <p className="mb-1 font-semibold leading-snug">{e.text}</p>
            <p className="text-sm">{show(e.answer, t("bilan.noAnswer"))}</p>
          </li>
        ))}
      </ul>
      <Notice kind="info">{t("bilan.join")}</Notice>
      {(run?.phase === "trace" || run?.phase === "discussion") && <LinkButton href="/vv26/trace">{t("trace.title")}</LinkButton>}
    </Screen>
  );
}

export function MerciScreen() {
  const { t, me, status } = useParticipant();
  if (status === "loading") return <Loading label={t("common.loading")} />;
  const p = me?.progress;
  return (
    <Screen className="justify-center text-center">
      <p className="font-display text-sm font-extrabold uppercase tracking-[0.2em] text-green-deep">{t("app.title")}</p>
      <h1 className="text-5xl">{t("merci.title")}</h1>
      <p className="text-lg leading-snug">{p ? t("merci.text", { completed: p.completed, required: p.required }) : t("home.closed.text")}</p>
      {status === "closed" && <p className="text-sm text-muted">{t("merci.closed")}</p>}
    </Screen>
  );
}

export function ResetScreen() {
  const { t, reset } = useParticipant();
  const [done, setDone] = useState(false);
  return (
    <Screen className="justify-center">
      <Title>{t("reset.title")}</Title>
      <p className="text-muted">{t("reset.text")}</p>
      {done ? (
        <>
          <Notice kind="success">{t("reset.done")}</Notice>
          <LinkButton href="/vv26">{t("home.start")}</LinkButton>
        </>
      ) : (
        <Button
          onClick={() => {
            reset();
            setDone(true);
          }}
        >
          {t("reset.confirm")}
        </Button>
      )}
    </Screen>
  );
}
