import { getCurrentUser } from "@/lib/auth";
import { importNotionExport } from "@/lib/notion-import";

export const maxDuration = 300;

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return Response.json({ error: "Only admins can import." }, { status: 403 });
  }
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".zip")) {
    return Response.json({ error: "Upload the .zip file Notion gave you." }, { status: 400 });
  }
  try {
    const summary = await importNotionExport(await file.arrayBuffer(), {
      userId: user.id,
      databasesAsTasks: form.get("databasesAsTasks") === "on",
    });
    return Response.json(summary);
  } catch (e) {
    console.error("Notion import failed", e);
    return Response.json(
      { error: "Couldn't read that file. Make sure it's a Notion 'Markdown & CSV' export." },
      { status: 400 },
    );
  }
}
