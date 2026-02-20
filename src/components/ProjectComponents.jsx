import React from "react";
import { parseMoney, clp } from "../utils";

export function PaymentPlanEditor({ project, paymentTypes, onChange }) {
  const plan = project.paymentPlan || [];

  function addRow() {
    const type = paymentTypes[0] || "Anticipo";
    onChange([...plan, { type, pct: 0 }]);
  }
  function updateRow(idx, patch) {
    onChange(plan.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }
  function delRow(idx) {
    onChange(plan.filter((_, i) => i !== idx));
  }

  const totalPct = plan.reduce((a, b) => a + (Number(b.pct) || 0), 0);

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div className="badge">Total % plan: <b style={{ marginLeft: 6 }}>{totalPct.toFixed(2)}%</b></div>
        <button className="primary" onClick={addRow} type="button">+ Agregar hito</button>
      </div>

      <div className="hr"></div>

      <table>
        <thead><tr><th>Tipo</th><th>% del contrato</th><th></th></tr></thead>
        <tbody>
          {plan.map((r, idx) => (
            <tr key={idx}>
              <td>
                <select value={r.type} onChange={(e) => updateRow(idx, { type: e.target.value })}>
                  {paymentTypes.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </td>
              <td>
                <input value={r.pct} onChange={(e) => updateRow(idx, { pct: parseMoney(e.target.value) })} style={{ width: 140 }} />
              </td>
              <td><button className="danger" type="button" onClick={() => delRow(idx)}>Eliminar</button></td>
            </tr>
          ))}
          {plan.length === 0 && <tr><td colSpan={3} className="small">Sin plan definido.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

export function ProjectPaymentSummary({ project, paymentTypes, receiptsMap }) {
  const plan = project.paymentPlan || [];
  const total = project.contractTotal || 0;

  const planByType = new Map();
  plan.forEach(p => {
    const pct = Number(p.pct) || 0;
    planByType.set(p.type, (planByType.get(p.type) || 0) + pct);
  });

  const rows = [...planByType.entries()].map(([type, pct]) => {
    const expected = total * (pct / 100);
    const received = receiptsMap?.get(type) || 0;
    const pending = expected - received;
    return { type, pct, expected, received, pending };
  });

  const extra = [];
  if (receiptsMap) {
    for (const [type, received] of receiptsMap.entries()) {
      if (!planByType.has(type) && received !== 0) {
        extra.push({ type, pct: 0, expected: 0, received, pending: -received });
      }
    }
  }

  const all = [...rows, ...extra].sort((a, b) => b.expected - a.expected);

  return (
    <table>
      <thead><tr><th>Tipo</th><th>%</th><th>Monto esperado</th><th>Recibido</th><th>Pendiente</th></tr></thead>
      <tbody>
        {all.map((r, idx) => (
          <tr key={idx}>
            <td><b>{r.type}</b>{r.expected === 0 && r.received > 0 ? <div className="small">Sin plan (%=0)</div> : null}</td>
            <td>{r.pct.toFixed(2)}%</td>
            <td>${clp(r.expected)}</td>
            <td>${clp(r.received)}</td>
            <td><b>${clp(r.pending)}</b></td>
          </tr>
        ))}
        {all.length === 0 && <tr><td colSpan={5} className="small">Define el plan de pagos y registra ingresos para ver estado.</td></tr>}
      </tbody>
    </table>
  );
}

export function ListEditor({ title, items, onChange, placeholder }) {
  const [value, setValue] = React.useState("");
  function add() {
    const v = value.trim();
    if (!v || items.includes(v)) return;
    onChange([...items, v]);
    setValue("");
  }
  function remove(item) {
    onChange(items.filter(x => x !== item));
  }
  return (
    <div>
      <div className="muted">Agrega o elimina items. Esto afecta los menús desplegables.</div>
      <div className="hr"></div>
      <div className="row">
        <input value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} style={{ flex: 1, minWidth: 0 }} />
        <button className="primary" onClick={add}>Agregar</button>
      </div>
      <div className="hr"></div>
      <div className="row" style={{ flexWrap: "wrap" }}>
        {items.map(it => (
          <span key={it} className="badge">
            {it}{" "}
            <button className="danger" style={{ marginLeft: 8 }} onClick={() => remove(it)}>x</button>
          </span>
        ))}
        {items.length === 0 && <span className="small">Sin items.</span>}
      </div>
    </div>
  );
}
