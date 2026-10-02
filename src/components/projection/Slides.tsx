/**
 * Rendu des diapositives, partagé par l'écran de projection et l'aperçu de la console.
 * `scale` : "screen" (plein écran 16:9) ou "preview" (aperçu dans la console).
 */
type ChoiceCount = { key: string; label: string; count: number; percent: number };
type Agg =
  | { type: "single_choice" | "tri_state" | "multi_choice"; total: number; choices: ChoiceCount[] }
  | { type: "guess_reveal"; total: number; correct: number; correct_percent: number; choices: ChoiceCount[] }
  | { type: "three_words"; total: number; words: { word: string; count: number }[] }
  | { type: "short_text"; total: number; approved: number }
  | { type: "media_only"; total: 0 };

export type ProjectionPayload = {
  slide: { kind: string; questionKey?: string };
  title: string;
  data: unknown;
  run?: { label: string; kind: string; phase: string; status: string };
};

export function SlideView({ payload, scale = "screen" }: { payload: ProjectionPayload; scale?: "screen" | "preview" }) {
  const big = scale === "screen";
  const h1 = big ? "text-5xl leading-tight" : "text-xl";
  const body = big ? "text-2xl" : "text-sm";
  const d = payload.data as Record<string, unknown> | null;

  const frame = { big, h1, body, title: payload.title, run: payload.run };

  switch (payload.slide.kind) {
    case "blank":
      return (
        <div className={`flex h-full w-full items-center justify-center bg-green-deep text-paper ${big ? "p-16" : "p-5"}`}>
          <p className={`font-display font-extrabold ${big ? "text-7xl" : "text-2xl"}`}>VICE VERSA</p>
        </div>
      );
    case "overview": {
      const sessions = d?.sessions as { total: number; active: number; completed: number } | undefined;
      const stations = (d?.stations as { code: string; title: string; counts_in_progress: boolean; opened: number; completed: number }[]) ?? [];
      const max = Math.max(1, ...stations.map((s) => s.opened));
      return (
        <Frame {...frame}>
          <div className={`grid grid-cols-3 ${big ? "mb-10 gap-8" : "mb-4 gap-4"}`}>
            <Stat big={big} label="Participants" value={sessions?.total ?? 0} />
            <Stat big={big} label="Progression moyenne" value={`${(d?.avg_progress as number) ?? 0} %`} />
            <Stat big={big} label="Parcours complets" value={sessions?.completed ?? 0} />
          </div>
          <div className={`grid ${big ? "gap-4" : "gap-2"}`}>
            {stations.filter((s) => s.counts_in_progress).map((s) => (
              <HBar key={s.code} big={big} label={`${s.code} · ${s.title}`} value={s.completed} max={max} right={`${s.completed} / ${s.opened}`} />
            ))}
          </div>
        </Frame>
      );
    }
    case "before_after": {
      const before = d?.before as Agg | null;
      const after = d?.after as Agg;
      const paired = Boolean(d?.paired);
      const choices = (after as { choices?: ChoiceCount[] }).choices ?? [];
      const beforeMap = new Map(((before as { choices?: ChoiceCount[] } | null)?.choices ?? []).map((c) => [c.key, c]));
      return (
        <Frame {...frame}>
          {paired && (
            <div className={`${big ? "mb-6" : "mb-3"} flex gap-6 text-muted`}>
              <Legend color="bg-state-locked" label={`Avant (${before?.total ?? 0})`} />
              <Legend color="bg-green-deep" label={`Après (${after.total})`} />
            </div>
          )}
          <div className={`grid ${big ? "gap-6" : "gap-3"}`}>
            {choices.map((c) => (
              <div key={c.key}>
                <div className={`mb-1 flex justify-between ${big ? "text-3xl" : "text-sm"} font-semibold`}>
                  <span>{c.label}</span>
                  <span className="text-muted">
                    {paired && <span className="mr-4">{beforeMap.get(c.key)?.percent ?? 0} %</span>}
                    {c.percent} %
                  </span>
                </div>
                {paired && <Track big={big} pct={beforeMap.get(c.key)?.percent ?? 0} color="bg-state-locked" />}
                <Track big={big} pct={c.percent} color="bg-green-deep" />
              </div>
            ))}
            {after.type === "guess_reveal" && (
              <p className={`${big ? "text-3xl" : "text-sm"} font-semibold`}>
                Bonnes réponses : <span className="text-green-deep">{after.correct_percent} %</span> ({after.correct} / {after.total})
              </p>
            )}
          </div>
          {!paired && <p className={`mt-4 text-muted ${big ? "text-2xl" : "text-xs"}`}>{after.total} réponse(s)</p>}
        </Frame>
      );
    }
    case "tri_state_columns": {
      const agg = d?.aggregate as Agg;
      const comments = (d?.comments as string[]) ?? [];
      const choices = (agg as { choices?: ChoiceCount[] }).choices ?? [];
      const colors = ["bg-state-done", "bg-error", "bg-yellow"];
      return (
        <Frame {...frame}>
          <div className={`grid grid-cols-3 ${big ? "mb-10 gap-10" : "mb-4 gap-4"}`}>
            {choices.map((c, i) => (
              <div key={c.key} className="flex flex-col items-center gap-3">
                <div className={`w-full rounded-card ${colors[i % 3]} ${big ? "h-72" : "h-24"}`} style={{ opacity: 0.25 + (c.percent / 100) * 0.75 }} />
                <p className={`${big ? "text-5xl" : "text-xl"} font-display font-extrabold`}>{c.percent} %</p>
                <p className={`${big ? "text-2xl" : "text-sm"} text-center`}>{c.label}</p>
              </div>
            ))}
          </div>
          {comments.length > 0 && (
            <ul className={`grid ${big ? "grid-cols-2 gap-4 text-2xl" : "gap-2 text-sm"}`}>
              {comments.slice(0, big ? 6 : 4).map((c, i) => (
                <li key={i} className="rounded-card border border-state-locked bg-white px-4 py-3">« {c} »</li>
              ))}
            </ul>
          )}
        </Frame>
      );
    }
    case "words": {
      const before = d?.before as Agg | null;
      const after = d?.after as Agg;
      const list = (a: Agg | null) => ((a as { words?: { word: string; count: number }[] } | null)?.words ?? []).slice(0, 15);
      const cloud = (a: Agg | null, title: string) => {
        const words = list(a);
        const max = Math.max(1, ...words.map((w) => w.count));
        return (
          <div>
            <h2 className={`${big ? "text-3xl" : "text-base"} mb-4 text-muted`}>{title} <span className="text-sm">({a?.total ?? 0})</span></h2>
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
              {words.map((w) => (
                <span key={w.word} className="font-display font-extrabold text-green-deep" style={{ fontSize: `${(big ? 1.5 : 0.8) + (w.count / max) * (big ? 3 : 1)}rem` }}>
                  {w.word}
                </span>
              ))}
              {!words.length && <span className="text-muted">—</span>}
            </div>
          </div>
        );
      };
      return (
        <Frame {...frame}>
          <div className={`grid ${before ? "grid-cols-2" : "grid-cols-1"} ${big ? "gap-12" : "gap-4"}`}>
            {before && cloud(before, "Avant")}
            {cloud(after, before ? "Après" : "Mots")}
          </div>
        </Frame>
      );
    }
    case "approved_texts": {
      const texts = (d?.texts as string[]) ?? [];
      return (
        <Frame {...frame}>
          {texts.length === 0 && <p className="text-muted">Aucun message validé pour l’instant.</p>}
          <ul className={`grid ${big ? "grid-cols-2 gap-6 text-3xl" : "gap-2 text-sm"}`}>
            {texts.slice(0, big ? 8 : 6).map((t, i) => (
              <li key={i} className="rounded-card border border-state-locked bg-white px-5 py-4 leading-snug">« {t} »</li>
            ))}
          </ul>
        </Frame>
      );
    }
    default:
      return <Frame {...frame}>Diapositive inconnue</Frame>;
  }
}

