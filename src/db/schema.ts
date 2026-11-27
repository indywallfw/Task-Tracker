import { relations, sql } from "drizzle-orm";
import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["admin", "member"]);
export const taskStatusEnum = pgEnum("task_status", [
  "backlog",
  "todo",
  "in_progress",
  "in_review",
  "done",
]);
export const priorityEnum = pgEnum("priority", [
  "none",
  "low",
  "medium",
  "high",
  "urgent",
]);

export const projectStatusEnum = pgEnum("project_status", ["planned", "active", "on_hold", "done"]);
export const sprintStatusEnum = pgEnum("sprint_status", ["planned", "active", "completed"]);

export const leadStageEnum = pgEnum("lead_stage", [
  "new",
  "contacted",
  "qualified",
  "proposal",
  "negotiation",
  "won",
  "lost",
]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
};

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: roleEnum("role").notNull().default("member"),
  active: boolean("active").notNull().default(true),
  ...timestamps,
});

export const sessions = pgTable(
  "sessions",
  {
    // sha256 of the cookie token; the raw token never touches the database
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/** Personal access tokens, used by Claude (MCP connector) and other API clients. */
export const apiTokens = pgTable(
  "api_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // sha256 of the token; the token itself is shown once and never stored
    tokenHash: text("token_hash").notNull().unique(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("api_tokens_user_idx").on(t.userId)],
);

/** Apps (e.g. Claude) that registered themselves to sign people in with OAuth. */
export const oauthClients = pgTable("oauth_clients", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  redirectUris: text("redirect_uris").array().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** One-time codes handed to the app after someone clicks Allow. Valid for a few minutes. */
export const oauthCodes = pgTable("oauth_codes", {
  // sha256 of the code
  id: text("id").primaryKey(),
  clientId: text("client_id")
    .notNull()
    .references(() => oauthClients.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  redirectUri: text("redirect_uri").notNull(),
  codeChallenge: text("code_challenge").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

/** A person's connection from an OAuth app: a short-lived access token plus a refresh token. */
export const oauthGrants = pgTable(
  "oauth_grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClients.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // sha256 hashes; the tokens themselves are never stored
    accessHash: text("access_hash").notNull().unique(),
    accessExpiresAt: timestamp("access_expires_at", { withTimezone: true }).notNull(),
    refreshHash: text("refresh_hash").notNull().unique(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("oauth_grants_user_idx").on(t.userId)],
);

/** A product groups projects, the people on it, its sprints and its documents. */
export const products = pgTable("products", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  // sprint planning notes (cadence, how the team plans) as editor HTML, shown on the Sprints tab
  sprintPlan: text("sprint_plan").notNull().default(""),
  archived: boolean("archived").notNull().default(false),
  createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
  ...timestamps,
});

export const productMembers = pgTable(
  "product_members",
  {
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // free text, e.g. "Product owner", "Developer"
    role: text("role").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.productId, t.userId] })],
);

export const sprints = pgTable(
  "sprints",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    goal: text("goal").notNull().default(""),
    startDate: date("start_date"),
    endDate: date("end_date"),
    status: sprintStatusEnum("status").notNull().default("planned"),
    ...timestamps,
  },
  (t) => [index("sprints_product_idx").on(t.productId)],
);

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  // short prefix used in task ids, e.g. "OPS" -> OPS-12
  key: text("key").notNull().unique(),
  description: text("description").notNull().default(""),
  // the proposed plan: approach, milestones, scope
  plan: text("plan").notNull().default(""),
  status: projectStatusEnum("status").notNull().default("active"),
  productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
  // listed in the product's Sprints section (e.g. Weekly Sprints) rather than with its projects
  sprintTracker: boolean("sprint_tracker").notNull().default(false),
  archived: boolean("archived").notNull().default(false),
  taskCounter: integer("task_counter").notNull().default(0),
  // extra columns shown in the table view, in order (e.g. imported Notion properties)
  fields: text("fields").array().notNull().default(sql`'{}'::text[]`),
  createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
  ...timestamps,
});

