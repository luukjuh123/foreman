"use client";

import React from "react";

interface GanttDependencyArrowProps {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}

export function GanttDependencyArrow({ fromX, fromY, toX, toY }: GanttDependencyArrowProps) {
  const midX = (fromX + toX) / 2;
  const d = `M ${fromX} ${fromY} C ${midX} ${fromY}, ${midX} ${toY}, ${toX} ${toY}`;

  return (
    <svg
      data-testid="gantt-dependency-arrow"
      className="absolute inset-0 pointer-events-none overflow-visible"
      style={{ zIndex: 5 }}
    >
      <defs>
        <marker
          id="arrowhead"
          markerWidth="6"
          markerHeight="6"
          refX="3"
          refY="3"
          orient="auto"
        >
          <path d="M 0 0 L 6 3 L 0 6 z" fill="#f59e0b" />
        </marker>
      </defs>
      <path
        d={d}
        fill="none"
        stroke="#f59e0b"
        strokeWidth="1.5"
        strokeDasharray="4 2"
        markerEnd="url(#arrowhead)"
      />
    </svg>
  );
}
