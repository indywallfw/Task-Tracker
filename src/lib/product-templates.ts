import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db, products, projects, sprints } from "@/db";
import { insertTask } from "@/lib/task-service";

/** Starter pieces that can be created together with a new product. */
export const PRODUCT_TEMPLATES = [
  {
    value: "sprint",
    label: "Sprint planning",
    hint: "Sprint planning notes on the Sprints tab, and Sprint 1 for next week",
  },
  {
    value: "weekly",
    label: "Weekly sprints",
    hint: "A Weekly Sprints project with one row per week: goal, planned, completed, retro",
  },
  {
    value: "launch",
    label: "Launch Readiness Pipeline",
    hint: "A Launch Readiness Pipeline project with the launch gates, from feature freeze to go / no-go",
  },
] as const;
export type ProductTemplate = (typeof PRODUCT_TEMPLATES)[number]["value"];

const LAUNCH_FIELDS = ["Gate", "Category", "Exit criteria", "Effort", "Notes"];
const LAUNCH_TASKS: { title: string; gate: string; category: string; exit: string }[] = [
  { title: "Feature freeze: launch scope locked", gate: "1. Build", category: "Product", exit: "Every launch feature is merged and nothing new is added" },
  { title: "QA pass on the release candidate", gate: "1. Build", category: "Engineering", exit: "No open critical or high bugs" },
  { title: "Security review and penetration test", gate: "2. Hardening", category: "Security", exit: "Critical and high findings fixed or accepted in writing" },
  { title: "Performance and load testing", gate: "2. Hardening", category: "Engineering", exit: "Meets the target load with headroom" },
  { title: "Backups, monitoring and on-call ready", gate: "2. Hardening", category: "Operations", exit: "Restore tested, alerts route to a person" },
  { title: "Pricing, billing and licensing live", gate: "3. Go-to-market", category: "Business", exit: "A test customer can pay and get access" },
  { title: "Terms, privacy policy and compliance", gate: "3. Go-to-market", category: "Legal", exit: "Published and signed off" },
  { title: "Docs, onboarding and support playbook", gate: "3. Go-to-market", category: "Support", exit: "A new user can get started without help" },
  { title: "Launch marketing: site, announcement, sales material", gate: "3. Go-to-market", category: "Marketing", exit: "Ready to publish on launch day" },
  { title: "Go / no-go review", gate: "4. Launch", category: "Product", exit: "Every gate above is met or has an owner and date" },
];

const WEEKLY_FIELDS = ["Week", "Sprint Goal", "Planned Tasks", "Completed Tasks", "Retro Notes"];

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Next Monday (or today if it is Monday) to the Friday after it. */
function nextWorkWeek() {
  const start = new Date();
  start.setHours(12, 0, 0, 0);
  start.setDate(start.getDate() + ((8 - start.getDay()) % 7));
  const end = new Date(start);
  end.setDate(start.getDate() + 4);
  return { start, end };
}

/** Finds a free project key: tries each candidate, then adds a digit. */
async function freeKey(candidates: string[]) {
  const clean = candidates.map((k) => k.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6)).filter((k) => /^[A-Z][A-Z0-9]{1,5}$/.test(k));
  const all = [...clean, ...[2, 3, 4, 5, 6, 7, 8, 9].map((n) => `${clean[0].slice(0, 5)}${n}`)];
  const taken = new Set((await db.select({ key: projects.key }).from(projects).where(inArray(projects.key, all))).map((r) => r.key));
  return all.find((k) => !taken.has(k)) ?? `P${Date.now().toString(36).slice(-5).toUpperCase()}`;
}

function initials(name: string) {
  const words = name.match(/[A-Za-z0-9]+/g) ?? [];
  return words.length > 1 ? words.map((w) => w[0]).join("") : (words[0] ?? "P").slice(0, 2);
}

