import { protectedResourceMetadata } from "@/lib/oauth";
import { jsonCors, preflight } from "@/lib/cors";

// Tells Claude which server signs people in for the /api/mcp connector (RFC 9728).
export const GET = (request: Request) => jsonCors(protectedResourceMetadata(request.headers));
export const OPTIONS = preflight;
