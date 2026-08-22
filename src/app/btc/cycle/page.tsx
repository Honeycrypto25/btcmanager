import { requireSectionAccess } from "@/lib/permissions";
import CyclePageClient from "./CyclePageClient";

export default async function CyclePage() {
    await requireSectionAccess("btc");
    return <CyclePageClient />;
}
