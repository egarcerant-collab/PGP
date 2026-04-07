"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface StatCardProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  value: string | number;
  icon: React.ElementType;
  footer?: string;
  accent?: "blue" | "green" | "amber" | "red" | "purple" | "default";
}

const accentMap = {
  blue:    { wrap: "border-blue-200 bg-blue-50",   icon: "bg-blue-100 text-blue-600",   val: "text-blue-900" },
  green:   { wrap: "border-green-200 bg-green-50", icon: "bg-green-100 text-green-600", val: "text-green-900" },
  amber:   { wrap: "border-amber-200 bg-amber-50", icon: "bg-amber-100 text-amber-600", val: "text-amber-900" },
  red:     { wrap: "border-red-200 bg-red-50",     icon: "bg-red-100 text-red-600",     val: "text-red-900" },
  purple:  { wrap: "border-purple-200 bg-purple-50",icon: "bg-purple-100 text-purple-600",val: "text-purple-900" },
  default: { wrap: "border-border bg-card",        icon: "bg-muted text-muted-foreground", val: "text-foreground" },
};

const StatCard = React.forwardRef<HTMLDivElement, StatCardProps>(
  ({ title, value, icon: Icon, footer, accent = "default", onDoubleClick, className, ...props }, ref) => {
    const colors = accentMap[accent];
    return (
      <div
        ref={ref}
        {...props}
        onDoubleClick={onDoubleClick}
        className={cn(
          "rounded-xl border p-4 flex flex-col gap-3 shadow-sm",
          colors.wrap,
          onDoubleClick && "cursor-pointer hover:shadow-md transition-shadow",
          className
        )}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide leading-tight">{title}</span>
          <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center shrink-0", colors.icon)}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <div className={cn("text-2xl font-bold leading-none", colors.val)}>{value}</div>
        {footer && <p className="text-xs text-muted-foreground leading-tight">{footer}</p>}
      </div>
    );
  }
);

StatCard.displayName = "StatCard";
export default StatCard;
