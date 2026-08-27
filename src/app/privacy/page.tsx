export const metadata = { title: "Privacy Policy — BTC Manager" };

export default function PrivacyPage() {
    return (
        <main style={{ maxWidth: 720, margin: "0 auto", padding: "48px 24px", lineHeight: 1.6, color: "#e5e5e0", background: "#0a0a09" }}>
            <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 16 }}>Privacy Policy</h1>
            <p style={{ marginBottom: 16 }}>
                BTC Manager is a personal finance tracking application used by a single account holder to manage
                their own bitcoin, investment, vehicle and expense records.
            </p>
            <p style={{ marginBottom: 16 }}>
                When bank account data access is authorised via an Open Banking connection, transaction data
                (date, description, amount, balance) is retrieved solely to populate this application&apos;s own
                bank transaction records for personal bookkeeping and receipt-matching purposes. Data is not sold,
                shared with third parties, or used for any purpose other than the account holder&apos;s own record-keeping.
            </p>
            <p style={{ marginBottom: 16 }}>
                Data is stored in a private database accessible only to the account holder. Bank connections can be
                revoked at any time via the connected bank&apos;s own online banking or via the Open Banking provider.
            </p>
            <p>Contact: sergiu.apostol@gmail.com</p>
        </main>
    );
}
