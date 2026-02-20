import React, { useState, useEffect } from "react";
import { nowISO, parseMoney } from "../utils";

export default function CCPaymentForm({ accounts, defaultAccountId, onAdd }) {
  const [datePaid, setDatePaid] = useState(nowISO());
  const [cardName, setCardName] = useState("TC Principal");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [accountId, setAccountId] = useState(defaultAccountId || accounts[0]?.id);
  const [errors, setErrors] = useState({});
  const [attempted, setAttempted] = useState(false);

  useEffect(() => { if (defaultAccountId) setAccountId(defaultAccountId); }, [defaultAccountId]);

  function validate() {
    const e = {};
    if (!datePaid) e.datePaid = "Selecciona una fecha";
    if (!parseMoney(amount)) e.amount = "Ingresa un monto válido";
    if (!accountId) e.accountId = "Selecciona una cuenta";
    return e;
  }

  function submit(e) {
    e.preventDefault();
    setAttempted(true);
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    const a = parseMoney(amount);
    onAdd({ datePaid, cardName, amount: a, note, accountId });
    setAmount(""); setNote("");
    setAttempted(false); setErrors({});
  }

  const fieldStyle = (name) => attempted && errors[name] ? { borderColor: "#ef4444" } : {};

  return (
    <form onSubmit={submit}>
      <div className="formGrid">
        <label>Cuenta (desde donde pagas)
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)} style={fieldStyle("accountId")}>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          {attempted && errors.accountId && <span className="fieldError">{errors.accountId}</span>}
        </label>

        <label>Fecha pago
          <input type="date" value={datePaid} onChange={(e) => setDatePaid(e.target.value)} style={fieldStyle("datePaid")} />
          {attempted && errors.datePaid && <span className="fieldError">{errors.datePaid}</span>}
        </label>

        <label>Tarjeta
          <input value={cardName} onChange={(e) => setCardName(e.target.value)} />
        </label>

        <label>Monto pagado
          <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="ej: 1800000" style={fieldStyle("amount")} />
          {attempted && errors.amount && <span className="fieldError">{errors.amount}</span>}
        </label>

        <label style={{ gridColumn: "1 / -1" }}>Nota
          <input value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </div>

      <div style={{ marginTop: 10 }}>
        <button className="primary" type="submit">Registrar pago de TC</button>
      </div>
    </form>
  );
}
