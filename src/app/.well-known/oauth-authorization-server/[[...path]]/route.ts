import { authServerMetadata } from "@/lib/oauth";
import { jsonCors, preflight } from "@/lib/cors";

// OAuth server discovery (RFC 8414). Served at the root and with a path suffix
// (e.g. /.well-known/oauth-authorization-server/api/mcp), which some clients try.
export const GET = (request: Request) => jsonCors(authServerMetadata(request.headers));
export const OPTIONS = preflight;