export const docs = pgTable(
  "docs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    parentId: uuid("parent_id"),
    title: text("title").notNull().default("Untitled"),
    icon: text("icon"),
    // rich text stored as HTML produced by the editor
    content: text("content").notNull().default(""),
    // plain-text copy used for search
    contentText: text("content_text").notNull().default(""),
    position: doublePrecision("position").notNull().default(0),
    // documents like a build plan, linked to a product
    productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    updatedById: uuid("updated_by_id").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("docs_parent_idx").on(t.parentId), index("docs_product_idx").on(t.productId)],
);

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    status: taskStatusEnum("status").notNull().default("todo"),
    priority: priorityEnum("priority").notNull().default("none"),
    assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
    creatorId: uuid("creator_id").references(() => users.id, { onDelete: "set null" }),
    dueDate: date("due_date"),
    // ordering inside a kanban column
    position: doublePrecision("position").notNull().default(0),
    sprintId: uuid("sprint_id").references(() => sprints.id, { onDelete: "set null" }),
    linkedDocId: uuid("linked_doc_id").references(() => docs.id, { onDelete: "set null" }),
    // follow-up tasks created from a lead
    leadId: uuid("lead_id").references((): AnyPgColumn => leads.id, { onDelete: "set null" }),
    // values for the project's extra fields, keyed by field name
    properties: jsonb("properties").$type<Record<string, string>>().notNull().default({}),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("tasks_project_idx").on(t.projectId),
    index("tasks_assignee_idx").on(t.assigneeId),
    index("tasks_lead_idx").on(t.leadId),
    index("tasks_sprint_idx").on(t.sprintId),
  ],
);

/** Client leads (CRM). */
export const leads = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    company: text("company").notNull(),
    contactName: text("contact_name").notNull().default(""),
    email: text("email").notNull().default(""),
    phone: text("phone").notNull().default(""),
    website: text("website").notNull().default(""),
    stage: leadStageEnum("stage").notNull().default("new"),
    // product keys from LEAD_PRODUCTS in lib/constants
    products: text("products").array().notNull().default(sql`'{}'::text[]`),
    // a key from LEAD_SOURCES, or "" when unknown
    source: text("source").notNull().default(""),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    nextFollowUp: date("next_follow_up"),
    notes: text("notes").notNull().default(""),
    // ordering inside a pipeline column
    position: doublePrecision("position").notNull().default(0),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("leads_owner_idx").on(t.ownerId), index("leads_stage_idx").on(t.stage)],
);

/** Calls, emails, meetings, notes and stage changes logged against a lead. */
export const leadActivities = pgTable(
  "lead_activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    // note | call | email | meeting | stage
    kind: text("kind").notNull().default("note"),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("lead_activities_lead_idx").on(t.leadId)],
);

export const comments = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("comments_task_idx").on(t.taskId)],
);

export const usersRelations = relations(users, ({ many }) => ({
  assignedTasks: many(tasks, { relationName: "assignee" }),
}));

export const projectsRelations = relations(projects, ({ many }) => ({
  tasks: many(tasks),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  project: one(projects, { fields: [tasks.projectId], references: [projects.id] }),
  assignee: one(users, {
    fields: [tasks.assigneeId],
    references: [users.id],
    relationName: "assignee",
  }),
  creator: one(users, { fields: [tasks.creatorId], references: [users.id] }),
  linkedDoc: one(docs, { fields: [tasks.linkedDocId], references: [docs.id] }),
  comments: many(comments),
}));

/** Personal to-do lists (like Todoist projects). To-dos without a list are in the Inbox. */
export const todoLists = pgTable(
  "todo_lists",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // a key from TODO_COLORS
    color: text("color").notNull().default("stone"),
    // id in the app it was imported from (e.g. a TickTick list)
    externalId: text("external_id"),
    position: doublePrecision("position").notNull().default(0),
    ...timestamps,
  },
  (t) => [index("todo_lists_user_idx").on(t.userId)],
);

