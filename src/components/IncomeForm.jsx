import React, { useState, useEffect } from "react";
import { nowISO, parseMoney } from "../utils";

export default function IncomeForm({ settings, accounts, defaultCategory, defaultAccountId, onAdd }) {
  const [category, setCategory] = useState(defaultCategory || settings.incomeCategories[0]);
  const [typePago, setTypePago] = useState(settings.paymentTypes[0] || "Anticipo");
  const [status, setStatus] = useState("Pagado");
  const [dateInvoice, setDateInvoice] = useState(nowISO());
  const [datePaid, setDatePaid] = useState(nowISO());
  const [amount, setAmount] = useState("");
  const [amountPaid, setAmountPaid] = useState("");
  const [note, setNote] = useState("");
  const [accountId, setAccountId] = useState(defaultAccountId || accounts[0]?.id);
  const [errors, setErrors] = useState({});
  const [attempted, setAttempted] = useState(false);

  useEffect(() => { if (defaultCategory) setCategory(defaultCategory); }, [defaultCategory]);
  useEffect(() => { if (defaultAccountId) setAccountId(defaultAccountId); }, [defaultAccountId]);

  function validate() {
    const e = {};
    if (!accountId) e.accountId = "Selecciona una cuenta";
    if (!category) e.category = "Selecciona una categoría";
    if (!typePago) e.typePago = "Selecciona tipo de pago";
    if (!parseMoney(amount)) e.amount = "Ingresa un monto válido";
    if (status === "Pago parcial" && !parseMoney(amountPaid)) e.amountPaid = "Ingresa monto pagado";
    return e;
  }

  function submit(e) {
    e.preventDefault();
    setAttempted(true);
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    const a = parseMoney(amount);
    const ap = parseMoney(amountPaid);

    onAdd({
      accountId, category, typePago, status, dateInvoice,
      datePaid: status === "Pendiente" ? "" : datePaid,
      amount: a,
      amountPaid: status === "Pago parcial" ? ap : 0,
      note,
    });

    setAmount(""); setAmountPaid(""); setNote("");
    setAttempted(false); setErrors({});
  }

  const fieldStyle = (name) => attempted && errors[name] ? { borderColor: "#ef4444" } : {};

  return (
    <form onSubmit={submit}>
      <div className="formGrid">
        <label>Cuenta
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)} style={fieldStyle("accountId")}>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          {attempted && errors.accountId && <span className="fieldError">{errors.accountId}</span>}
        </label>

        <label>Categoría
          <select value={category} onChange={(e) => setCategory(e.target.value)} style={fieldStyle("category")}>
            {settings.incomeCategories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          {attempted && errors.category && <span className="fieldError">{errors.category}</span>}
        </label>

        <label>Tipo de pago
          <select value={typePago} onChange={(e) => setTypePago(e.target.value)} style={fieldStyle("typePago")}>
            {settings.paymentTypes.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          {attempted && errors.typePago && <span className="fieldError">{errors.typePago}</span>}
        </label>

        <label>Estado
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            {["Pagado", "Pendiente", "Pago parcial"].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>

        <label>Fecha factura
          <input type="date" value={dateInvoice} onChange={(e) => setDateInvoice(e.target.value)} />
        </label>

        <label>Fecha pago (si aplica)
          <input type="date" value={datePaid} onChange={(e) => setDatePaid(e.target.value)} />
        </label>

        <label>Monto (factura/EP)
          <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="ej: 5000000" style={fieldStyle("amount")} />
          {attempted && errors.amount && <span className="fieldError">{errors.amount}</span>}
        </label>

        <label>Monto pagado (solo si pago parcial)
          <input value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} placeholder="ej: 2500000" disabled={status !== "Pago parcial"} style={fieldStyle("amountPaid")} />
          {attempted && errors.amountPaid && <span className="fieldError">{errors.amountPaid}</span>}
        </label>

        <label style={{ gridColumn: "1 / -1" }}>Nota
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="observación" />
        </label>
      </div>

      <div style={{ marginTop: 10 }}>
        <button className="primary" type="submit">Agregar ingreso</button>
      </div>
    </form>
  );
}
