/* ============================================================
   Crafty Central — API route plumbing

   Every route body is wrapped in handle(), so an Unauthorized or
   Forbidden thrown deep inside the repo comes back as a 401 or
   403 instead of a 500, and nothing has to remember to try/catch.
   ============================================================ */

import { NextResponse } from "next/server";
import { Forbidden, Unauthorized } from "./auth";

export const json = <T>(data: T, status = 200) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });

export const fail = (error: string, status = 400) => json({ error }, status);

export async function handle<T>(fn: () => Promise<T>): Promise<NextResponse> {
  try {
    const data = await fn();
    return json(data ?? { ok: true });
  } catch (err) {
    if (err instanceof Unauthorized) return fail("Not signed in", 401);
    if (err instanceof Forbidden) return fail(err.message, 403);
    if (err instanceof ApiError) return fail(err.message, err.status);
    console.error("API error:", err);
    const isDev = process.env.NODE_ENV !== "production";
    return fail(
      isDev && err instanceof Error ? err.message : "Something went wrong on our end.",
      500,
    );
  }
}

/** Throw this for an expected, user-facing failure. */
export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export const bad = (message: string, status = 400): never => {
  throw new ApiError(message, status);
};

/** Parse a JSON body, tolerating an empty one. */
export async function body<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}

export const str = (v: unknown, fallback = ""): string =>
  typeof v === "string" ? v.trim() : fallback;

export const int = (v: unknown, fallback = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
};

export const strArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x) => typeof x === "string").map((x) => (x as string).trim()).filter(Boolean) : [];
