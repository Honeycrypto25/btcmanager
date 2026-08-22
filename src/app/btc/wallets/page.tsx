import { requireSectionAccess } from "@/lib/permissions";
import WalletsPageClient from "./WalletsPageClient";

export default async function WalletsPage() {
    await requireSectionAccess("btc");
    return <WalletsPageClient />;
}
