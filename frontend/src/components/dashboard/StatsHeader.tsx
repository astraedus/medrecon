"use client";

import { Medication, DrugInteraction } from "@/lib/types";
import {
  Pill,
  AlertTriangle,
  ShieldAlert,
  Activity,
  Database,
} from "lucide-react";

type StatsHeaderProps = {
  medications: Medication[];
  interactions: DrugInteraction[];
  loading: boolean;
  step: string;
};

function StatCard({
  icon: Icon,
  label,
  value,
  color,
  loading,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  color: string;
  loading: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
      <div className={`rounded-md p-2 ${color}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        {loading ? (
          <div className="mt-1 h-5 w-12 animate-pulse rounded bg-muted" />
        ) : (
          <p className="text-xl font-bold tabular-nums">{value}</p>
        )}
      </div>
    </div>
  );
}

export function StatsHeader({
  medications,
  interactions,
  loading,
  step,
}: StatsHeaderProps) {
  const severeCount = interactions.filter(
    (i) => i.severity === "SEVERE"
  ).length;
  const moderateCount = interactions.filter(
    (i) => i.severity === "MODERATE"
  ).length;

  const sources = new Set(medications.map((m) => m.source).filter(Boolean));

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <StatCard
        icon={Pill}
        label="Total Medications"
        value={medications.length}
        color="bg-blue-500/10 text-blue-400"
        loading={loading && step === "fetching_meds"}
      />
      <StatCard
        icon={AlertTriangle}
        label="Interactions Found"
        value={interactions.length}
        color="bg-amber-500/10 text-amber-400"
        loading={loading && step === "checking_interactions"}
      />
      <StatCard
        icon={ShieldAlert}
        label="Severe"
        value={severeCount}
        color={
          severeCount > 0
            ? "bg-red-500/10 text-red-400"
            : "bg-green-500/10 text-green-400"
        }
        loading={loading && step === "checking_interactions"}
      />
      <StatCard
        icon={Activity}
        label="Moderate"
        value={moderateCount}
        color="bg-amber-500/10 text-amber-400"
        loading={loading && step === "checking_interactions"}
      />
      <StatCard
        icon={Database}
        label="Sources"
        value={sources.size}
        color="bg-purple-500/10 text-purple-400"
        loading={loading && step === "fetching_meds"}
      />
    </div>
  );
}
