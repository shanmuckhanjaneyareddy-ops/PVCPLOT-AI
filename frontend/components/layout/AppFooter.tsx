export function AppFooter() {
  return (
    <footer className="mt-auto border-t border-border bg-card/50 backdrop-blur-sm shrink-0">
      <div className="px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-3">

        {/* Left: Brand */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-primary tracking-wide">PVCPilot AI</span>
          <span className="text-border">·</span>
          <span className="text-[10px] text-muted-foreground">© {new Date().getFullYear()}</span>
        </div>

        {/* Center: Tagline */}
        <p className="text-[10px] text-muted-foreground text-center hidden md:block">
          Multi-Agent Manufacturing Intelligence Platform
        </p>

      </div>
    </footer>
  );
}
export default AppFooter;