function sprintPlanningDoc(product: string, hasWeekly: boolean, hasLaunch: boolean) {
  const steps = [
    "Each week gets a sprint in the product's Sprints tab, with a goal and dates.",
    "Add new work with \"Add a task to this sprint\" on the sprint board. It goes into the chosen project's task list, and you can tick \"Remind me\" to put a reminder in your To-dos.",
    "Before the sprint starts, pull tasks from the backlog into it and give each one an owner.",
    "During the week, move tasks across the sprint board as they progress.",
    "At the end of the week, complete the sprint. Unfinished tasks go back to the backlog for the next one.",
  ];
  if (hasWeekly) steps.push("Record the goal, what was planned, what got done and retro notes in Weekly Sprints.");
  if (hasLaunch) steps.push("Plan sprint work against the Launch Readiness Pipeline gates.");
  const html = [
    `<p>Weekly sprint planning and tracking for ${escape(product)}.</p>`,
    `<h2>Cadence</h2>`,
    `<p>Sprints run weekly, Monday to Friday. Planning happens on Monday morning and the review on Friday afternoon.</p>`,
    `<h2>Team</h2>`,
    `<p>See the product's People tab.</p>`,
    `<h2>How to use</h2>`,
    `<ol>${steps.map((s) => `<li><p>${s}</p></li>`).join("")}</ol>`,
    `<h2>Sprint goals</h2>`,
    `<ul><li><p>Sprint 1: </p></li></ul>`,
  ].join("");
  const text = [
    `Weekly sprint planning and tracking for ${product}.`,
    "Cadence",
    "Sprints run weekly, Monday to Friday. Planning happens on Monday morning and the review on Friday afternoon.",
    "Team",
    "See the product's People tab.",
    "How to use",
    ...steps,
    "Sprint goals",
    "Sprint 1:",
  ].join("\n\n");
  return { html, text };
}

function escape(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Creates the chosen starter pieces for a freshly created product. */
export async function seedProductTemplates(
  product: { id: string; name: string },
  userId: string,
  chosen: ProductTemplate[],
) {
  const want = new Set(chosen);
  const pre = initials(product.name);

  if (want.has("launch")) {
    const key = await freeKey(["LRP", `${pre}LRP`, `${pre}LR`]);
    const [p] = await db
      .insert(projects)
      .values({
        name: "Launch Readiness Pipeline",
        key,
        description: `Everything that has to be true before ${product.name} launches, grouped into gates.`,
        status: "planned",
        productId: product.id,
        fields: LAUNCH_FIELDS,
        createdById: userId,
      })
      .returning({ id: projects.id });
    for (const t of LAUNCH_TASKS) {
      await insertTask({
        projectId: p.id,
        title: t.title,
        creatorId: userId,
        properties: { Gate: t.gate, Category: t.category, "Exit criteria": t.exit },
      });
    }
  }

  const week = nextWorkWeek();

  if (want.has("weekly")) {
    const key = await freeKey(["WS", `${pre}WS`, `${pre}WK`]);
    const [p] = await db
      .insert(projects)
      .values({
        name: "Weekly Sprints",
        sprintTracker: true,
        key,
        description: "One row per week: the sprint goal, what was planned, what got done, and retro notes.",
        status: "active",
        productId: product.id,
        fields: WEEKLY_FIELDS,
        createdById: userId,
      })
      .returning({ id: projects.id });
    await insertTask({
      projectId: p.id,
      title: `Week of ${week.start.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`,
      creatorId: userId,
      dueDate: iso(week.end),
      properties: { Week: `${iso(week.start)} to ${iso(week.end)}` },
    });
  }

  if (want.has("sprint")) {
    // the notes live on the product's Sprints tab, not as a separate page
    const { html } = sprintPlanningDoc(product.name, want.has("weekly"), want.has("launch"));
    await db
      .update(products)
      .set({ sprintPlan: html })
      .where(and(eq(products.id, product.id), eq(products.sprintPlan, "")));
    // only start the numbering if the product has no sprints yet
    const existing = await db.select({ id: sprints.id }).from(sprints).where(eq(sprints.productId, product.id)).limit(1);
    if (!existing.length)
      await db.insert(sprints).values({
        productId: product.id,
        name: "Sprint 1",
        goal: "",
        startDate: iso(week.start),
        endDate: iso(week.end),
        status: "planned",
      });
  }
}
