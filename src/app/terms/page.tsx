export const metadata = { title: "Terms of Use — BTC Manager" };

export default function TermsPage() {
    return (
        <main style={{ maxWidth: 720, margin: "0 auto", padding: "48px 24px", lineHeight: 1.6, color: "#e5e5e0", background: "#0a0a09" }}>
            <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 16 }}>Terms of Use</h1>
            <p style={{ marginBottom: 16 }}>
                BTC Manager is a private, single-user application built and operated by its account holder for
                personal financial record-keeping. It is not offered as a commercial service to the public and has
                no other users or customers.
            </p>
            <p style={{ marginBottom: 16 }}>
                Any Open Banking connection authorised through this application is used exclusively to import the
                account holder&apos;s own bank transactions into their own private records.
            </p>
            <p>Contact: sergiu.apostol@gmail.com</p>
        </main>
    );
}