/** Personal to-dos, private to their owner. */
export const todos = pgTable(
  "todos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    listId: uuid("list_id").references(() => todoLists.id, { onDelete: "set null" }),
    // sub-items
    parentId: uuid("parent_id").references((): AnyPgColumn => todos.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    notes: text("notes").notNull().default(""),
    dueDate: date("due_date"),
    // "HH:MM", only with a due date
    dueTime: text("due_time"),
    // 1 (highest) to 4 (none), like Todoist's p1–p4
    priority: integer("priority").notNull().default(4),
    labels: text("labels").array().notNull().default(sql`'{}'::text[]`),
    // a RECURRENCES key, e.g. "daily", "weekdays", "weekly", "monthly", "yearly"
    recurrence: text("recurrence"),
    // a reminder for a tracked task, e.g. added while planning a sprint
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "cascade" }),
    // where it came from: "sprint" (kept in sync with its sprint task), "reminder", "ticktick", or null if typed here
    source: text("source"),
    // id in the app it was imported from, so a re-import updates instead of duplicating
    externalId: text("external_id"),
    // minutes before the due time (0 = at the time; negative = after the start of an all-day date)
    reminders: integer("reminders").array().notNull().default(sql`'{}'::int[]`),
    position: doublePrecision("position").notNull().default(0),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("todos_user_idx").on(t.userId),
    index("todos_list_idx").on(t.listId),
    index("todos_parent_idx").on(t.parentId),
    index("todos_task_idx").on(t.taskId),
    index("todos_external_idx").on(t.userId, t.externalId),
  ],
);

/** Calendar events created in the app. */
export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    allDay: boolean("all_day").notNull().default(false),
    location: text("location").notNull().default(""),
    notes: text("notes").notNull().default(""),
    // a RECURRENCES key; repeats until `repeatUntil` (inclusive) or forever
    recurrence: text("recurrence"),
    repeatUntil: date("repeat_until"),
    // a key from TODO_COLORS
    color: text("color").notNull().default("blue"),
    ...timestamps,
  },
  (t) => [index("events_user_idx").on(t.userId), index("events_starts_idx").on(t.startsAt)],
);

/** A person's linked Google account, used to show their Google Calendar events (read-only). */
export const googleAccounts = pgTable("google_accounts", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  refreshToken: text("refresh_token").notNull(),
  accessToken: text("access_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  // which of their calendars to show
  calendarIds: text("calendar_ids").array().notNull().default(sql`'{primary}'::text[]`),
  ...timestamps,
});

export const commentsRelations = relations(comments, ({ one }) => ({
  task: one(tasks, { fields: [comments.taskId], references: [tasks.id] }),
  author: one(users, { fields: [comments.authorId], references: [users.id] }),
}));

export const docsRelations = relations(docs, ({ one }) => ({
  updatedBy: one(users, { fields: [docs.updatedById], references: [users.id] }),
}));

export type User = typeof users.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Sprint = typeof sprints.$inferSelect;
export type ProjectStatus = (typeof projectStatusEnum.enumValues)[number];
export type SprintStatus = (typeof sprintStatusEnum.enumValues)[number];
export type Task = typeof tasks.$inferSelect;
export type Doc = typeof docs.$inferSelect;
export type Lead = typeof leads.$inferSelect;
export type LeadStage = (typeof leadStageEnum.enumValues)[number];
export type TaskStatus = (typeof taskStatusEnum.enumValues)[number];
export type Todo = typeof todos.$inferSelect;
export type TodoList = typeof todoLists.$inferSelect;
export type CalendarEvent = typeof events.$inferSelect;
export type Priority = (typeof priorityEnum.enumValues)[number];

