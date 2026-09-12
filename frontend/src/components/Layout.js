import SiteHeader from "@/components/SiteHeader";

export default function Layout({ children, header = true }) {
  return (
    <div className="relative min-h-screen bg-ink text-foreground">
      {/* Fixed dark paper texture background */}
      <div className="paper-bg pointer-events-none fixed inset-0 z-0 opacity-[0.12] mix-blend-overlay" aria-hidden />
      <div className="pointer-events-none fixed inset-0 z-0 bg-ink/40" aria-hidden />
      <div className="relative z-10">
        {header && <SiteHeader />}
        {children}
      </div>
    </div>
  );
}
