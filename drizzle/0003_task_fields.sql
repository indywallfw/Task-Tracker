ALTER TABLE "projects" ADD COLUMN "fields" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "properties" jsonb DEFAULT '{}'::jsonb NOT NULL;