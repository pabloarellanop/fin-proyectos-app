import React, { useMemo } from "react";
import {
  BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip as RTooltip,
  Legend, ResponsiveContainer, LineChart, Line, ReferenceLine,
} from "recharts";
import { Section } from "./shared";
import { clp, parseMoney, monthLabel, monthKey } from "../utils";
import { CustomTooltip, ChartGradients, renderCustomLegend } from "./charts/ChartTheme";

/* ── Projection Engine ── */
function projectCashflow(cashflow, monthsAhead = 6) {
  if (cashflow.length < 2) return [];

  const n = cashflow.length;
  const window = Math.min(3, n);

  // Moving average of last N months
  const recentInc = cashflow.slice(-window).reduce((a, r) => a + r.incomes, 0) / window;
  const recentExp = cashflow.slice(-window).reduce((a, r) => a + r.expenses, 0) / window;

  // Simple linear trend (slope over all data)
  let incSlope = 0, expSlope = 0;
  if (n >= 3) {
    const incValues = cashflow.map(r => r.incomes);
    const expValues = cashflow.map(r => r.expenses);
    incSlope = linearSlope(incValues);
    expSlope = linearSlope(expValues);
  }

  const projections = [];
  let lastClosing = cashflow[cashflow.length - 1]?.closing || 0;
  const lastMonth = cashflow[cashflow.length - 1]?.month || "";

  for (let i = 1; i <= monthsAhead; i++) {
    const month = addMonths(lastMonth, i);
    const inc = Math.max(0, Math.round(recentInc + incSlope * i));
    const exp = Math.max(0, Math.round(recentExp + expSlope * i));
    const net = inc - exp;
    const closing = lastClosing + net;
    projections.push({
      month, incomes: inc, expenses: exp, net, closing,
      opening: lastClosing, isProjection: true,
    });
    lastClosing = closing;
  }

  return projections;
}

function linearSlope(values) {
  const n = values.length;
  if (n < 2) return 0;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i; sumY += values[i]; sumXY += i * values[i]; sumX2 += i * i;
  }
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

