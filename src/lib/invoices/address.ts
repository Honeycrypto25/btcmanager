// Ported as-is from incoice/lib/address.ts.

export type InvoiceAddressParts = {
    addressLine1: string;
    addressLine2: string;
    city: string;
    region: string;
    postalCode: string;
    country: string;
};

function compact(values: Array<string | undefined>) {
    return values.map((value) => value?.trim() ?? "").filter(Boolean);
}

export function formatClientAddress(client: InvoiceAddressParts) {
    const locality = compact([client.city, client.region, client.postalCode]).join(", ");
    return compact([client.addressLine1, client.addressLine2, locality, client.country]).join(", ");
}

export function clientAddressLines(client: InvoiceAddressParts & { address?: string }) {
    const lines = compact([
        client.addressLine1,
        client.addressLine2,
        compact([client.city, client.region, client.postalCode]).join(", "),
        client.country,
    ]);

    if (lines.length) return lines;
    return compact((client.address ?? "").split(/\n|,/));
}

export function splitAddressLines(address: string) {
    return compact(address.split(/\n|,/));
}
