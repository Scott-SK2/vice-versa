"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { storage } from "@/lib/participant/client/storage";
import { useParticipant } from "@/lib/participant/client/store";
import { useApiData, useSubmitAnswer } from "../hooks";
import { type QuestionDto, QuestionForm } from "../QuestionForm";
import { LinkButton, Loading, Notice, Screen, Title } from "../ui";
import { Guard } from "./Guard";

type Payload = { phase: string; locked: boolean; questions: QuestionDto[] };

/** Écrans Avant, Après et Trace : questions d'une phase, une par une, barre d'étapes. */
export function PhaseQuestionsScreen({ phase }: { phase: "avant" | "apres" | "trace" }) {
  return (
    <Guard>
      <Inner phase={phase} />
    </Guard>
  );
}

function Inner({ phase }: { phase: "avant" | "apres" | "trace" }) {
  const { t, refreshMe } = useParticipant();
  const router = useRouter();
  const submit = useSubmitAnswer();
  const { data, loading, setData } = useApiData<Payload>(`/api/questions?phase=${phase}`);
  const [idxOverride, setIdx] = useState<number | null>(null);
  const [done, setDone] = useState(false);

  if (loading || !data) return <Loading label={t("common.loading")} />;
  const firstPending = data.questions.findIndex((q) => q.required && !q.answer);
  const idx = idxOverride ?? (firstPending >= 0 ? firstPending : 0);
  const total = data.questions.length;
  const q = data.questions[idx];
  const titles = { avant: t("avant.title"), apres: t("apres.title"), trace: t("trace.title") };
  const intros = { avant: t("avant.intro"), apres: t("apres.intro"), trace: t("trace.intro") };
  const nextRoute = { avant: "/vv26/parcours", apres: "/vv26/bilan", trace: "/vv26/merci" }[phase];

  async function finish() {
    const m = await refreshMe();
    const pending = phase === "avant" ? storage.getPendingScan() : null;
    if (pending && (!m || m.suggested_route === "/vv26/parcours")) {
      router.push(`/vv26/s/${pending.code}?k=${pending.k}`);
      return;
    }
    router.push(m?.suggested_route ?? nextRoute);
  }

  if (data.locked) {
    return (
      <Screen>
        <Title>{titles[phase]}</Title>
        <Notice kind="info">{t("common.phaseLocked")}</Notice>
        <LinkButton href={nextRoute} variant="secondary">{t("common.continue")}</LinkButton>
      </Screen>
    );
  }

  if (done) {
    return (
      <Screen className="justify-center">
        <Title>{titles[phase]}</Title>
        <Notice kind="success">{phase === "trace" ? t("trace.sent") : t("common.saved")}</Notice>
        <LinkButton href={nextRoute} variant="primary">{t("common.continue")}</LinkButton>
      </Screen>
    );
  }

  return (
    <Screen>
      <Title sub={idx === 0 ? intros[phase] : undefined}>{titles[phase]}</Title>
      {total > 1 && (
        <div aria-label={t("avant.step", { n: idx + 1, total })}>
          <p className="mb-1 text-sm font-semibold text-muted">{t("avant.step", { n: idx + 1, total })}</p>
          <div className="flex gap-1" aria-hidden>
            {data.questions.map((x, i) => (
              <span key={x.key} className={`h-1.5 flex-1 rounded-full ${i <= idx ? "bg-green-deep" : "bg-state-locked"}`} />
            ))}
          </div>
        </div>
      )}
      <QuestionForm
        key={q.key}
        question={q}
        t={t}
        submitLabel={phase === "trace" ? t("trace.send") : idx < total - 1 ? t("common.next") : t("common.send")}
        onSubmit={async (value) => {
          const r = await submit(q.key, value);
          if (!r.ok) return r;
          setData({ ...data, questions: data.questions.map((x) => (x.key === q.key ? { ...x, answer: value } : x)) });
          if (idx < total - 1) setIdx(idx + 1);
          else if (phase === "trace") setDone(true);
          else await finish();
          return r;
        }}
      />
      {idx > 0 && (
        <button className="text-sm font-bold text-green-deep" onClick={() => setIdx(idx - 1)}>
          ← {t("common.back")}
        </button>
      )}
    </Screen>
  );
}
