-- to-dos with a time remind you at that time by default; turn it on for open ones from today on
UPDATE "todos" SET "reminders" = '{0}'
WHERE "due_time" IS NOT NULL
  AND cardinality("reminders") = 0
  AND "completed_at" IS NULL
  AND "due_date" >= current_date - 1;
