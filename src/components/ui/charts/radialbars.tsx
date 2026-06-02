"use client";

import React from "react";
import { RadialBarChart, RadialBar, Legend, ResponsiveContainer, Tooltip } from "recharts";

interface RadialBarChartProps {
  data: { name: string; value: number; fill?: string }[];
  height?: number | string;
}

const DEFAULT_COLORS = ["#002B5B", "#3b82f6", "#10b981", "#8b5cf6", "#f59e0b", "#ef4444"];

export default function RadialBarChartComponent({
  data,
  height = 300,
}: RadialBarChartProps) {
  const processedData = data.map((d, i) => ({
    ...d,
    fill: d.fill || DEFAULT_COLORS[i % DEFAULT_COLORS.length],
  }));

  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart
          cx="50%"
          cy="50%"
          innerRadius="30%"
          outerRadius="90%"
          barSize={10}
          data={processedData}
        >
          <RadialBar
            background
            dataKey="value"
            radius={5}
          />
          <Tooltip
            contentStyle={{
              borderRadius: "12px",
              border: "none",
              boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)",
              padding: "12px",
            }}
          />
          <Legend
            iconSize={10}
            layout="vertical"
            verticalAlign="middle"
            align="right"
            wrapperStyle={{
              fontSize: "11px",
              fontWeight: "bold",
              color: "#64748b",
            }}
          />
        </RadialBarChart>
      </ResponsiveContainer>
    </div>
  );
}