function Frame({
  big,
  h1,
  body,
  title,
  run,
  children,
}: {
  big: boolean;
  h1: string;
  body: string;
  title: string;
  run?: ProjectionPayload["run"];
  children: React.ReactNode;
}) {
  return (
    <div className={`flex h-full w-full flex-col bg-paper text-ink ${big ? "p-16" : "p-5"}`}>
      {title && <h1 className={`${h1} ${big ? "mb-10" : "mb-4"} max-w-5xl`}>{title}</h1>}
      <div className={`flex-1 ${body}`}>{children}</div>
      {big && run && (
        <footer className="mt-8 flex items-center justify-between text-xl text-muted">
          <span className="font-display font-extrabold text-green-deep">VICE VERSA — Deux regards, deux continents</span>
          <span>{run.label}</span>
        </footer>
      )}
    </div>
  );
}

function Stat({ big, label, value }: { big: boolean; label: string; value: string | number }) {
  return (
    <div className="rounded-card border border-state-locked bg-white p-5">
      <p className={`${big ? "text-6xl" : "text-2xl"} font-display font-extrabold text-green-deep`}>{value}</p>
      <p className={`${big ? "text-2xl" : "text-xs"} text-muted`}>{label}</p>
    </div>
  );
}

function Track({ big, pct, color }: { big: boolean; pct: number; color: string }) {
  return (
    <div className={`${big ? "h-6" : "h-2.5"} mb-1 w-full overflow-hidden rounded-full bg-white`} aria-hidden>
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function HBar({ big, label, value, max, right }: { big: boolean; label: string; value: number; max: number; right: string }) {
  return (
    <div>
      <div className={`flex justify-between ${big ? "text-2xl" : "text-xs"}`}>
        <span>{label}</span>
        <span className="text-muted">{right}</span>
      </div>
      <Track big={big} pct={Math.round((value / max) * 100)} color="bg-green-deep" />
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`inline-block h-4 w-4 rounded ${color}`} /> {label}
    </span>
  );
}
