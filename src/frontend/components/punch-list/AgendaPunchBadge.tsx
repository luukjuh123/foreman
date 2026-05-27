"use client";

import React from "react";

interface Props {
  openCount: number;
}

export function AgendaPunchBadge({ openCount }: Props) {
  if (openCount === 0) return null;
  return (
    <span className="inline-flex items-center justify-center rounded-full bg-red-500 text-white text-xs font-bold h-5 min-w-5 px-1">
      {openCount}
    </span>
  );
}
