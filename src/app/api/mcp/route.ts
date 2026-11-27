import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { userFromBearer } from "@/lib/api-tokens";
import { buildMcpServer } from "@/lib/mcp-server";
import { issuer } from "@/lib/oauth";

// Claude connector endpoint (MCP over Streamable HTTP, stateless).
// Authenticate with OAuth (Claude signs each person in; see src/lib/oauth.ts), or
// Authorization: Bearer <personal token from Settings → Integrations>.

async function handle(request: Request) {
  const user = await userFromBearer(request.headers.get("authorization"));
  if (!user) {
    return Response.json(
      { error: "Sign in required. Add this address as a connector in Claude, or use a token from Settings → Integrations." },
      {
        status: 401,
        headers: {
          // tells Claude where to start the OAuth sign-in (RFC 9728)
          "WWW-Authenticate": `Bearer realm="workspace", resource_metadata="${issuer(request.headers)}/.well-known/oauth-protected-resource/api/mcp"`,
        },
      },
    );
  }
  const server = buildMcpServer(user);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  try {
    return await transport.handleRequest(request);
  } finally {
    // stateless: one server per request
    void server.close();
  }
}

export { handle as GET, handle as POST, handle as DELETE };