function addMonths(yyyyMM, count) {
  if (!yyyyMM) return "";
  const [y, m] = yyyyMM.split("-").map(Number);
  const d = new Date(y, m - 1 + count, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function FlujoCajaTab({
  state, cashViewAccountId, setCashViewAccountId, cashflow, cashflowBars, setOpening,
}) {
  const projections = useMemo(() => projectCashflow(cashflow, 6), [cashflow]);

  const projectionChart = useMemo(() => {
    const historical = cashflow.map(r => ({
      month: r.month, Saldo: r.closing, Ingresos: r.incomes, Egresos: r.expenses, type: "real",
    }));
    const projected = projections.map(r => ({
      month: r.month, "Saldo proyectado": r.closing, "Ing. proyectado": r.incomes, "Egr. proyectado": r.expenses, type: "projection",
    }));
    // Bridge: last real month also appears in projection
    if (historical.length > 0 && projected.length > 0) {
      projected[0]["Saldo proyectado"] = historical[historical.length - 1].Saldo;
    }
    return [...historical, ...projected];
  }, [cashflow, projections]);

  const deficitMonths = projections.filter(p => p.closing < 0);

  return (
    <div style={{ marginTop: 12 }}>
      <Section
        title="Flujo de caja mensual"
        right={
          <select value={cashViewAccountId} onChange={(e) => setCashViewAccountId(e.target.value)}>
            <option value="CONSOLIDADO">Consolidado</option>
            {state.accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        }
      >
        <div className="muted">El saldo inicial solo se edita en el primer mes.</div>
        <div className="hr"></div>

        <div className="chartCard" style={{ marginBottom: 16 }}>
          <div style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={cashflowBars} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <ChartGradients />
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 11, fill: '#6b7280' }}
                  axisLine={{ stroke: '#e5e7eb' }}
                  tickLine={false}
                  tickFormatter={(v) => monthLabel(v)}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#6b7280' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `$${clp(v)}`}
                />
                <RTooltip content={<CustomTooltip />} />
                <Legend content={renderCustomLegend} />
                <Bar dataKey="Ingresos" fill="url(#gradGreen)" radius={[6, 6, 0, 0]} barSize={28} animationDuration={800} />
                <Bar dataKey="Egresos" fill="url(#gradRed)" radius={[6, 6, 0, 0]} barSize={28} animationDuration={800} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <table>
          <thead>
            <tr><th>Mes</th><th>Saldo inicial</th><th>Ingresos</th><th>Egresos</th><th>Neto</th><th>Saldo final</th><th>Editar</th></tr>
          </thead>
          <tbody>
            {cashflow.map((r, idx) => (
              <tr key={r.month}>
                <td><b>{monthLabel(r.month)}</b></td>
                <td>${clp(r.opening)}</td>
                <td className="amountGreen">${clp(r.incomes)}</td>
                <td className="amountRed">${clp(r.expenses)}</td>
                <td style={{ color: r.net >= 0 ? '#16a34a' : '#dc2626', fontWeight: 700 }}>${clp(r.net)}</td>
                <td><b>${clp(r.closing)}</b></td>
                <td>
                  {idx === 0 ? (
                    <input
                      style={{ width: 160 }}
                      placeholder="ej: 5731319"
                      value={state.cashOpeningByMonth?.[r.month] ?? ""}
                      onChange={(e) => setOpening(r.month, parseMoney(e.target.value))}
                    />
                  ) : <span className="small">—</span>}
                </td>
              </tr>
            ))}
            {cashflow.length === 0 && <tr><td colSpan={7} className="small">Sin movimientos.</td></tr>}
          </tbody>
        </table>
      </Section>

      {/* ── Proyecciones ── */}
      {cashflow.length >= 2 && (
        <Section title="📈 Proyección de flujo (6 meses)">
          <div className="muted" style={{ marginBottom: 10 }}>
            Estimación basada en promedio móvil (3 meses) + tendencia lineal. Las líneas punteadas son proyecciones.
          </div>

          {deficitMonths.length > 0 && (
            <div className="alertItem alertItem--warning" style={{ marginBottom: 12 }}>
              <span className="alertIcon">⚠️</span>
              <div className="alertContent">
                <div className="alertTitle">Alerta: Déficit de caja proyectado</div>
                <div className="alertDetail">
                  {deficitMonths.map(m => `${monthLabel(m.month)}: $${clp(m.closing)}`).join(" — ")}
                </div>
              </div>
            </div>
          )}

          <div className="chartCard" style={{ marginBottom: 16 }}>
            <div style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={projectionChart} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <ChartGradients />
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 10, fill: '#6b7280' }}
                    axisLine={{ stroke: '#e5e7eb' }}
                    tickLine={false}
                    tickFormatter={(v) => monthLabel(v)}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#6b7280' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `$${clp(v)}`}
                  />
                  <RTooltip content={<CustomTooltip />} />
                  <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="3 3" strokeWidth={1} />
                  <Legend content={renderCustomLegend} />
                  <Line type="monotone" dataKey="Saldo" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
                  <Line type="monotone" dataKey="Saldo proyectado" stroke="#3b82f6" strokeWidth={2} strokeDasharray="6 4" dot={{ r: 3, strokeDasharray: "" }} connectNulls={false} />
                  <Line type="monotone" dataKey="Ingresos" stroke="#10b981" strokeWidth={1.5} dot={false} connectNulls={false} />
                  <Line type="monotone" dataKey="Ing. proyectado" stroke="#10b981" strokeWidth={1.5} strokeDasharray="6 4" dot={false} connectNulls={false} />
                  <Line type="monotone" dataKey="Egresos" stroke="#ef4444" strokeWidth={1.5} dot={false} connectNulls={false} />
                  <Line type="monotone" dataKey="Egr. proyectado" stroke="#ef4444" strokeWidth={1.5} strokeDasharray="6 4" dot={false} connectNulls={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <table>
            <thead><tr><th>Mes</th><th>Ingresos est.</th><th>Egresos est.</th><th>Neto</th><th>Saldo</th><th>Estado</th></tr></thead>
            <tbody>
              {projections.map(r => (
                <tr key={r.month}>
                  <td><b>{monthLabel(r.month)}</b></td>
                  <td className="amountGreen">${clp(r.incomes)}</td>
                  <td className="amountRed">${clp(r.expenses)}</td>
                  <td style={{ color: r.net >= 0 ? '#16a34a' : '#dc2626', fontWeight: 700 }}>${clp(r.net)}</td>
                  <td><b style={{ color: r.closing >= 0 ? '#111827' : '#dc2626' }}>${clp(r.closing)}</b></td>
                  <td>
                    {r.closing < 0
                      ? <span className="badge bad">⚠️ Déficit</span>
                      : r.net < 0
                        ? <span className="badge warn">Negativo</span>
                        : <span className="badge ok">OK</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}
    </div>
  );
}
