import { AuthShell } from "@/components/auth-shell";
import { brandStyle } from "@/lib/brand";
import { logoUrl } from "@/lib/org";
import { getHostTenant } from "@/lib/tenant";

export const metadata = { title: "No access" };

export default async function NoAccess() {
  const tenant = await getHostTenant();
  return (
    <AuthShell style={tenant ? brandStyle(tenant) : undefined} logo={tenant ? logoUrl(tenant) : null}
      title="No access" subtitle={`Your account isn't a member of ${tenant?.name ?? "this organisation"}.`}>
      <p className="mb-4 text-sm text-muted">Ask an administrator to invite you, or sign in with a different email.</p>
      <form action="/auth/signout" method="post"><button className="btn-primary w-full">Sign out</button></form>
    </AuthShell>
  );
}
