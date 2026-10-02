# syntax=docker/dockerfile:1.7
# Image de production VICE VERSA : Next.js en sortie « standalone », utilisateur non root.

FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && apk add --no-cache libc6-compat

# --- Dépendances --------------------------------------------------------------
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# --- Build --------------------------------------------------------------------
FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Variables nécessaires au build seulement (aucun secret) ; les vraies valeurs viennent de l'environnement d'exécution.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build SESSION_SECRET=build-only
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION
RUN pnpm build

# --- Exécution ----------------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
# Contenu et migrations lus à l'exécution (rechargement du contenu, migrations au démarrage).
COPY --from=build --chown=app:app /app/content ./content
COPY --from=build --chown=app:app /app/drizzle ./drizzle
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
