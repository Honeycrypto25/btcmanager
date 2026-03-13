export default function OfflinePage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16">
      <div className="w-full max-w-xl rounded-[2rem] border border-white/10 bg-white/[0.04] p-8 text-center shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-primary">
          Offline Mode
        </p>
        <h1 className="mt-4 font-display text-4xl text-white sm:text-5xl">
          BTC Manager is temporarily offline
        </h1>
        <p className="mt-4 text-sm leading-7 text-stone-300">
          Your device appears to be offline right now. Reconnect to the internet and reopen the
          app to refresh live BTC pricing, cycle analysis, and portfolio data.
        </p>
      </div>
    </main>
  );
}
