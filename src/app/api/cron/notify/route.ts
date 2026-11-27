import { timingSafeEqual } from "node:crypto";
import { runNotificationJobs } from "@/lib/notification-jobs";

export const maxDuration = 60;

/** Called every minute by Cloud Scheduler with "Authorization: Bearer <CRON_SECRET>". */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  const given = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const ok = !!secret && given.length === secret.length && timingSafeEqual(Buffer.from(given), Buffer.from(secret));
  if (!ok) return Response.json({ error: "Not allowed" }, { status: 401 });
  return Response.json(await runNotificationJobs());
}
