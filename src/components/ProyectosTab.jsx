import React, { useMemo } from "react";
import {
  Tooltip as RTooltip,
  ResponsiveContainer, Cell, Legend, PieChart, Pie,
} from "recharts";
import { Section, PaginationFooter } from "./shared";
import { PaymentPlanEditor, ProjectPaymentSummary } from "./ProjectComponents";
import { clp, parseMoney, accountName, contrastColor } from "../utils";
import { CHART_COLORS, PieTooltip, renderCustomLegend } from "./charts/ChartTheme";

/* ── Proyectos Tab ── */
export default function ProyectosTab({
  state, settings, activeProject, cashTransactions, projectReceiptsByType,
  updateProject, delProject, delExpense,
  projectPager, projectExpensePage, setProjectExpensePage,
}) {
  const contract = Number(activeProject?.contractTotal || 0);
  const spent = cashTransactions
    .filter(t => t.kind === "Egreso" && t.projectCategory === activeProject?.category)
    .reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const income = cashTransactions
    .filter(t => t.kind === "Ingreso" && t.category === activeProject?.category)
    .reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const margin = income - spent;
  const marginPct = income > 0 ? Math.round((margin / income) * 100) : 0;
  const percent = contract > 0 ? Math.round((spent / contract) * 100) : 0;

  const breakdown = useMemo(() => {
    const map = new Map();
    cashTransactions
      .filter(t => t.kind === "Egreso" && t.projectCategory === activeProject?.category)
      .forEach(t => map.set(t.category || "Sin categoría", (map.get(t.category) || 0) + t.amount));
    return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [cashTransactions, activeProject?.category]);

  return (
    <div style={{ marginTop: 12 }}>
      {/* KPIs */}
      <div className="kpis" style={{ marginBottom: 12 }}>
        <div className="kpi kpi--blue"><div className="label">Contrato</div><div className="value">${clp(contract)}</div></div>
        <div className="kpi kpi--green"><div className="label">Cobrado</div><div className="value">${clp(income)}</div></div>
        <div className="kpi kpi--red"><div className="label">Gastado</div><div className="value">${clp(spent)}</div></div>
        <div className={`kpi ${margin >= 0 ? 'kpi--green' : 'kpi--red'}`}>
          <div className="label">Margen ({marginPct}%)</div>
          <div className="value">${clp(margin)}</div>
        </div>
      </div>

      <div className="grid">
        {/* Datos */}
        <Section title="Datos del proyecto">
          <div className="formGrid">
            <label>Nombre
              <input value={activeProject?.name || ""} onChange={(e) => updateProject(activeProject.id, { name: e.target.value })} />
            </label>
            <label>Categoría
              <input value={activeProject?.category || ""} onChange={(e) => updateProject(activeProject.id, { category: e.target.value })} />
            </label>
            <label>Cliente
              <input value={activeProject?.client || ""} onChange={(e) => updateProject(activeProject.id, { client: e.target.value })} />
            </label>
            <label>Monto contrato (CLP)
              <input value={activeProject?.contractTotal || 0} onChange={(e) => updateProject(activeProject.id, { contractTotal: parseMoney(e.target.value) })} />
            </label>
          </div>
          <div style={{ marginTop: 8 }}>
            <button className="danger" onClick={() => { if (activeProject?.id) delProject(activeProject.id); }}>Eliminar proyecto</button>
          </div>
        </Section>

        {/* Progreso */}
        <Section title="Progreso de gasto">
          <div className="muted" style={{ marginBottom: 8 }}>
            Contrato: ${clp(contract)} — Gastado: ${clp(spent)} {contract > 0 && <span>({percent}%)</span>}
          </div>
          <div className="progressBar">
            <div
              className="progressFill"
              style={{
                width: Math.min(100, Math.max(0, percent)) + "%",
                background: percent > 100 ? '#ef4444' : percent > 85 ? '#f59e0b' : '#10b981',
              }}
            />
          </div>
          {breakdown.length > 0 && (
            <div className="chartCard" style={{ marginTop: 12 }}>
              <div style={{ height: 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                    <Pie
                      data={breakdown}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="38%"
                      innerRadius={35}
                      outerRadius={65}
                      paddingAngle={2}
                      animationDuration={800}
                    >
                      {breakdown.map((b, i) => {
                        const colors = state.settings.categoryColors?.expense?.[b.name];
                        const color = Array.isArray(colors) ? colors[0] : colors;
                        return <Cell key={i} fill={color || CHART_COLORS[i % CHART_COLORS.length]} stroke="none" />;
                      })}
                    </Pie>
                    <RTooltip content={<PieTooltip />} />
                    <Legend content={renderCustomLegend} verticalAlign="bottom" />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </Section>

        {/* Plan de pagos */}
        <Section title="Plan de pagos">
          <PaymentPlanEditor
            project={activeProject}
            paymentTypes={settings.paymentTypes}
            onChange={(nextPlan) => updateProject(activeProject.id, { paymentPlan: nextPlan })}
          />
          <div className="hr" />
          <div className="h2">Estado por hito</div>
          <ProjectPaymentSummary
            project={activeProject}
            paymentTypes={settings.paymentTypes}
            receiptsMap={projectReceiptsByType[activeProject.id]}
          />
        </Section>

        {/* Resumen multi-proyecto */}
        <Section title="Resumen por proyecto (caja)">
          <table>
            <thead><tr><th>Proyecto</th><th>Ingresos</th><th>Egresos</th><th>Neto</th></tr></thead>
            <tbody>
              {state.projects.map(p => {
                const inc = cashTransactions.filter(t => t.kind === "Ingreso" && t.category === p.category).reduce((a, b) => a + b.amount, 0);
                const exp = cashTransactions.filter(t => t.kind === "Egreso" && t.projectCategory === p.category).reduce((a, b) => a + b.amount, 0);
                return (
                  <tr key={p.id}>
                    <td><b>{p.name}</b><div className="small">{p.category}</div></td>
                    <td className="amountGreen">${clp(inc)}</td>
                    <td className="amountRed">${clp(exp)}</td>
                    <td style={{ color: (inc - exp) >= 0 ? '#16a34a' : '#dc2626', fontWeight: 700 }}>${clp(inc - exp)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Section>

        {/* Egresos del proyecto */}
        <Section title="Egresos del proyecto">
          <table>
            <thead><tr><th>Fecha</th><th>Cuenta</th><th>Categoría</th><th>Método</th><th>Proveedor</th><th>Monto</th><th>Nota</th><th></th></tr></thead>
            <tbody>
              {projectPager.pageItems.map(e => (
                <tr key={e.id}>
                  <td>{e.datePaid}</td>
                  <td>{accountName(state.accounts, e.accountId)}</td>
                  <td>
                    {(() => {
                      const colors = state.settings.categoryColors?.expense?.[e.category];
                      const color = Array.isArray(colors) ? colors[0] : colors;
                      if (!color) return <span>{e.category}</span>;
                      return <span style={{ display: "inline-block", padding: "4px 8px", borderRadius: 8, background: color, color: contrastColor(color), fontWeight: 600 }}>{e.category}</span>;
                    })()}
                  </td>
                  <td>{e.method}</td>
                  <td>{e.vendor || ""}</td>
                  <td>${clp(e.amount)}</td>
                  <td className="small">{e.note}</td>
                  <td><button className="danger" onClick={() => delExpense(e.id)}>×</button></td>
                </tr>
              ))}
              {projectPager.total === 0 && <tr><td colSpan={8} className="small">Sin egresos.</td></tr>}
            </tbody>
          </table>
          <PaginationFooter
            pager={projectPager}
            onPrev={() => setProjectExpensePage(p => Math.max(1, p - 1))}
            onNext={() => setProjectExpensePage(p => p + 1)}
          />
        </Section>
      </div>
    </div>
  );
}
