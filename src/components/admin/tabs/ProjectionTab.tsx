"use client";

import { useCallback, useEffect, useState } from "react";
import { type ProjectionPayload, SlideView } from "@/components/projection/Slides";
import { adminApi, AdminApiError } from "@/lib/admin/client";
import { useAdminUser } from "../AdminUserContext";
import { can, type RunDto, type Slide } from "../types";
import { Alert, Button, Card, Spinner } from "../ui";

type Info = { current_slide: Slide; slides: { slide: Slide; title: string }[]; projection_url: string };
const same = (a: Slide | null, b: Slide | null) => JSON.stringify(a) === JSON.stringify(b);

export function ProjectionTab({ run, onChange }: { run: RunDto; onChange: (r: RunDto) => void }) {
  const user = useAdminUser();
  const [info, setInfo] = useState<Info | null>(null);
  const [selected, setSelected] = useState<Slide | null>(null);
  const [preview, setPreview] = useState<ProjectionPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    adminApi<Info>(`/api/admin/runs/${run.id}/projection`)
      .then((i) => {
        setInfo(i);
        setSelected((s) => s ?? i.current_slide);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Erreur"));
  }, [run.id, run.projection_key]);

  const loadPreview = useCallback(async () => {
    if (!selected) return;
    const q = new URLSearchParams({ kind: selected.kind });
    if ("questionKey" in selected) q.set("question", selected.questionKey);
    try {
      setPreview(await adminApi<ProjectionPayload>(`/api/admin/runs/${run.id}/projection/preview?${q}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }, [run.id, selected]);

  useEffect(() => {
    const first = setTimeout(loadPreview, 0);
    const id = setInterval(loadPreview, 10_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [loadPreview]);

  async function project() {
    if (!selected) return;
    try {
      await adminApi(`/api/admin/runs/${run.id}/projection`, { method: "PUT", body: selected });
      setInfo((i) => (i ? { ...i, current_slide: selected } : i));
      onChange({ ...run, current_slide: selected });
    } catch (e) {
      setError(e instanceof AdminApiError ? e.message : "Erreur");
    }
  }

  async function regenerate() {
    if (!confirm("Régénérer la clé ? L’ancienne URL de projection cessera de fonctionner.")) return;
    const r = await adminApi<{ projection_key: string }>(`/api/admin/runs/${run.id}/projection-key`, { method: "POST" });
    onChange({ ...run, projection_key: r.projection_key });
  }

  if (error && !info) return <Alert kind="error">{error}</Alert>;
  if (!info) return <Spinner />;
  const isCurrent = same(selected, info.current_slide);

  return (
    <div className="flex flex-col gap-4">
      {error && <Alert kind="error">{error}</Alert>}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <div className="min-w-0">
            <p className="font-semibold">Écran de la salle</p>
            <a href={info.projection_url} target="_blank" rel="noreferrer" className="block truncate text-green-deep underline-offset-2 hover:underline">
              {info.projection_url}
            </a>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(info.projection_url);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? "Copié" : "Copier le lien"}
            </Button>
            {can(user, "admin") && <Button size="sm" onClick={regenerate}>Régénérer la clé</Button>}
          </div>
        </div>
      </Card>
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card title="Diapositives">
          <ul className="flex flex-col gap-1">
            {info.slides.map((s) => {
              const sel = same(s.slide, selected);
              const cur = same(s.slide, info.current_slide);
              return (
                <li key={JSON.stringify(s.slide)}>
                  <button
                    onClick={() => setSelected(s.slide)}
                    className={`flex w-full items-center justify-between rounded-button px-3 py-2 text-left text-sm ${sel ? "bg-green-deep text-paper" : "hover:bg-paper"}`}
                  >
                    <span className="truncate">{s.title}</span>
                    {cur && <span className={`ml-2 shrink-0 rounded-full px-2 text-xs font-bold ${sel ? "bg-yellow text-ink" : "bg-yellow text-ink"}`}>à l’écran</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
        <Card
          title="Aperçu"
          actions={
            can(user, "animateur") ? (
              <Button variant="primary" onClick={project} disabled={!selected || isCurrent}>
                {isCurrent ? "Projetée" : "Projeter"}
              </Button>
            ) : null
          }
        >
          <div className="aspect-video w-full overflow-hidden rounded-card border border-state-locked">
            {preview ? <SlideView payload={preview} scale="preview" /> : <Spinner />}
          </div>
        </Card>
      </div>
    </div>
  );
}
