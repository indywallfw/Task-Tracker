import "server-only";
import { marked } from "marked";

export function markdownToHtml(md: string): string {
  return marked.parse(md, { async: false, gfm: true }) as string;
}

/** Converts editor HTML to readable plain text (keeps line structure and list bullets). */
export function htmlToText(html: string): string {
  return html
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<h([1-6])[^>]*>/gi, (_, n) => "\n" + "#".repeat(Number(n)) + " ")
    .replace(/<(br|\/p|\/h\d|\/li|\/tr|\/blockquote|\/pre)[^>]*>/gi, "\n")
    .replace(/<\/t[dh]>/gi, " | ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
