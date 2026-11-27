// OAuth discovery and token endpoints are called by other apps (sometimes from a
// browser), and carry no cookies, so they allow any origin.
export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, mcp-protocol-version",
  "Access-Control-Max-Age": "86400",
};

export const preflight = () => new Response(null, { status: 204, headers: CORS });

export const jsonCors = (body: unknown, init: ResponseInit = {}) =>
  Response.json(body, {
    ...init,
    headers: { "Cache-Control": "no-store", ...CORS, ...(init.headers as Record<string, string> | undefined) },
  });
