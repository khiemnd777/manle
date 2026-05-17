import { config } from '../config';

type HeaderValue = string | string[];

export function corsHeaders(request: Request) {
  const origin = request.headers.get('origin');
  const allowedOrigin = origin && config.allowedCorsOrigins.has(origin) ? origin : config.adminOrigin;
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    Vary: 'Origin',
  };
}

export function json(request: Request, data: unknown, status = 200, headers: Record<string, HeaderValue> = {}) {
  const responseHeaders = new Headers(corsHeaders(request));
  for (const [key, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      value.forEach((item) => responseHeaders.append(key, item));
    } else {
      responseHeaders.set(key, value);
    }
  }
  responseHeaders.set('Content-Type', 'application/json; charset=utf-8');

  return new Response(JSON.stringify(data), {
    status,
    headers: responseHeaders,
  });
}

export async function readJson<T>(request: Request): Promise<T> {
  const text = await request.text();
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}
