import "server-only";
import { eq, inArray } from "drizzle-orm";
import { db, projects, sprints, tasks, users } from "@/db";
import { notifyUsers } from "@/lib/push";
import { htmlToText } from "@/lib/text";

/** "Someone gave you a task" (or put yours in a sprint). The person who did it isn't notified. */
export async function notifyAssigned(taskIds: string[], actorId: string, reason: "assigned" | "sprint") {
  if (!taskIds.length) return;
  try {
    const rows = await db
      .select({
        id: tasks.id,
        number: tasks.number,
        title: tasks.title,
        assigneeId: tasks.assigneeId,
        key: projects.key,
        sprint: sprints.name,
      })
      .from(tasks)
      .innerJoin(projects, eq(projects.id, tasks.projectId))
      .leftJoin(sprints, eq(sprints.id, tasks.sprintId))
      .where(inArray(tasks.id, taskIds));
    const [actor] = await db.select({ name: users.name }).from(users).where(eq(users.id, actorId));
    const who = actor?.name ?? "Someone";
    const byPerson = new Map<string, typeof rows>();
    for (const r of rows) if (r.assigneeId && r.assigneeId !== actorId) byPerson.set(r.assigneeId, [...(byPerson.get(r.assigneeId) ?? []), r]);
    for (const [userId, list] of byPerson) {
      const one = list[0];
      const ref = `${one.key}-${one.number}`;
      const payload =
        list.length === 1
          ? reason === "assigned"
            ? { title: `${who} assigned you ${ref}`, body: one.title, url: `/tasks/${one.id}`, tag: `task-${one.id}` }
            : { title: `${ref} added to ${one.sprint ?? "a sprint"}`, body: one.title, url: `/tasks/${one.id}`, tag: `task-${one.id}` }
          : reason === "assigned"
            ? { title: `${who} assigned you ${list.length} tasks`, body: list.map((t) => `${t.key}-${t.number}`).join(", "), url: "/" }
            : { title: `${list.length} of your tasks added to ${one.sprint ?? "a sprint"}`, body: list.slice(0, 6).map((t) => `${t.key}-${t.number}`).join(", "), url: "/todos/upcoming" };
      await notifyUsers([userId], "assigned", payload);
    }
  } catch (e) {
    console.error("notifyAssigned failed", e);
  }
}

/** A new comment: tells the task's owner and creator, not the person who wrote it. */
export async function notifyComment(taskId: string, authorId: string, body: string) {
  try {
    const [t] = await db
      .select({ number: tasks.number, title: tasks.title, assigneeId: tasks.assigneeId, creatorId: tasks.creatorId, key: projects.key })
      .from(tasks)
      .innerJoin(projects, eq(projects.id, tasks.projectId))
      .where(eq(tasks.id, taskId));
    if (!t) return;
    const [author] = await db.select({ name: users.name }).from(users).where(eq(users.id, authorId));
    const to = [t.assigneeId, t.creatorId].filter((u): u is string => !!u && u !== authorId);
    const text = htmlToText(body).replace(/\s+/g, " ").trim();
    await notifyUsers(to, "comments", {
      title: `${author?.name ?? "Someone"} commented on ${t.key}-${t.number}`,
      body: text.length > 140 ? `${text.slice(0, 137)}…` : text,
      url: `/tasks/${taskId}`,
      tag: `comment-${taskId}`,
    });
  } catch (e) {
    console.error("notifyComment failed", e);
  }
}
