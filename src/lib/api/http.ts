import { NextResponse } from "next/server";
import { z } from "zod";
import { AnswerValidationError } from "@/lib/domain/answer-value";
import { ApiError, errors } from "./errors";

type RouteContext<P> = { params: Promise<P> };
type Handler<P> = (req: Request, ctx: RouteContext<P>) => Promise<Response>;

const NO_STORE = { "Cache-Control": "no-store" } as const;

export function json<T>(body: T, init: { status?: number; headers?: Record<string, string> } = {}): NextResponse {
  return NextResponse.json(body, { status: init.status ?? 200, headers: { ...NO_STORE, ...init.headers } });
}

/** Enveloppe un Route Handler : erreurs typées → JSON, le reste → 500 journalisé. */
export function withApi<P = Record<string, never>>(handler: Handler<P>): Handler<P> {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export function errorResponse(e: unknown): NextResponse {
  if (e instanceof ApiError) {
    return NextResponse.json(e.toJSON(), { status: e.status, headers: { ...NO_STORE, ...e.headers } });
  }
  if (e instanceof z.ZodError) {
    return errorResponse(errors.validation(e.issues.map((i) => `${i.path.join(".") || "(racine)"}: ${i.message}`)));
  }
  if (e instanceof AnswerValidationError) {
    return errorResponse(errors.validation([e.message, ...e.issues]));
  }
  console.error(JSON.stringify({ level: "error", msg: "unhandled", err: e instanceof Error ? e.stack : String(e) }));
  return NextResponse.json(
    { error: { code: "INTERNAL", message: "Erreur interne." } },
    { status: 500, headers: NO_STORE },
  );
}

export async function parseBody<T>(req: Request, schema: z.ZodType<T>): Promise<T> {
  let raw: unknown = {};
  const text = await req.text();
  if (text.trim()) {
    try {
      raw = JSON.parse(text);
    } catch {
      throw errors.validation(["Corps JSON invalide."]);
    }
  }
  return schema.parse(raw);
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "unknown").trim();
}

export function bearerToken(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim() || null;
  const cookie = req.headers.get("cookie");
  if (cookie) {
    const m = /(?:^|;\s*)vv_session=([^;]+)/.exec(cookie);
    if (m) return decodeURIComponent(m[1]);
  }
  return null;
}
