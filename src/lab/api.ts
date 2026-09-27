import type { APIContext, APIRoute } from 'astro';
import { z, ZodError } from 'astro/zod';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public headers: Record<string, string> = {},
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(data), { ...init, headers });
}

/**
 * Wrap an endpoint so every failure becomes a clean JSON response.
 * 4xx HttpErrors show their message; everything else is a generic 500 and
 * the real error goes to the Vercel function logs.
 */
export function handler(
  fn: (context: APIContext) => Response | Promise<Response>,
): APIRoute {
  return async (context) => {
    try {
      return await fn(context);
    } catch (err) {
      if (err instanceof HttpError) {
        if (err.status >= 500) {
          console.error(err);
          return json({ error: 'Internal error' }, { status: err.status, headers: err.headers });
        }
        return json({ error: err.message }, { status: err.status, headers: err.headers });
      }
      if (err instanceof ZodError) {
        return json(
          {
            error: 'Invalid request',
            issues: err.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
          },
          { status: 400 },
        );
      }
      console.error(err);
      return json({ error: 'Internal error' }, { status: 500 });
    }
  };
}

export async function readBody<S extends z.ZodTypeAny>(
  request: Request,
  schema: S,
): Promise<z.infer<S>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new HttpError(400, 'Malformed JSON body');
  }
  return schema.parse(body);
}

/** Server-side env lookup: runtime process.env first, then Vite/Astro env. */
export function readEnv(name: string): string | undefined {
  const viteEnv = import.meta.env as Record<string, string | undefined>;
  return process.env[name] || viteEnv[name] || undefined;
}

export function requireEnv(name: string): string {
  const value = readEnv(name);
  if (!value) {
    console.error(`[lab] Missing environment variable ${name}`);
    throw new HttpError(500, `Missing environment variable ${name}`);
  }
  return value;
}
