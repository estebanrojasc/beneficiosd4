"use client";

import type { ReactNode } from "react";

interface CourseAccordionProps {
  curso: string;
  expanded: boolean;
  onToggle: () => void;
  metrics?: ReactNode;
  children: ReactNode;
}

export default function CourseAccordion({
  curso,
  expanded,
  onToggle,
  metrics,
  children,
}: CourseAccordionProps) {
  return (
    <div className="card overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-3 p-3 text-left hover:bg-[#f8faff] transition-colors"
      >
        <div className="min-w-0 flex-1 flex flex-wrap items-center gap-2">
          <h4 className="font-black text-[#27407a]">{curso}</h4>
          {metrics}
        </div>
        <span className="text-[#6b7aa0] font-bold shrink-0">
          {expanded ? "▲" : "▼"}
        </span>
      </button>
      {expanded && (
        <div className="border-t-2 border-[#eef2ff] p-3 space-y-2">{children}</div>
      )}
    </div>
  );
}
