import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type Db = NodePgDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __vvPool?: Pool; __vvDb?: Db };

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL manquante (voir .env.example)");
  // Sur une plateforme sans état, chaque instance a son pool : on le garde petit pour ménager PostgreSQL.
  const max = Number(process.env.DB_POOL_MAX ?? (process.env.VERCEL ? 3 : 10));
  return new Pool({ connectionString, max, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 10_000 });
}

/** Pool et client partagés (le rechargement à chaud de Next.js ne doit pas en recréer). */
export function getDb(): Db {
  if (!globalForDb.__vvDb) {
    globalForDb.__vvPool = createPool();
    globalForDb.__vvDb = drizzle(globalForDb.__vvPool, { schema, casing: "snake_case" });
  }
  return globalForDb.__vvDb;
}

export async function closeDb(): Promise<void> {
  await globalForDb.__vvPool?.end();
  globalForDb.__vvPool = undefined;
  globalForDb.__vvDb = undefined;
}

export { schema };
