import React, { useState, useEffect } from "react";
import { Modal } from "./shared";
import { nowISO, parseMoney, contrastColor } from "../utils";

export default function ExpenseEditModal({ open, expense, settings, accounts, onClose, onSave, onDelete }) {
  const [form, setForm] = useState({});
  const [errors, setErrors] = useState({});
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    if (!open || !expense) { setForm({}); setAttempted(false); setErrors({}); return; }
    setForm({
      datePaid: expense.datePaid || "",
      accountId: expense.accountId || accounts[0]?.id || "",
      scope: expense.scope || "Proyecto",
      projectCategory: expense.projectCategory || "",
      category: expense.category || "",
      method: expense.method || "Transferencia",
      vendor: expense.vendor || "",
      amount: expense.amount || 0,
      note: expense.note || "",
      ccCategory: expense.ccCategory || settings.creditCardCategories?.[0] || "Otros",
    });
    setAttempted(false); setErrors({});
  }, [open, expense]);

  if (!open || !expense) return null;

  function set(key, val) { setForm(prev => ({ ...prev, [key]: val })); }

  function validate() {
    const e = {};
    if (!form.accountId) e.accountId = "Requerido";
    if (!form.datePaid) e.datePaid = "Requerido";
    if (!parseMoney(form.amount)) e.amount = "Monto inválido";
    if (form.scope === "Proyecto" && !form.projectCategory) e.projectCategory = "Requerido";
    return e;
  }

  function submit(e) {
    e.preventDefault();
    setAttempted(true);
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    onSave(expense.id, { ...form, amount: parseMoney(form.amount) });
    onClose();
  }

  const projectOptions = settings.incomeCategories.filter(x => x.startsWith("OBRA:"));
  const catList = form.scope === "Oficina" ? settings.expenseCategoriesOffice : settings.expenseCategoriesProject;
  const fieldStyle = (name) => attempted && errors[name] ? { borderColor: "#ef4444" } : {};

  return (
    <Modal open={open} title="Editar egreso" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="formGrid">
          <label>Fecha
            <input type="date" value={form.datePaid} onChange={(e) => set("datePaid", e.target.value)} style={fieldStyle("datePaid")} />
            {attempted && errors.datePaid && <span className="fieldError">{errors.datePaid}</span>}
          </label>

          <label>Cuenta
            <select value={form.accountId} onChange={(e) => set("accountId", e.target.value)} style={fieldStyle("accountId")}>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            {attempted && errors.accountId && <span className="fieldError">{errors.accountId}</span>}
          </label>

          <label>Alcance
            <select value={form.scope} onChange={(e) => { set("scope", e.target.value); if (e.target.value === "Oficina") set("projectCategory", ""); }}>
              {["Oficina", "Proyecto"].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>

          {form.scope === "Proyecto" && (
            <label>Proyecto
              <select value={form.projectCategory} onChange={(e) => set("projectCategory", e.target.value)} style={fieldStyle("projectCategory")}>
                <option value="">— Seleccionar —</option>
                {projectOptions.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              {attempted && errors.projectCategory && <span className="fieldError">{errors.projectCategory}</span>}
            </label>
          )}

          <label>Categoría
            <select value={form.category} onChange={(e) => set("category", e.target.value)}>
              {catList.map(c => {
                const colors = settings.categoryColors?.expense?.[c];
                const color = Array.isArray(colors) ? colors[0] : colors;
                const style = color ? { backgroundColor: color, color: contrastColor(color) } : undefined;
                return <option key={c} value={c} style={style}>{c}</option>;
              })}
            </select>
          </label>

          <label>Método
            <select value={form.method} onChange={(e) => set("method", e.target.value)}>
              {["Transferencia", "Débito", "Efectivo", "Tarjeta Crédito"].map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>

          <label>Proveedor
            <input value={form.vendor} onChange={(e) => set("vendor", e.target.value)} placeholder="ej: Sodimac" />
          </label>

          <label>Monto (CLP)
            <input value={form.amount} onChange={(e) => set("amount", e.target.value)} style={fieldStyle("amount")} />
            {attempted && errors.amount && <span className="fieldError">{errors.amount}</span>}
          </label>

          {form.method === "Tarjeta Crédito" && (
            <label>Categoría TC
              <select value={form.ccCategory} onChange={(e) => set("ccCategory", e.target.value)}>
                {settings.creditCardCategories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
          )}

          <label style={{ gridColumn: "1 / -1" }}>Nota
            <input value={form.note} onChange={(e) => set("note", e.target.value)} placeholder="glosa" />
          </label>
        </div>

        <div className="row" style={{ marginTop: 12, justifyContent: "space-between" }}>
          <button type="button" className="danger" onClick={() => { onDelete(expense.id); onClose(); }}>Eliminar</button>
          <button type="submit" className="primary">Guardar cambios</button>
        </div>
      </form>
    </Modal>
  );
}
