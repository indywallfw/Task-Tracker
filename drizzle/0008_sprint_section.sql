ALTER TABLE "products" ADD COLUMN "sprint_plan" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "sprint_tracker" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- existing sprint-tracking projects move to their product's Sprints section
UPDATE "projects" SET "sprint_tracker" = true WHERE "name" IN ('Weekly Sprints', 'Sprint Tasks');--> statement-breakpoint
-- copy each product's sprint planning page into its sprint planning notes (the page itself is left alone)
UPDATE "products" p SET "sprint_plan" = d."content" FROM "docs" d WHERE d."product_id" = p."id" AND d."title" ILIKE '%sprint planning%' AND p."sprint_plan" = '';
