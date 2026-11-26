import { redirect } from "next/navigation";

// Moved into Settings; kept so old links and bookmarks still work.
export default function Moved() {
  redirect("/settings/import");
}
