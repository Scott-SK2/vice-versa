/**
 * pnpm db:create --url "<External Database URL de l'instance>" [--name viceversa]
 *
 * Crée une base dédiée dans une instance PostgreSQL existante (Render ou autre) sans psql :
 * se connecte à l'instance avec l'URL donnée, crée la base si elle n'existe pas, puis affiche
 * les URL à utiliser pour DATABASE_URL (externe, et interne Render déduite si l'hôte est un dpg-…).
 */
import { Client } from "pg";
import { arg } from "./_env";

const adminUrl = arg("url") ?? arg("admin-url") ?? process.env.ADMIN_DATABASE_URL;
const name = arg("name") ?? "viceversa";

async function main() {
  console.log(`db:create — base cible « ${name} »`);
  if (!adminUrl) throw new Error('Usage : pnpm db:create --url "postgresql://user:mdp@hote/base_existante"');
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error("Nom de base invalide (minuscules, chiffres, _)");
  const url = new URL(adminUrl);
  const external = !["localhost", "127.0.0.1"].includes(url.hostname);
  console.log(`Connexion à ${url.hostname}…`);
  const client = new Client({
    connectionString: adminUrl,
    ssl: external ? { rejectUnauthorized: false } : undefined,
    connectionTimeoutMillis: 15_000,
  });
  await client.connect();
  const version = (await client.query("show server_version")).rows[0].server_version as string;
  const major = Number(version.split(".")[0]);
  console.log(`Connecté à ${url.hostname} (PostgreSQL ${version})`);
  if (major < 14) throw new Error(`PostgreSQL ${version} trop ancien : 14 ou plus requis`);
  const exists = await client.query("select 1 from pg_database where datname = $1", [name]);
  if (exists.rowCount) console.log(`· La base « ${name} » existe déjà, rien à créer.`);
  else {
    await client.query(`create database "${name}"`);
    console.log(`✔ Base « ${name} » créée.`);
  }
  await client.end();

  const withDb = new URL(adminUrl);
  withDb.pathname = `/${name}`;
  console.log("\nDATABASE_URL à donner à l'application :");
  const host = withDb.hostname;
  const renderInternal = /^dpg-[a-z0-9]+-a\./.exec(host);
  if (renderInternal) {
    const internal = new URL(withDb.toString());
    internal.hostname = renderInternal[0].replace(/\.$/, "");
    internal.search = "";
    console.log(`  Service web Render dans la même région (URL interne) : ${internal.toString()}`);
  }
  console.log(`  Depuis l'extérieur (Vercel, poste, autre région)       : ${withDb.toString()}${withDb.search ? "" : "?sslmode=require"}`);
}

main().catch((e: unknown) => {
  // Pas de process.exit() ici : sous Windows (Git Bash), il coupe la sortie avant qu'elle soit écrite.
  const err = e as { message?: string; code?: string; detail?: string };
  console.error(`✘ ${err?.message ?? String(e)}`);
  if (err?.code) console.error(`  code : ${err.code}`);
  if (err?.detail) console.error(`  détail : ${err.detail}`);
  process.exitCode = 1;
});
