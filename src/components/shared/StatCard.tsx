
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import React from "react";

interface StatCardProps extends React.HTMLAttributes<HTMLDivElement> {
    title: string;
    value: string | number;
    icon: React.ElementType;
    footer?: string;
}

const StatCard = React.forwardRef<HTMLDivElement, StatCardProps>(({ title, value, icon: Icon, footer, onDoubleClick, ...props }, ref) => (
    <div ref={ref} {...props} onDoubleClick={onDoubleClick}>
        <Card className={onDoubleClick ? "cursor-pointer hover:bg-muted/50 transition-colors" : ""}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{title}</CardTitle>
            <Icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{value}</div>
            {footer && <p className="text-xs text-muted-foreground">{footer}</p>}
          </CardContent>
        </Card>
    </div>
));

StatCard.displayName = 'StatCard';

export default StatCard;
