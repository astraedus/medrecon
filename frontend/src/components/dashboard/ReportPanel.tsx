"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText } from "lucide-react";

type ReportPanelProps = {
  report: string;
  loading: boolean;
};

/**
 * Colorizes a line that mentions SEVERE / MODERATE / MINOR inline.
 * Returns a span with appropriate text color, or null to use default.
 */
function getSeverityClass(line: string): string {
  const upper = line.toUpperCase();
  if (upper.includes("SEVERE") || upper.includes("CRITICAL")) return "text-red-300";
  if (upper.includes("MODERATE")) return "text-amber-300";
  if (upper.includes("MINOR") || upper.includes("LOW RISK")) return "text-blue-300";
  return "";
}

/** Render inline bold: **text** -> <strong>text</strong> */
function renderInlineBold(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} className="font-semibold text-foreground">{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}

/** Parse a simple markdown table into header + rows */
function parseTable(lines: string[]): { headers: string[]; rows: string[][] } | null {
  if (lines.length < 2) return null;
  const headerLine = lines[0];
  const separatorLine = lines[1];
  if (!separatorLine.replace(/[\s|:-]/g, "").length) {
    // It's a separator — valid table
    const headers = headerLine.split("|").map((h) => h.trim()).filter(Boolean);
    const rows = lines.slice(2).map((row) =>
      row.split("|").map((c) => c.trim()).filter(Boolean)
    );
    return { headers, rows };
  }
  return null;
}

/** Render a markdown table */
function MarkdownTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="my-3 overflow-x-auto rounded-md border border-border">
      <table className="w-full text-xs">
        <thead className="bg-muted/40">
          <tr>
            {headers.map((h, i) => (
              <th key={i} className="px-3 py-2 text-left font-medium text-muted-foreground border-b border-border">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="border-b border-border/50 last:border-0 hover:bg-muted/20">
              {row.map((cell, ci) => {
                const sevClass = getSeverityClass(cell);
                return (
                  <td key={ci} className={`px-3 py-2 ${sevClass || "text-foreground/80"}`}>
                    {renderInlineBold(cell)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Main markdown renderer — handles: ## headers, ### headers, tables, bullet lists, bold, severity-colored lines */
function MarkdownContent({ markdown }: { markdown: string }) {
  const lines = markdown.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Skip empty lines (they act as spacers — add small gap via margin on blocks)
    if (!line.trim()) {
      i++;
      continue;
    }

    // H2 header
    if (line.startsWith("## ")) {
      elements.push(
        <h2 key={i} className="mt-5 mb-2 text-sm font-semibold text-foreground border-b border-border pb-1 first:mt-0">
          {line.slice(3).trim()}
        </h2>
      );
      i++;
      continue;
    }

    // H3 header
    if (line.startsWith("### ")) {
      elements.push(
        <h3 key={i} className="mt-3 mb-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          {line.slice(4).trim()}
        </h3>
      );
      i++;
      continue;
    }

    // H1 header (used as document title)
    if (line.startsWith("# ")) {
      elements.push(
        <h1 key={i} className="mt-2 mb-3 text-base font-bold text-foreground">
          {line.slice(2).trim()}
        </h1>
      );
      i++;
      continue;
    }

    // Table detection — look ahead for separator line
    if (line.includes("|") && i + 1 < lines.length && lines[i + 1].includes("|")) {
      // Collect all table lines
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].includes("|")) {
        tableLines.push(lines[i]);
        i++;
      }
      const parsed = parseTable(tableLines);
      if (parsed) {
        elements.push(<MarkdownTable key={`table-${i}`} headers={parsed.headers} rows={parsed.rows} />);
        continue;
      }
    }

    // Bullet list item
    if (line.match(/^[-*]\s/)) {
      // Collect consecutive bullet lines
      const bullets: string[] = [];
      while (i < lines.length && lines[i].match(/^[-*]\s/)) {
        bullets.push(lines[i].replace(/^[-*]\s/, ""));
        i++;
      }
      elements.push(
        <ul key={`ul-${i}`} className="my-2 space-y-1">
          {bullets.map((b, bi) => {
            const sevClass = getSeverityClass(b);
            return (
              <li key={bi} className={`flex gap-2 text-xs ${sevClass || "text-foreground/80"}`}>
                <span className="mt-0.5 shrink-0 text-muted-foreground">-</span>
                <span>{renderInlineBold(b)}</span>
              </li>
            );
          })}
        </ul>
      );
      continue;
    }

    // Numbered list item
    if (line.match(/^\d+\.\s/)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^\d+\.\s/)) {
        items.push(lines[i].replace(/^\d+\.\s/, ""));
        i++;
      }
      elements.push(
        <ol key={`ol-${i}`} className="my-2 space-y-1 list-decimal list-inside">
          {items.map((item, oi) => {
            const sevClass = getSeverityClass(item);
            return (
              <li key={oi} className={`text-xs ${sevClass || "text-foreground/80"}`}>
                {renderInlineBold(item)}
              </li>
            );
          })}
        </ol>
      );
      continue;
    }

    // Horizontal rule
    if (line.match(/^[-*_]{3,}$/)) {
      elements.push(<hr key={i} className="my-3 border-border" />);
      i++;
      continue;
    }

    // Regular paragraph line — colorize by severity
    const sevClass = getSeverityClass(line);
    elements.push(
      <p key={i} className={`text-xs leading-relaxed mb-1 ${sevClass || "text-foreground/80"}`}>
        {renderInlineBold(line)}
      </p>
    );
    i++;
  }

  return <div>{elements}</div>;
}

/** Loading skeleton */
function ReportSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="h-4 w-3/4 rounded bg-muted" />
      <div className="h-3 w-full rounded bg-muted/70" />
      <div className="h-3 w-5/6 rounded bg-muted/70" />
      <div className="h-3 w-4/6 rounded bg-muted/70" />
      <div className="mt-4 h-4 w-2/3 rounded bg-muted" />
      <div className="h-3 w-full rounded bg-muted/70" />
      <div className="h-3 w-5/6 rounded bg-muted/70" />
      <div className="mt-4 h-16 w-full rounded bg-muted/50" />
    </div>
  );
}

export function ReportPanel({ report, loading }: ReportPanelProps) {
  return (
    <Card className="border-border bg-card animate-slide-in">
      <CardHeader className="pb-2 pt-4">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <FileText className="h-4 w-4 text-primary" />
          Reconciliation Report
          <span className="ml-auto text-[10px] font-normal text-muted-foreground">
            3-agent pipeline
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-4">
        {loading ? (
          <ReportSkeleton />
        ) : report ? (
          <MarkdownContent markdown={report} />
        ) : (
          <p className="text-xs text-muted-foreground">No report available.</p>
        )}
      </CardContent>
    </Card>
  );
}
