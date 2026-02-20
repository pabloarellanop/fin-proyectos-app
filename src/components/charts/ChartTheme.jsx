import React from "react";
import { clp } from "../../utils";

export const CHART_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#ec4899', '#f97316', '#14b8a6', '#6366f1',
  '#84cc16', '#e11d48', '#0ea5e9', '#a855f7', '#d946ef',
];

export function CustomTooltip({ active, payload, label, formatter }) {
  if (!active || !payload?.length) return null;
  const fmt = formatter || ((v) => `$${clp(v)}`);
  return (
    <div className="chartTooltip">
      {label && <div className="chartTooltipLabel">{label}</div>}
      {payload.map((entry, i) => (
        <div key={i} className="chartTooltipRow">
          <span className="chartTooltipDot" style={{ background: entry.color || entry.fill }} />
          <span className="chartTooltipName">{entry.name}</span>
          <span className="chartTooltipValue">{fmt(entry.value)}</span>
        </div>
      ))}
    </div>
  );
}

export function PieTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="chartTooltip">
      <div className="chartTooltipRow">
        <span className="chartTooltipDot" style={{ background: d.payload?.fill || d.color }} />
        <span className="chartTooltipName">{d.name}</span>
        <span className="chartTooltipValue">${clp(d.value)}</span>
      </div>
    </div>
  );
}

export function ChartGradients() {
  return (
    <defs>
      <linearGradient id="gradGreen" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#10b981" stopOpacity={1} />
        <stop offset="100%" stopColor="#10b981" stopOpacity={0.4} />
      </linearGradient>
      <linearGradient id="gradRed" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#ef4444" stopOpacity={1} />
        <stop offset="100%" stopColor="#ef4444" stopOpacity={0.4} />
      </linearGradient>
      <linearGradient id="gradBlue" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#3b82f6" stopOpacity={1} />
        <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.4} />
      </linearGradient>
      <linearGradient id="gradPurple" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#8b5cf6" stopOpacity={1} />
        <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.4} />
      </linearGradient>
      <linearGradient id="gradOrange" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#f59e0b" stopOpacity={1} />
        <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.4} />
      </linearGradient>
    </defs>
  );
}

export function renderCustomLegend({ payload }) {
  return (
    <div className="chartLegend">
      {payload.map((entry, i) => (
        <div key={i} className="chartLegendItem">
          <span className="chartLegendDot" style={{ background: entry.color }} />
          <span>{entry.value}</span>
        </div>
      ))}
    </div>
  );
}
