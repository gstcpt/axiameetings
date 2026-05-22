"use client";

import React from "react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface PieChartProps {
  data: { name: string; value: number }[];
  colors?: string[];
  height?: number | string;
  donut?: boolean;
}

const DEFAULT_COLORS = ["#002B5B", "#3b82f6", "#10b981", "#8b5cf6", "#f59e0b", "#ef4444"];

export default function PieChartComponent({
  data,
  colors = DEFAULT_COLORS,
  height = 300,
  donut = false,
}: PieChartProps) {
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={donut ? 60 : 0}
            outerRadius={80}
            paddingAngle={5}
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
            ))}
          </Pie>
          <Tooltip contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)", padding: "12px" }} />
          <Legend
            verticalAlign="bottom"
            align="center"
            iconType="circle"
            wrapperStyle={{
              fontSize: "12px",
              fontWeight: "900",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              paddingTop: "20px",
              color: "#94a3b8",
            }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
