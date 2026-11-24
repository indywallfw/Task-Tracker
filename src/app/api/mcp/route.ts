import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { userFromBearer } from "@/lib/api-tokens";
import { buildMcpServer } from "@/lib/mcp-server";

// Claude connector endpoint (MCP over Streamable HTTP, stateless).
// Authenticate with: Authorization: Bearer <personal token from the Account page>

async function handle(request: Request) {
  const user = await userFromBearer(request.headers.get("authorization"));
  if (!user) {
    return Response.json(
      { error: "Missing or invalid token. Create one on the Account page." },
      { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="workspace"' } },
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
