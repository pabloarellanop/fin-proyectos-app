import React, { useState, useEffect } from "react";
import { nowISO, parseMoney } from "../utils";

export default function TransferForm({ accounts, defaultFrom, onAdd }) {
  const [date, setDate] = useState(nowISO());
  const [fromAccountId, setFrom] = useState(defaultFrom || accounts[0]?.id);
  const [toAccountId, setTo] = useState(accounts[1]?.id || accounts[0]?.id);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState({});
  const [attempted, setAttempted] = useState(false);

  useEffect(() => { if (defaultFrom) setFrom(defaultFrom); }, [defaultFrom]);

  function validate() {
    const e = {};
    if (!date) e.date = "Selecciona una fecha";
    if (!parseMoney(amount)) e.amount = "Ingresa un monto válido";
    if (!fromAccountId) e.fromAccountId = "Selecciona cuenta origen";
    if (!toAccountId) e.toAccountId = "Selecciona cuenta destino";
    if (fromAccountId && toAccountId && fromAccountId === toAccountId) e.toAccountId = "Debe ser distinta a la cuenta origen";
    return e;
  }

  function submit(e) {
    e.preventDefault();
    setAttempted(true);
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    const a = parseMoney(amount);
    onAdd({ date, fromAccountId, toAccountId, amount: a, note });
    setAmount(""); setNote("");
    setAttempted(false); setErrors({});
  }

  const fieldStyle = (name) => attempted && errors[name] ? { borderColor: "#ef4444" } : {};

  return (
    <form onSubmit={submit}>
      <div className="formGrid">
        <label>Fecha
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={fieldStyle("date")} />
          {attempted && errors.date && <span className="fieldError">{errors.date}</span>}
        </label>

        <label>Desde cuenta
          <select value={fromAccountId} onChange={(e) => setFrom(e.target.value)} style={fieldStyle("fromAccountId")}>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          {attempted && errors.fromAccountId && <span className="fieldError">{errors.fromAccountId}</span>}
        </label>

        <label>Hacia cuenta
          <select value={toAccountId} onChange={(e) => setTo(e.target.value)} style={fieldStyle("toAccountId")}>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          {attempted && errors.toAccountId && <span className="fieldError">{errors.toAccountId}</span>}
        </label>

        <label>Monto
          <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="ej: 200000" style={fieldStyle("amount")} />
          {attempted && errors.amount && <span className="fieldError">{errors.amount}</span>}
        </label>

        <label style={{ gridColumn: "1 / -1" }}>Nota
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="ej: recargar caja chica" />
        </label>
      </div>

      <div style={{ marginTop: 10 }}>
        <button className="primary" type="submit">Registrar transferencia</button>
      </div>
    </form>
  );
}
