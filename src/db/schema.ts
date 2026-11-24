import { relations } from "drizzle-orm";
import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
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

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  // short prefix used in task ids, e.g. "OPS" -> OPS-12
  key: text("key").notNull().unique(),
  description: text("description").notNull().default(""),
  archived: boolean("archived").notNull().default(false),
  taskCounter: integer("task_counter").notNull().default(0),
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
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    updatedById: uuid("updated_by_id").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("docs_parent_idx").on(t.parentId)],
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
    linkedDocId: uuid("linked_doc_id").references(() => docs.id, { onDelete: "set null" }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("tasks_project_idx").on(t.projectId),
    index("tasks_assignee_idx").on(t.assigneeId),
  ],
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

export const commentsRelations = relations(comments, ({ one }) => ({
  task: one(tasks, { fields: [comments.taskId], references: [tasks.id] }),
  author: one(users, { fields: [comments.authorId], references: [users.id] }),
}));

export const docsRelations = relations(docs, ({ one }) => ({
  updatedBy: one(users, { fields: [docs.updatedById], references: [users.id] }),
}));

export type User = typeof users.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type Doc = typeof docs.$inferSelect;
export type TaskStatus = (typeof taskStatusEnum.enumValues)[number];
export type Priority = (typeof priorityEnum.enumValues)[number];

