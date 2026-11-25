# Workspace

In-house task tracker and docs wiki, built to replace Notion. It includes:

- **Projects & tasks**: kanban board and list views, assignees, due dates, priorities, comments, and per-project numbering (`OPS-12`).
- **Docs**: nested pages with a rich-text editor (headings, checklists, tables, links), autosave and search.
- **Leads (CRM)**: a pipeline board from New to Won/Lost, with contact details, product interest, source, owner, next follow-up date, an activity log, and follow-up tasks. Your follow-ups due this week show on My work.
- **People & roles**: admins add teammates, set roles and switch off access. There is no public sign-up.
- **Notion import**: upload a Notion "Markdown & CSV" export. Pages keep their structure, and databases with a Status column become projects. Add your teammates under People first, so task owners can be matched by name.
- **Claude connector**: an MCP server at `/api/mcp`, so Claude can search, create and update tasks, comments and docs as you.

Stack: Next.js 16, React 19, PostgreSQL 17, Drizzle ORM, Tiptap editor, Tailwind CSS 4.

## Run it locally

Requirements: Node.js 24+ and Docker.

```powershell
docker compose up -d          # starts Postgres on port 5433
copy .env.example .env
npm install
npm run dev                   # http://localhost:3000
```

On first visit you'll be asked to create the admin account. Database migrations run automatically when the server starts.

Database changes: edit `src/db/schema.ts`, then run `npm run db:generate` and commit the new file in `drizzle/`.

## Deploy to a server

Any Linux VPS with Docker works, for example a $5–10/month Hetzner or DigitalOcean box.

1. Point a domain such as `work.yourcompany.com` at the server's IP.
2. Copy this folder to the server and create a `.env` next to `docker-compose.prod.yml`:
   ```
   DOMAIN=work.yourcompany.com
   POSTGRES_PASSWORD=<long random string>
   ```
3. Run `docker compose -f docker-compose.prod.yml up -d --build`.

Caddy gets an HTTPS certificate automatically. For an office-only machine with no domain, set `DOMAIN=:80` and `COOKIE_SECURE=false`.

**Backups.** Schedule a nightly dump and copy it off the server:
```
docker compose -f docker-compose.prod.yml exec -T db pg_dump -U tracker tracker | gzip > backup-$(date +%F).sql.gz
```

## Connect Claude

Each person creates a personal token under **Account → Connect Claude**. The token acts as that person, and revoking it cuts off access immediately.

- **Claude Code:** run the command shown after creating the token:
  ```
  claude mcp add --transport http workspace https://work.yourcompany.com/api/mcp --header "Authorization: Bearer tt_..."
  ```
- **Claude Desktop:** add this to `claude_desktop_config.json` (uses the `mcp-remote` bridge):
  ```json
  {
    "mcpServers": {
      "workspace": {
        "command": "npx",
        "args": ["-y", "mcp-remote", "https://work.yourcompany.com/api/mcp", "--header", "Authorization: Bearer tt_..."]
      }
    }
  }
  ```

Tools: `whoami`, `list_projects`, `list_people`, `search_tasks`, `get_task`, `create_task`, `update_task`, `add_comment`, `list_docs`, `search_docs`, `get_doc`, `create_doc`, `update_doc`, `search_leads`, `get_lead`, `create_lead`, `update_lead`, `log_lead_activity`.

Adding it as a custom connector in claude.ai (web and mobile) needs the app on a public HTTPS address plus OAuth sign-in, which isn't built yet.

## Roadmap ideas

- Lead import from CSV, deal values and pipeline reports
- OAuth for the claude.ai connector, and single sign-on (Google or Microsoft)
- Email or Slack notifications for assignments and due dates
- File attachments and images in docs
