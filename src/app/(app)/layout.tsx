import { requireUser } from "@/lib/auth";
import { getActiveProjects, getDocTree } from "@/lib/data";
import { getActiveProducts } from "@/lib/products";
import { Sidebar } from "@/components/sidebar";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const [projects, products, docTree] = await Promise.all([getActiveProjects(), getActiveProducts(), getDocTree()]);

  return (
    <div className="min-h-screen md:flex">
      <Sidebar user={user} projects={projects} products={products} docTree={docTree} />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
