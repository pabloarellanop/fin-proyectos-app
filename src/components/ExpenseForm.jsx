import React, { useState, useEffect, useMemo } from "react";
import { nowISO, parseMoney, contrastColor } from "../utils";
import { buildVendorRules, suggestCategory, suggestByKeywords } from "../autoCategory";

export default function ExpenseForm({ settings, accounts, defaultAccountId, activeProject, onAdd, providerNames, expenses, ocrPrefill }) {
  const [scope, setScope] = useState("Proyecto");
  const [projectCategory, setProjectCategory] = useState(activeProject?.category || settings.incomeCategories.find(x => x.startsWith("OBRA:")) || "");
  const [category, setCategory] = useState(settings.expenseCategoriesProject[0]);
  const [method, setMethod] = useState("Transferencia");
  const [datePaid, setDatePaid] = useState(nowISO());
  const [vendor, setVendor] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [accountId, setAccountId] = useState(defaultAccountId || accounts[0]?.id);
  const [ccCategory, setCCCategory] = useState(settings.creditCardCategories?.[0] || "Otros");
  const [errors, setErrors] = useState({});
  const [attempted, setAttempted] = useState(false);
  const [suggestion, setSuggestion] = useState(null);

  // Auto-categorization rules
  const vendorRules = useMemo(() => buildVendorRules(expenses || []), [expenses]);

  useEffect(() => { if (defaultAccountId) setAccountId(defaultAccountId); }, [defaultAccountId]);
  useEffect(() => { if (activeProject?.category) setProjectCategory(activeProject.category); }, [activeProject]);
  useEffect(() => {
    setCategory(scope === "Oficina" ? settings.expenseCategoriesOffice[0] : settings.expenseCategoriesProject[0]);
  }, [scope, settings.expenseCategoriesOffice, settings.expenseCategoriesProject]);

  // Auto-suggest on vendor change
  useEffect(() => {
    if (!vendor || vendor.length < 2) { setSuggestion(null); return; }
    const { suggestion: sug, confidence } = suggestCategory(vendor, vendorRules);
    if (sug && confidence >= 30) {
      setSuggestion({ ...sug, confidence });
    } else {
      const kwSug = suggestByKeywords(vendor);
      if (kwSug) setSuggestion({ ...kwSug, confidence: 25, method: "Transferencia", projectCategory: "" });
      else setSuggestion(null);
    }
  }, [vendor, vendorRules]);

  // Handle OCR prefill
  useEffect(() => {
    if (ocrPrefill) {
      if (ocrPrefill.amount) setAmount(String(ocrPrefill.amount));
      if (ocrPrefill.date) setDatePaid(ocrPrefill.date);
      if (ocrPrefill.vendor) setVendor(ocrPrefill.vendor);
    }
  }, [ocrPrefill]);

  function validate() {
    const e = {};
    if (!accountId) e.accountId = "Selecciona una cuenta";
    if (!datePaid) e.datePaid = "Selecciona una fecha";
    if (!parseMoney(amount)) e.amount = "Ingresa un monto válido";
    if (scope === "Proyecto" && !projectCategory) e.projectCategory = "Selecciona un proyecto";
    return e;
  }

  function submit(e) {
    e.preventDefault();
    setAttempted(true);
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    const a = parseMoney(amount);

    onAdd({
      accountId, scope,
      projectCategory: scope === "Proyecto" ? projectCategory : "",
      category, method, datePaid, vendor,
      amount: a, note,
      ccCategory: method === "Tarjeta Crédito" ? ccCategory : "",
    });

    setVendor(""); setAmount(""); setNote("");
    setAttempted(false); setErrors({});
    setSuggestion(null);
  }

  function applySuggestion() {
    if (!suggestion) return;
    if (suggestion.scope) setScope(suggestion.scope);
    if (suggestion.category) setCategory(suggestion.category);
    if (suggestion.projectCategory) setProjectCategory(suggestion.projectCategory);
    if (suggestion.method) setMethod(suggestion.method);
    setSuggestion(null);
  }

  const fieldStyle = (name) => attempted && errors[name] ? { borderColor: "#ef4444" } : {};

  return (
    <form onSubmit={submit}>
      {/* Auto-categorization suggestion */}
      {suggestion && (
        <div className="autoSuggestBanner" onClick={applySuggestion}>
          <span>🤖</span>
          <span>Sugerencia: <b>{suggestion.scope}</b> → <b>{suggestion.category}</b></span>
          <span className="badge" style={{ fontSize: 10 }}>{suggestion.confidence}%</span>
          <button type="button" className="primary" style={{ padding: "4px 10px", fontSize: 11 }}>Aplicar</button>
        </div>
      )}
      <div className="formGrid">
        <label>Cuenta (desde donde sale)
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)} style={fieldStyle("accountId")}>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          {attempted && errors.accountId && <span className="fieldError">{errors.accountId}</span>}
        </label>

        <label>Alcance
          <select value={scope} onChange={(e) => setScope(e.target.value)}>
            {["Oficina", "Proyecto"].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>

        {scope === "Proyecto" && (
          <label>Proyecto (categoría)
            <select value={projectCategory} onChange={(e) => setProjectCategory(e.target.value)} style={fieldStyle("projectCategory")}>
              {settings.incomeCategories.filter(x => x.startsWith("OBRA:")).map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            {attempted && errors.projectCategory && <span className="fieldError">{errors.projectCategory}</span>}
          </label>
        )}

        <label>Categoría
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {(scope === "Oficina" ? settings.expenseCategoriesOffice : settings.expenseCategoriesProject).map(c => {
              const colors = settings.categoryColors?.expense?.[c];
              const color = Array.isArray(colors) ? colors[0] : colors;
              const style = color ? { backgroundColor: color, color: contrastColor(color) } : undefined;
              return <option key={c} value={c} style={style}>{c}</option>;
            })}
          </select>
        </label>

        <label>Método de pago
          <select value={method} onChange={(e) => setMethod(e.target.value)}>
            {["Transferencia", "Débito", "Efectivo", "Tarjeta Crédito"].map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>

        <label>Fecha
          <input type="date" value={datePaid} onChange={(e) => setDatePaid(e.target.value)} style={fieldStyle("datePaid")} />
          {attempted && errors.datePaid && <span className="fieldError">{errors.datePaid}</span>}
        </label>

        <label>Proveedor
          <input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="ej: Sodimac / maestro" list="providerList" />
          {providerNames && providerNames.length > 0 && (
            <datalist id="providerList">
              {providerNames.map(n => <option key={n} value={n} />)}
            </datalist>
          )}
        </label>

        <label>Monto (CLP) — puede ser negativo si es devolución
          <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="ej: 350000 o -50000" style={fieldStyle("amount")} />
          {attempted && errors.amount && <span className="fieldError">{errors.amount}</span>}
        </label>

        {method === "Tarjeta Crédito" && (
          <label>Categoría TC
            <select value={ccCategory} onChange={(e) => setCCCategory(e.target.value)}>
              {settings.creditCardCategories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        )}

        <label style={{ gridColumn: "1 / -1" }}>Nota
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="glosa" />
        </label>
      </div>

      <div style={{ marginTop: 10 }}>
        <button className="primary" type="submit">Agregar egreso</button>
      </div>
    </form>
  );
}
