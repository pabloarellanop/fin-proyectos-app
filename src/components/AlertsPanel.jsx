import React, { useMemo } from "react";
import { clp } from "../utils";

export default function AlertsPanel({ state, cashflow, kpis, cashTransactions }) {
  const alerts = useMemo(() => {
    const list = [];

    // 1. Proyectos con margen negativo
    state.projects.forEach(p => {
      const inc = cashTransactions
        .filter(t => t.kind === "Ingreso" && t.category === p.category)
        .reduce((a, t) => a + t.amount, 0);
      const exp = cashTransactions
        .filter(t => t.kind === "Egreso" && t.projectCategory === p.category)
        .reduce((a, t) => a + t.amount, 0);
      if (exp > inc && (inc > 0 || exp > 0)) {
        list.push({
          type: "danger",
          icon: "⚠️",
          title: `Margen negativo: ${p.name}`,
          detail: `Ingresos $${clp(inc)} vs Egresos $${clp(exp)} — Déficit $${clp(exp - inc)}`,
        });
      }
    });

    // 2. Presupuesto excedido o cercano
    state.projects.forEach(p => {
      if (!p.budgetItems?.length) return;
      const budget = p.budgetItems.reduce((a, b) => a + (Number(b.amount) || 0), 0);
      if (budget <= 0) return;
      const spent = cashTransactions
        .filter(t => t.kind === "Egreso" && t.projectCategory === p.category)
        .reduce((a, t) => a + t.amount, 0);
      if (spent > budget) {
        const overPct = Math.round(((spent - budget) / budget) * 100);
        list.push({
          type: "danger",
          icon: "🔴",
          title: `Sobrecosto: ${p.name}`,
          detail: `Presupuesto $${clp(budget)} — Gastado $${clp(spent)} (+${overPct}%)`,
        });
      } else if (spent > budget * 0.85) {
        const pct = Math.round((spent / budget) * 100);
        list.push({
          type: "warning",
          icon: "🟡",
          title: `Presupuesto al ${pct}%: ${p.name}`,
          detail: `Presupuesto $${clp(budget)} — Gastado $${clp(spent)}`,
        });
      }
    });

    // 3. Pagos pendientes por cobrar
    const pendientes = state.incomes.filter(x => x.status === "Pendiente");
    if (pendientes.length > 0) {
      const total = pendientes.reduce((a, x) => a + (Number(x.amount) || 0), 0);
      list.push({
        type: "info",
        icon: "📋",
        title: `${pendientes.length} cobro${pendientes.length > 1 ? 's' : ''} pendiente${pendientes.length > 1 ? 's' : ''}`,
        detail: `Total por cobrar: $${clp(total)}`,
      });
    }

    // 4. Deuda TC alta
    if (kpis.ccOutstanding > 0) {
      list.push({
        type: "warning",
        icon: "💳",
        title: "Deuda TC pendiente",
        detail: `Compras sin pagar: $${clp(kpis.ccOutstanding)}`,
      });
    }

    // 5. Caja negativa
    if (cashflow.length > 0) {
      const last = cashflow[cashflow.length - 1];
      if (last.closing < 0) {
        list.push({
          type: "danger",
          icon: "🏦",
          title: "Caja negativa",
          detail: `Saldo final: $${clp(last.closing)}`,
        });
      }
    }

    return list;
  }, [state, cashflow, kpis, cashTransactions]);

  if (alerts.length === 0) {
    return (
      <div className="alertsEmpty">
        <span>✅</span> Todo en orden — sin alertas activas
      </div>
    );
  }

  return (
    <div className="alertsList">
      {alerts.map((a, i) => (
        <div key={i} className={`alertItem alertItem--${a.type}`}>
          <span className="alertIcon">{a.icon}</span>
          <div className="alertContent">
            <div className="alertTitle">{a.title}</div>
            <div className="alertDetail">{a.detail}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
