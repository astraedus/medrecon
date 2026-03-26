import { Dashboard } from "@/components/dashboard/Dashboard";
import { Activity, Heart } from "lucide-react";
import { Separator } from "@/components/ui/separator";

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header / Nav */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="rounded-md bg-primary/15 p-1.5">
                <Activity className="h-5 w-5 text-primary" />
              </div>
              <span className="text-lg font-bold tracking-tight">
                Med<span className="text-primary">Recon</span>
              </span>
            </div>
            <Separator orientation="vertical" className="h-5" />
            <span className="hidden text-xs text-muted-foreground sm:block">
              Intelligent Medication Reconciliation
            </span>
          </div>

          <div className="flex items-center gap-3">
            <a
              href="https://github.com/astraedus/medrecon"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
              GitHub
            </a>
            <div className="hidden items-center gap-1.5 text-[10px] text-muted-foreground/60 sm:flex">
              <Heart className="h-3 w-3" />
              Healthcare AI Hackathon
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-4 py-6">
        <Dashboard />
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-4">
        <div className="mx-auto max-w-7xl px-4 text-center text-xs text-muted-foreground">
          MedRecon v1.0 | Built with FHIR R4, MCP Protocol, and AI Agents |
          Data sourced from HAPI FHIR Public Server
        </div>
      </footer>
    </div>
  );
}
