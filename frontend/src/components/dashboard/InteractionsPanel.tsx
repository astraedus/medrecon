"use client";

import { DrugInteraction } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, ShieldCheck, Info, Zap } from "lucide-react";

type InteractionsPanelProps = {
  interactions: DrugInteraction[];
  loading: boolean;
};

function SeverityBadge({ severity }: { severity: string }) {
  const config: Record<
    string,
    { color: string; icon: React.ElementType; pulse: boolean }
  > = {
    SEVERE: {
      color: "bg-red-500/15 text-red-400 border-red-500/30",
      icon: ShieldCheck,
      pulse: true,
    },
    MODERATE: {
      color: "bg-amber-500/15 text-amber-400 border-amber-500/30",
      icon: AlertTriangle,
      pulse: false,
    },
    MILD: {
      color: "bg-blue-500/15 text-blue-400 border-blue-500/30",
      icon: Info,
      pulse: false,
    },
    CHECK: {
      color: "bg-blue-500/15 text-blue-400 border-blue-500/30",
      icon: Info,
      pulse: false,
    },
  };

  const { color, pulse } =
    config[severity] || config.CHECK;

  return (
    <Badge
      variant="outline"
      className={`font-bold text-[11px] uppercase tracking-wider ${color} ${pulse ? "severity-severe" : ""}`}
    >
      {severity}
    </Badge>
  );
}

function InteractionCard({ interaction }: { interaction: DrugInteraction }) {
  const borderColor: Record<string, string> = {
    SEVERE: "border-l-red-500",
    MODERATE: "border-l-amber-500",
    MILD: "border-l-blue-500",
    CHECK: "border-l-blue-500",
  };

  const bgColor: Record<string, string> = {
    SEVERE: "bg-red-500/5",
    MODERATE: "bg-amber-500/5",
    MILD: "bg-blue-500/5",
    CHECK: "bg-blue-500/5",
  };

  return (
    <div
      className={`rounded-lg border border-border border-l-4 ${borderColor[interaction.severity] || "border-l-gray-500"} ${bgColor[interaction.severity] || ""} p-4 transition-all animate-slide-in hover:shadow-md`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="h-4 w-4 text-amber-400" />
            <span className="font-semibold text-sm">
              {interaction.drug1}
            </span>
            <span className="text-muted-foreground text-xs">+</span>
            <span className="font-semibold text-sm">
              {interaction.drug2}
            </span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {interaction.description}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground/70">
              Source: {interaction.source}
            </span>
          </div>
        </div>
        <SeverityBadge severity={interaction.severity} />
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {[...Array(3)].map((_, i) => (
        <div
          key={i}
          className="rounded-lg border border-border border-l-4 border-l-muted p-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-4 rounded" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-3" />
                <Skeleton className="h-4 w-20" />
              </div>
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-3/4" />
            </div>
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function InteractionsPanel({
  interactions,
  loading,
}: InteractionsPanelProps) {
  const severeInteractions = interactions.filter((i) => i.severity === "SEVERE");
  const otherInteractions = interactions.filter((i) => i.severity !== "SEVERE");

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            Drug Interactions
          </CardTitle>
          {!loading && interactions.length > 0 && (
            <div className="flex gap-1.5">
              {severeInteractions.length > 0 && (
                <Badge className="bg-red-500/15 text-red-400 border-red-500/30 text-[10px]" variant="outline">
                  {severeInteractions.length} SEVERE
                </Badge>
              )}
              <Badge variant="secondary" className="text-xs">
                {interactions.length} total
              </Badge>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <LoadingSkeleton />
        ) : interactions.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            <ShieldCheck className="mx-auto h-10 w-10 mb-2 opacity-30 text-green-400" />
            <p className="text-sm">No interactions detected</p>
            <p className="text-xs mt-1">Run reconciliation to check for drug interactions</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
            {/* Severe interactions first */}
            {severeInteractions.map((interaction, idx) => (
              <InteractionCard
                key={`severe-${idx}`}
                interaction={interaction}
              />
            ))}
            {/* Then other interactions */}
            {otherInteractions.map((interaction, idx) => (
              <InteractionCard
                key={`other-${idx}`}
                interaction={interaction}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
