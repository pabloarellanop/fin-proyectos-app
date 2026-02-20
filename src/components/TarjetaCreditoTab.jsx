import React from "react";
import CCPaymentForm from "./CCPaymentForm";
import { Section } from "./shared";
import { clp, accountName } from "../utils";

export default function TarjetaCreditoTab({
  state, accounts, activeAccountId,
  addCCPayment, delCCPayment, toggleCCPaid,
}) {
  return (
    <div className="grid" style={{ marginTop: 12 }}>
      <Section title="Pago de TC (sí caja)">
        <CCPaymentForm
          accounts={accounts}
          defaultAccountId={activeAccountId}
          onAdd={addCCPayment}
        />
      </Section>

      <Section
        title="Compras TC (con categorías, incluye devoluciones)"
        right={<span className="badge warn">Pendiente: ${clp(state.ccPurchases.filter(x => !x.isPaid).reduce((a, b) => a + b.amount, 0))}</span>}
      >
        <div className="muted">Puedes ingresar devoluciones con monto negativo (eso resta a la categoría).</div>
        <div className="hr"></div>

        <table>
          <thead>
            <tr><th>Fecha</th><th>Categoría TC</th><th>Proyecto</th><th>Proveedor</th><th>Monto</th><th>Glosa</th><th>Pagada</th></tr>
          </thead>
          <tbody>
            {state.ccPurchases.slice(0, 24).map(x => (
              <tr key={x.id}>
                <td>{x.datePurchase}</td>
                <td>{x.ccCategory}</td>
                <td className="small">{x.projectCategory || "—"}</td>
                <td>{x.vendor}</td>
                <td>${clp(x.amount)}</td>
                <td className="small">{x.note}</td>
                <td><input type="checkbox" checked={!!x.isPaid} onChange={(e) => toggleCCPaid(x.id, e.target.checked)} /></td>
              </tr>
            ))}
            {state.ccPurchases.length === 0 && <tr><td colSpan={7} className="small">Aún no hay compras TC.</td></tr>}
          </tbody>
        </table>

        <div className="hr"></div>
        <div className="h2">Pagos de TC registrados</div>
        <table>
          <thead><tr><th>Fecha pago</th><th>Cuenta</th><th>Tarjeta</th><th>Monto</th><th>Nota</th><th></th></tr></thead>
          <tbody>
            {state.ccPayments.slice(0, 12).map(x => (
              <tr key={x.id}>
                <td>{x.datePaid}</td>
                <td>{accountName(accounts, x.accountId)}</td>
                <td>{x.cardName}</td>
                <td>${clp(x.amount)}</td>
                <td className="small">{x.note}</td>
                <td><button className="danger" onClick={() => delCCPayment(x.id)}>Eliminar</button></td>
              </tr>
            ))}
            {state.ccPayments.length === 0 && <tr><td colSpan={6} className="small">Sin pagos TC.</td></tr>}
          </tbody>
        </table>
      </Section>
    </div>
  );
}
