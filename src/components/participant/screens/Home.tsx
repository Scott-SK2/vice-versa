"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { type Lang, LANGS } from "@/lib/participant/client/i18n";
import { useParticipant } from "@/lib/participant/client/store";
import { Button, Loading, Notice, Screen, Title } from "../ui";

export function LangPicker({ value, onChange, label }: { value: Lang; onChange: (l: Lang) => void; label: string }) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold text-muted">{label}</legend>
      <div className="grid grid-cols-3 gap-2" role="radiogroup">
        {LANGS.map((l) => (
          <button
            key={l.code}
            type="button"
            role="radio"
            aria-checked={value === l.code}
            onClick={() => onChange(l.code)}
            className={`min-h-12 rounded-button border-2 text-sm font-bold ${value === l.code ? "border-green-deep bg-green-deep text-paper" : "border-state-locked bg-white text-ink"}`}
          >
            {l.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function Brand({ t }: { t: ReturnType<typeof useParticipant>["t"] }) {
  return (
    <div className="pt-6">
      <p className="font-display text-sm font-extrabold uppercase tracking-[0.2em] text-green-deep">{t("app.title")}</p>
      <h1 className="mt-1 text-4xl leading-[1.05]">{t("app.tagline")}</h1>
    </div>
  );
}

export function NoRunScreen() {
  const { t, lang, setLang } = useParticipant();
  return (
    <Screen className="justify-center">
      <Brand t={t} />
      <Notice kind="info">
        <strong className="block">{t("home.noRun.title")}</strong>
        {t("home.noRun.text")}
      </Notice>
      <LangPicker value={lang} onChange={setLang} label={t("home.lang")} />
    </Screen>
  );
}

export function HomeScreen() {
  const { status, me, lang, setLang, start, t } = useParticipant();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === "loading") return <Loading label={t("common.loading")} />;
  if (status === "none") return <NoRunScreen />;
  if (status === "closed") {
    return (
      <Screen className="justify-center">
        <Brand t={t} />
        <Notice kind="info">
          <strong className="block">{t("home.closed.title")}</strong>
          {t("home.closed.text")}
        </Notice>
      </Screen>
    );
  }

  async function go() {
    setBusy(true);
    setError(null);
    try {
      if (status === "ready" && me) router.push(me.suggested_route);
      else await start(lang);
    } catch {
      setError(t("common.error"));
      setBusy(false);
    }
  }

  return (
    <Screen className="justify-between">
      <div className="flex flex-col gap-6">
        <Brand t={t} />
        <p className="text-lg leading-snug">{t("home.instruction")}</p>
        <LangPicker value={lang} onChange={setLang} label={t("home.lang")} />
      </div>
      <div className="flex flex-col gap-3">
        {error && <Notice kind="error">{error}</Notice>}
        <Button onClick={go} disabled={busy}>
          {status === "ready" ? t("home.resume") : t("home.start")}
        </Button>
        <p className="text-center text-xs text-muted">
          {t("home.privacy")}{" "}
          <Link href="/vv26/confidentialite" className="underline">{t("home.privacyLink")}</Link>
        </p>
      </div>
    </Screen>
  );
}

export function PrivacyScreen() {
  const { t } = useParticipant();
  return (
    <Screen>
      <Title>{t("privacy.title")}</Title>
      <p className="leading-relaxed">{t("privacy.body")}</p>
      <Link href="/vv26" className="font-bold text-green-deep underline-offset-4 hover:underline">← {t("common.back")}</Link>
    </Screen>
  );
}
