"use client";

import type { RunDto } from "../types";
import { Button, Card } from "../ui";

export function ExportTab({ run }: { run: RunDto }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card title="Réponses (CSV)">
        <p className="mb-4 text-sm text-muted">
          Une ligne par réponse : empreinte de session (non réversible), station, question, type, valeur JSON, statut de modération, horodatage.
        </p>
        <a href={`/api/admin/runs/${run.id}/export.csv`}>
          <Button variant="primary">Télécharger le CSV</Button>
        </a>
      </Card>
      <Card title="Résumé agrégé (JSON)">
        <p className="mb-4 text-sm text-muted">
          {run.has_summary ? "Résumé figé à la clôture." : "Calculé à la demande tant que la séance est en cours."} Sessions, progression, fréquentation, agrégats par question, textes validés.
        </p>
        <a href={`/api/admin/runs/${run.id}/export.json`} target="_blank" rel="noreferrer">
          <Button>Ouvrir le JSON</Button>
        </a>
      </Card>
      <Card title="Sauvegarde de la base" className="md:col-span-2">
        <p className="text-sm text-muted">
          Avant de lancer la séance Live du 10 octobre, faire un dump sur le serveur : <code className="rounded bg-paper px-1">docker compose exec db pg_dump -U viceversa viceversa &gt; backup.sql</code>
        </p>
      </Card>
    </div>
  );
}
