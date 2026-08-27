export default function OfflinePage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16">
      <div className="w-full max-w-xl rounded-2xl border border-border bg-surface p-8 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-primary">
          Offline Mode
        </p>
        <h1 className="mt-4 font-display text-3xl text-foreground sm:text-5xl">
          Personal Dashboard is temporarily offline
        </h1>
        <p className="mt-4 text-sm leading-7 text-stone-300">
          Your device appears to be offline right now. Reconnect to the internet and reopen the
          app to refresh live BTC pricing, cycle analysis, and portfolio data.
        </p>
      </div>
    </main>
  );
}
