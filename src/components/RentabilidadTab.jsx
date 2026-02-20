import React, { useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
  Legend, ResponsiveContainer, ReferenceLine, Cell,
} from "recharts";
import { Section } from "./shared";
import { clp } from "../utils";
import { CustomTooltip, ChartGradients, CHART_COLORS, renderCustomLegend } from "./charts/ChartTheme";

export default function RentabilidadTab({ state, cashTransactions }) {
  const projectData = useMemo(() => {
    return state.projects.map((p, idx) => {
      const inc = cashTransactions
        .filter(t => t.kind === "Ingreso" && t.category === p.category)
        .reduce((a, t) => a + t.amount, 0);
      const exp = cashTransactions
        .filter(t => t.kind === "Egreso" && t.projectCategory === p.category)
        .reduce((a, t) => a + t.amount, 0);
      const margin = inc - exp;
      const marginPct = inc > 0 ? Math.round((margin / inc) * 100) : (exp > 0 ? -100 : 0);
      const contract = Number(p.contractTotal) || 0;
      const budget = (p.budgetItems || []).reduce((a, b) => a + (Number(b.amount) || 0), 0);
      const budgetDeviation = budget > 0 ? Math.round(((exp - budget) / budget) * 100) : 0;
      const roi = exp > 0 ? Math.round(((inc - exp) / exp) * 100) : 0;
      return {
        name: p.name, category: p.category, contract, budget,
        income: inc, expense: exp, margin, marginPct, budgetDeviation, roi,
        color: CHART_COLORS[idx % CHART_COLORS.length],
      };
    });
  }, [state.projects, cashTransactions]);

  const chartData = projectData.map(p => ({
    name: p.name,
    Ingresos: p.income,
    Egresos: p.expense,
    Margen: p.margin,
  }));

  const totals = useMemo(() => {
    const inc = projectData.reduce((a, p) => a + p.income, 0);
    const exp = projectData.reduce((a, p) => a + p.expense, 0);
    return {
      income: inc, expense: exp,
      margin: inc - exp,
      marginPct: inc > 0 ? Math.round(((inc - exp) / inc) * 100) : 0,
    };
  }, [projectData]);

  return (
    <div style={{ marginTop: 12 }}>
      <Section title="Rentabilidad general">
        <div className="kpis">
          <div className="kpi kpi--green">
            <div className="label">Ingresos totales</div>
            <div className="value">${clp(totals.income)}</div>
          </div>
          <div className="kpi kpi--red">
            <div className="label">Egresos totales</div>
            <div className="value">${clp(totals.expense)}</div>
          </div>
          <div className={`kpi ${totals.margin >= 0 ? 'kpi--green' : 'kpi--red'}`}>
            <div className="label">Margen bruto</div>
            <div className="value">${clp(totals.margin)}</div>
          </div>
          <div className={`kpi ${totals.marginPct >= 0 ? 'kpi--green' : 'kpi--red'}`}>
            <div className="label">Margen %</div>
            <div className="value">{totals.marginPct}%</div>
          </div>
        </div>
      </Section>

      <div className="grid" style={{ marginTop: 12 }}>
        <Section title="Comparativo por proyecto">
          <div className="chartCard">
            <div style={{ height: Math.max(220, projectData.length * 60 + 60) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 20, top: 10, bottom: 10 }}>
                  <ChartGradients />
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                  <XAxis
                    type="number"
                    tickFormatter={(v) => `$${clp(v)}`}
                    tick={{ fontSize: 11, fill: '#6b7280' }}
                    axisLine={{ stroke: '#e5e7eb' }}
                    tickLine={false}
                  />
                  <YAxis
                    type="category" dataKey="name" width={110}
                    tick={{ fontSize: 12, fontWeight: 600, fill: '#374151' }}
                    axisLine={false} tickLine={false}
                  />
                  <RTooltip content={<CustomTooltip />} />
                  <Legend content={renderCustomLegend} />
                  <Bar dataKey="Ingresos" fill="url(#gradGreen)" radius={[0, 6, 6, 0]} barSize={16} animationDuration={800} />
                  <Bar dataKey="Egresos" fill="url(#gradRed)" radius={[0, 6, 6, 0]} barSize={16} animationDuration={800} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </Section>

        <Section title="Margen por proyecto">
          <div className="chartCard">
            <div style={{ height: Math.max(220, projectData.length * 50 + 60) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 20, top: 10, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                  <XAxis
                    type="number"
                    tickFormatter={(v) => `$${clp(v)}`}
                    tick={{ fontSize: 11, fill: '#6b7280' }}
                    axisLine={{ stroke: '#e5e7eb' }}
                    tickLine={false}
                  />
                  <YAxis
                    type="category" dataKey="name" width={110}
                    tick={{ fontSize: 12, fontWeight: 600, fill: '#374151' }}
                    axisLine={false} tickLine={false}
                  />
                  <RTooltip content={<CustomTooltip />} />
                  <ReferenceLine x={0} stroke="#94a3b8" strokeWidth={1} />
                  <Bar dataKey="Margen" radius={[0, 6, 6, 0]} barSize={20} animationDuration={800}>
                    {chartData.map((entry, i) => (
                      <Cell key={i} fill={entry.Margen >= 0 ? '#10b981' : '#ef4444'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </Section>
      </div>

      <div style={{ marginTop: 12 }}>
        <Section title="Detalle de rentabilidad">
          <table>
            <thead>
              <tr>
                <th>Proyecto</th><th>Contrato</th><th>Presup.</th>
                <th>Ingresos</th><th>Egresos</th><th>Margen</th>
                <th>Margen&nbsp;%</th><th>ROI</th><th>Desv.</th>
              </tr>
            </thead>
            <tbody>
              {projectData.map((p, idx) => (
                <tr key={idx}>
                  <td><b>{p.name}</b></td>
                  <td>${clp(p.contract)}</td>
                  <td>{p.budget > 0 ? `$${clp(p.budget)}` : <span className="small">—</span>}</td>
                  <td className="amountGreen">${clp(p.income)}</td>
                  <td className="amountRed">${clp(p.expense)}</td>
                  <td style={{ color: p.margin >= 0 ? '#16a34a' : '#dc2626', fontWeight: 700 }}>
                    ${clp(p.margin)}
                  </td>
                  <td>
                    <span className={`badge ${p.marginPct >= 20 ? 'ok' : p.marginPct >= 0 ? 'warn' : 'bad'}`}>
                      {p.marginPct}%
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${p.roi >= 0 ? 'ok' : 'bad'}`}>{p.roi}%</span>
                  </td>
                  <td>
                    {p.budget > 0 ? (
                      <span className={`badge ${p.budgetDeviation <= 0 ? 'ok' : p.budgetDeviation <= 15 ? 'warn' : 'bad'}`}>
                        {p.budgetDeviation > 0 ? '+' : ''}{p.budgetDeviation}%
                      </span>
                    ) : <span className="small">—</span>}
                  </td>
                </tr>
              ))}
              {projectData.length === 0 && (
                <tr><td colSpan={9} className="small">Sin proyectos.</td></tr>
              )}
            </tbody>
          </table>
        </Section>
      </div>
    </div>
  );
}
