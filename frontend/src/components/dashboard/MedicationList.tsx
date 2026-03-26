"use client";

import { Medication } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Pill, Calendar, User, Layers } from "lucide-react";

type MedicationListProps = {
  medications: Medication[];
  loading: boolean;
};

function StatusBadge({ status }: { status?: string }) {
  if (!status) return null;

  const colorMap: Record<string, string> = {
    active: "bg-green-500/15 text-green-400 border-green-500/30",
    completed: "bg-slate-500/15 text-slate-400 border-slate-500/30",
    stopped: "bg-red-500/15 text-red-400 border-red-500/30",
    "on-hold": "bg-amber-500/15 text-amber-400 border-amber-500/30",
    "entered-in-error": "bg-gray-500/15 text-gray-400 border-gray-500/30",
    cancelled: "bg-gray-500/15 text-gray-400 border-gray-500/30",
    draft: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  };

  const color = colorMap[status] || "bg-slate-500/15 text-slate-400 border-slate-500/30";

  return (
    <Badge variant="outline" className={`text-[10px] font-medium uppercase ${color}`}>
      {status}
    </Badge>
  );
}

function SourceBadge({ source }: { source?: string }) {
  if (!source) return null;

  return (
    <Badge
      variant="outline"
      className="bg-blue-500/10 text-blue-300 border-blue-500/20 text-[10px]"
    >
      {source}
    </Badge>
  );
}

function MedicationCard({ medication }: { medication: Medication }) {
  return (
    <div className="group flex items-start gap-3 rounded-lg border border-border bg-card/50 p-3 transition-colors hover:bg-accent/50 animate-slide-in">
      <div className="rounded-md bg-primary/10 p-2 mt-0.5">
        <Pill className="h-4 w-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-sm leading-tight text-foreground">
            {medication.name}
          </h3>
          <div className="flex shrink-0 gap-1.5">
            <StatusBadge status={medication.status} />
            <SourceBadge source={medication.source} />
          </div>
        </div>
        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {medication.dose && (
            <span className="flex items-center gap-1">
              <span className="text-primary/70 font-medium">Dose:</span> {medication.dose}
            </span>
          )}
          {medication.frequency && (
            <span className="flex items-center gap-1">
              <span className="text-primary/70 font-medium">Freq:</span> {medication.frequency}
            </span>
          )}
          {medication.prescriber && (
            <span className="flex items-center gap-1">
              <User className="h-3 w-3" />
              {medication.prescriber}
            </span>
          )}
          {medication.authoredOn && (
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {new Date(medication.authoredOn).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {[...Array(5)].map((_, i) => (
        <div
          key={i}
          className="flex items-start gap-3 rounded-lg border border-border bg-card/50 p-3"
        >
          <Skeleton className="h-8 w-8 rounded-md" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-48" />
            <div className="flex gap-4">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function MedicationList({ medications, loading }: MedicationListProps) {
  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Layers className="h-4 w-4 text-primary" />
            Patient Medications
          </CardTitle>
          {!loading && (
            <Badge variant="secondary" className="text-xs">
              {medications.length} found
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <LoadingSkeleton />
        ) : medications.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            <Pill className="mx-auto h-10 w-10 mb-2 opacity-30" />
            <p className="text-sm">No medications found</p>
            <p className="text-xs mt-1">Click Reconcile to fetch patient data</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
            {medications.map((med, idx) => (
              <MedicationCard key={`${med.name}-${idx}`} medication={med} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
