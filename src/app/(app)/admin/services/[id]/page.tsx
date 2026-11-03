import { notFound } from "next/navigation";
import { ConfirmButton } from "@/components/confirm-button";
import { requireManager, requireUser } from "@/lib/org";
import { deleteService, saveService } from "../actions";
import { ServiceForm } from "../service-form";

export const metadata = { title: "Service" };

export default async function ServicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { organisation: org } = await requireManager();
  if (id === "new") {
    return (
      <div className="space-y-5">
        <h1 className="text-2xl font-bold tracking-tight">New service</h1>
        <ServiceForm action={saveService.bind(null, null)} service={{ active: true, unit: "Hours" }} />
      </div>
    );
  }
  const { supabase } = await requireUser();
  const { data: s } = await supabase.from("services").select("*").eq("id", id).eq("organisation_id", org.id).maybeSingle();
  if (!s) notFound();
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold tracking-tight">{s.name}</h1>
      <ServiceForm action={saveService.bind(null, id)} service={s} />
      <form action={deleteService.bind(null, id)} className="border-t border-line pt-5">
        <ConfirmButton className="btn-ghost text-danger" message="Delete this service? Shifts using it keep their times but lose their price. To keep history, untick 'Available when rostering' instead.">Delete service</ConfirmButton>
      </form>
    </div>
  );
}
