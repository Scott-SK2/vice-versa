/**
 * pnpm admin:create --email x@y.be --name "Prénom Nom" --role admin [--password ...]
 * Crée un compte d'administration. Sans --password, un mot de passe temporaire est généré
 * et affiché une seule fois ; l'utilisateur devra le changer à la première connexion.
 */
import { hash } from "@node-rs/argon2";
import { randomBytes } from "node:crypto";
import { arg, requireEnv } from "./_env";
import { closeDb, getDb, schema } from "@/db/client";
import type { AdminRole } from "@/db/schema/enums";

async function main(): Promise<void> {
  requireEnv("DATABASE_URL");
  const email = arg("email")?.trim().toLowerCase();
  const displayName = arg("name")?.trim();
  const role = (arg("role") ?? "admin") as AdminRole;
  const roles: AdminRole[] = ["admin", "animateur", "moderateur"];
  if (!email || !displayName || !roles.includes(role)) {
    console.error('Usage : pnpm admin:create --email x@y.be --name "Prénom Nom" --role admin|animateur|moderateur [--password ...]');
    process.exit(1);
  }
  const provided = arg("password");
  const password = provided ?? randomBytes(9).toString("base64url");
  if (password.length < 12) {
    console.error("Le mot de passe doit faire au moins 12 caractères.");
    process.exit(1);
  }

  const db = getDb();
  const passwordHash = await hash(password, { memoryCost: 65536, timeCost: 3, parallelism: 1 });
  const [user] = await db
    .insert(schema.adminUsers)
    .values({ email, displayName, role, passwordHash, mustChangePassword: !provided })
    .onConflictDoNothing({ target: schema.adminUsers.email })
    .returning({ id: schema.adminUsers.id });
  if (!user) {
    console.error(`Un compte existe déjà pour ${email}.`);
    await closeDb();
    process.exit(1);
  }
  console.log(`✔ Compte ${role} créé pour ${email} (${user.id})`);
  if (!provided) console.log(`  Mot de passe temporaire (affiché une seule fois) : ${password}`);
  await closeDb();
}

main().catch(async (e) => {
  console.error(`✘ ${e instanceof Error ? e.message : String(e)}`);
  await closeDb().catch(() => undefined);
  process.exit(1);
});
