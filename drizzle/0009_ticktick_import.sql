ALTER TABLE "todo_lists" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "todos" ADD COLUMN "source" text;--> statement-breakpoint
ALTER TABLE "todos" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "todos" ADD COLUMN "reminders" integer[] DEFAULT '{}'::int[] NOT NULL;--> statement-breakpoint
CREATE INDEX "todos_task_idx" ON "todos" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "todos_external_idx" ON "todos" USING btree ("user_id","external_id");--> statement-breakpoint
-- reminders added from the sprint board before this change
UPDATE "todos" SET "source" = 'reminder' WHERE "task_id" IS NOT NULL AND "source" IS NULL;
