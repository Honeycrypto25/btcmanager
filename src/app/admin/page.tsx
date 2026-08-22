import { requireAdminPage } from "@/lib/permissions";
import AdminPageClient from "./AdminPageClient";

export default async function AdminPage() {
    await requireAdminPage();
    return <AdminPageClient />;
}
