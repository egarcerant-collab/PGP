"use client";

import React, { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface CollapsibleSectionProps {
  title: string;
  icon?: React.ElementType;
  defaultOpen?: boolean;
  badge?: string | number;
  badgeColor?: string;
  children: React.ReactNode;
  className?: string;
}

export default function CollapsibleSection({
  title,
  icon: Icon,
  defaultOpen = false,
  badge,
  badgeColor = "bg-primary/20 text-primary-foreground",
  children,
  className,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={cn("rounded-xl border border-border bg-card shadow-sm overflow-hidden", className)}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/40 transition-colors text-left group"
      >
        <div className="flex items-center gap-3">
          {Icon && (
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Icon className="h-4 w-4 text-primary" />
            </div>
          )}
          <span className="font-semibold text-sm text-foreground">{title}</span>
          {badge !== undefined && (
            <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full", badgeColor)}>
              {badge}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <span className="text-xs hidden sm:block">{open ? "Ocultar" : "Expandir"}</span>
          {open
            ? <ChevronDown className="h-4 w-4 transition-transform group-hover:scale-110" />
            : <ChevronRight className="h-4 w-4 transition-transform group-hover:scale-110" />}
        </div>
      </button>

      {open && (
        <div className="px-5 pb-5 pt-1 border-t border-border/50 animate-in slide-in-from-top-2 duration-200">
          {children}
        </div>
      )}
    </div>
  );
}
