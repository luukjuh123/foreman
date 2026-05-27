"use client";

import React from "react";
import { cn } from "@/lib/utils";
import type { PunchItemStatus } from "@/lib/punch-items";

const STATUS_LABEL: Record<PunchItemStatus, string> = {
  open: "Open",
  fixed: "Gerepareerd",
  verified: "Geverifieerd",
};

const STATUS_CLASS: Record<PunchItemStatus, string> = {
  open: "bg-red-100 text-red-700",
  fixed: "bg-yellow-100 text-yellow-700",
  verified: "bg-green-100 text-green-700",
};

interface Props extends React.HTMLAttributes<HTMLSpanElement> {
  status: PunchItemStatus;
}

export function PunchStatusBadge({ status, className, ...rest }: Props) {
  return (
    <span
      {...rest}
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        STATUS_CLASS[status] ?? "bg-gray-100 text-gray-700",
        className
      )}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}
