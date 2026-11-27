import { getCurrentUser } from "@/lib/auth";
import { importTickTick, parseTickTick } from "@/lib/ticktick-import";
import { revalidatePath } from "next/cache";

export const maxDuration = 120;

/** Imports a TickTick backup (.csv) or TickTick JSON into the signed-in person's To-dos. */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || !/\.(csv|json)$/i.test(file.name)) {
    return Response.json({ error: "Upload the .csv backup TickTick gave you." }, { status: 400 });
  }
  if (file.size > 20 * 1024 * 1024) return Response.json({ error: "That file is over 20 MB." }, { status: 400 });
  let data;
  try {
    data = parseTickTick(await file.text(), file.name);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Couldn't read that file." }, { status: 400 });
  }
  if (!data.tasks.length) return Response.json({ error: "No tasks found in that file." }, { status: 400 });
  try {
    const summary = await importTickTick(user.id, data);
    revalidatePath("/todos", "layout");
    revalidatePath("/calendar");
    return Response.json(summary);
  } catch (e) {
    console.error("TickTick import failed", e);
    return Response.json({ error: "The import stopped part way. Try again; nothing gets duplicated." }, { status: 500 });
  }
}
