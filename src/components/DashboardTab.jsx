import React from "react";
import {
  PieChart, Pie, Cell, Tooltip as RTooltip, Legend, ResponsiveContainer,
} from "recharts";
import { Section } from "./shared";
import { clp, monthLabel, accountName, contrastColor, documentTypeLabel } from "../utils";
import { PieTooltip, CHART_COLORS, renderCustomLegend } from "./charts/ChartTheme";
import AlertsPanel from "./AlertsPanel";

export default function DashboardTab({
  state, settings, kpis, cashViewAccountId, setCashViewAccountId,
  dashMonth, setDashMonth, dashboardMonths, dashSort, setDashSort,
  dashPageClamped, dashTotalPages, setDashPage, dashPageTx, dashboardTxMonth,
  expenseByCategory, incomeByCategory, activeProject,
  updateIncome, updateExpense, exportMovements, delProject,
  setQuickMode, setQuickOpen,
  cashflow, cashTransactions,
}) {
  const pieColors = (data, type) =>
    data.map((row, i) => {
      const colorMap = type === "expense"
        ? state.settings.categoryColors?.expense
        : state.settings.categoryColors?.income;
      const colors = colorMap?.[row?.name];
      const color = Array.isArray(colors) ? colors[0] : colors;
      return color || CHART_COLORS[i % CHART_COLORS.length];
    });

  const expenseColors = pieColors(expenseByCategory, "expense");
  const incomeColors = pieColors(incomeByCategory, "income");

  return (
    <div style={{ marginTop: 12 }}>
      {/* Alertas */}
      <AlertsPanel
        state={state}
        cashflow={cashflow || []}
        kpis={kpis}
        cashTransactions={cashTransactions || []}
      />

      <div className="grid" style={{ marginTop: 12 }}>
        <Section
          title="Resumen"
          right={
            <div className="row">
              <select value={cashViewAccountId} onChange={(e) => setCashViewAccountId(e.target.value)}>
                <option value="CONSOLIDADO">Consolidado</option>
                {state.accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <button className="primary" onClick={() => { setQuickMode("Ingreso"); setQuickOpen(true); }}>
                + Registrar
              </button>
              <button className="ghost noPrint" onClick={() => window.print()} title="Generar PDF">
                📄 PDF
              </button>
            </div>
          }
        >
          <div className="row" style={{ marginBottom: 12 }}>
            <div>
              <div className="muted">Mes</div>
              <select value={dashMonth} onChange={(e) => setDashMonth(e.target.value)}>
                {dashboardMonths.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
              </select>
            </div>
          </div>

          <div className="kpis">
            <div className="kpi kpi--green"><div className="label">Ingresos</div><div className="value">${clp(kpis.totalIncome)}</div></div>
            <div className="kpi kpi--red"><div className="label">Egresos</div><div className="value">${clp(kpis.totalExpense)}</div></div>
            <div className="kpi kpi--blue"><div className="label">Neto</div><div className="value">${clp(kpis.net)}</div></div>
            <div className="kpi kpi--purple"><div className="label">Saldo en caja</div><div className="value">${clp(kpis.cashBalance)}</div></div>
            <div className="kpi kpi--orange"><div className="label">TC pendiente</div><div className="value">${clp(kpis.ccOutstanding)}</div></div>
          </div>

          <div className="hr"></div>

          <div className="grid">
            <div className="chartCard">
              <div className="chartCardHeader">Egresos por categoría</div>
              <div style={{ height: 320, position: "relative" }}>
                {expenseByCategory.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                      <Pie
                        data={expenseByCategory}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="40%"
                        innerRadius={45}
                        outerRadius={80}
                        paddingAngle={2}
                        animationBegin={0}
                        animationDuration={800}
                      >
                        {expenseByCategory.map((_, i) => (
                          <Cell key={i} fill={expenseColors[i]} stroke="none" />
                        ))}
                      </Pie>
                      <RTooltip content={<PieTooltip />} />
                      <Legend content={renderCustomLegend} verticalAlign="bottom" />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="chartEmpty">Sin datos</div>
                )}
              </div>
            </div>

            <div className="chartCard">
              <div className="chartCardHeader">Ingresos por categoría</div>
              <div style={{ height: 320, position: "relative" }}>
                {incomeByCategory.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                      <Pie
                        data={incomeByCategory}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="40%"
                        innerRadius={45}
                        outerRadius={80}
                        paddingAngle={2}
                        animationBegin={0}
                        animationDuration={800}
                      >
                        {incomeByCategory.map((_, i) => (
                          <Cell key={i} fill={incomeColors[i]} stroke="none" />
                        ))}
                      </Pie>
                      <RTooltip content={<PieTooltip />} />
                      <Legend content={renderCustomLegend} verticalAlign="bottom" />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="chartEmpty">Sin datos</div>
                )}
              </div>
            </div>
          </div>
        </Section>

        <Section
          title="Últimos movimientos"
          right={
            <div className="row" style={{ flexWrap: "wrap" }}>
              <select value={dashMonth} onChange={(e) => setDashMonth(e.target.value)} style={{ minWidth: 100 }}>
                {dashboardMonths.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
              </select>
              <select value={dashSort} onChange={(e) => setDashSort(e.target.value)}>
                <option value="DESC">Reciente</option>
                <option value="ASC">Antiguo</option>
              </select>
              <button className="ghost" onClick={exportMovements}>CSV</button>
              <div className="row" style={{ gap: 4 }}>
                <button className="ghost" onClick={() => setDashPage(p => Math.max(1, p - 1))} disabled={dashPageClamped <= 1}>◀</button>
                <span className="small">{dashPageClamped}/{dashTotalPages}</span>
                <button className="ghost" onClick={() => setDashPage(p => Math.min(dashTotalPages, p + 1))} disabled={dashPageClamped >= dashTotalPages}>▶</button>
              </div>
            </div>
          }
        >
          <table>
            <thead>
              <tr><th>Fecha</th><th>Tipo</th><th>Monto</th><th>Cuenta</th><th>Categoría</th><th>Doc</th><th>Nota</th></tr>
            </thead>
            <tbody>
              {dashPageTx.map((t, idx) => (
                <tr key={idx}>
                  <td>{t.date}</td>
                  <td><span className={"badge " + (t.kind === "Ingreso" ? "ok" : "bad")}>{t.kind}</span></td>
                  <td className={t.kind === "Ingreso" ? "amountGreen" : "amountRed"}>${clp(t.amount)}</td>
                  <td>{accountName(state.accounts, t.accountId)}</td>
                  <td>
                    {t.sourceType === "income" ? (
                      <select value={t.category} onChange={(e) => updateIncome(t.sourceId, { category: e.target.value })}>
                        {settings.incomeCategories.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    ) : t.sourceType === "expense" ? (
                      <select value={t.category} onChange={(e) => updateExpense(t.sourceId, { category: e.target.value })}>
                        {((state.expenses.find(x => x.id === t.sourceId)?.scope) === "Oficina"
                          ? settings.expenseCategoriesOffice
                          : settings.expenseCategoriesProject
                        ).map(c => {
                          const colors = state.settings.categoryColors?.expense?.[c];
                          const color = Array.isArray(colors) ? colors[0] : colors;
                          const style = color ? { backgroundColor: color, color: contrastColor(color) } : undefined;
                          return <option key={c} value={c} style={style}>{c}</option>;
                        })}
                      </select>
                    ) : (
                      <span>{t.category}</span>
                    )}
                  </td>
                  <td className="small">
                    {t.sourceType === "expense" && t.documentType && t.documentType !== "sin_respaldo"
                      ? <span className="badge ok" style={{ fontSize: 10, padding: '2px 6px' }}>{documentTypeLabel(t.documentType)}{t.documentNumber ? ` #${t.documentNumber}` : ''}</span>
                      : t.sourceType === "expense"
                        ? <span className="muted" style={{ fontSize: 11 }}>—</span>
                        : null
                    }
                  </td>
                  <td className="small">{t.note}</td>
                </tr>
              ))}
              {dashboardTxMonth.length === 0 && (
                <tr><td colSpan={7} className="small">Sin movimientos en el mes seleccionado.</td></tr>
              )}
            </tbody>
          </table>
        </Section>
      </div>
    </div>
  );
}
