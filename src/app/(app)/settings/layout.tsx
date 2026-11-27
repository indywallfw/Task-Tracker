import { requireUser } from "@/lib/auth";
import { SettingsTabs } from "@/components/settings-tabs";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const tabs = [
    { href: "/settings", label: "Display" },
    { href: "/settings/account", label: "Account" },
    { href: "/settings/notifications", label: "Notifications" },
    { href: "/settings/integrations", label: "Integrations" },
    { href: "/settings/import", label: "Import" },
    ...(user.role === "admin" ? [{ href: "/settings/people", label: "People" }] : []),
  ];
  return (
    <div className="mx-auto max-w-3xl px-4 py-5 md:px-8 md:py-8">
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">Settings</h1>
      <SettingsTabs tabs={tabs} />
      {children}
    </div>
  );
}
