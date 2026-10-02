/** Point d'entrée Next.js exécuté une fois au démarrage du serveur Node. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.SKIP_STARTUP === "true") return;
  const { startup } = await import("./lib/startup");
  await startup();
}
