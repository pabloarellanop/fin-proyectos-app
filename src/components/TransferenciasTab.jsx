import React from "react";
import { Section, PaginationFooter } from "./shared";
import { clp, accountName } from "../utils";

export default function TransferenciasTab({
  state, accounts, transferStats, transferPager, transferPage, setTransferPage, delTransfer,
}) {
  return (
    <div className="grid" style={{ marginTop: 12 }}>
      <Section title="Indicador de flujo entre cuentas">
        {state.transfers.length ? (
          <div>
            <div className="row" style={{ justifyContent: "space-between", fontWeight: 600, textTransform: "uppercase", marginBottom: 6 }}>
              <span>Arquitectura</span>
              <span>Corriente</span>
            </div>
            {(() => {
              const pct = Math.min(50, (Math.abs(transferStats.balance) / transferStats.maxAbs) * 50);
              const baseStyle = { position: "relative", height: 18, borderRadius: 9, background: "#e5e7eb", overflow: "hidden" };
              const segmentStyle = transferStats.balance >= 0
                ? { left: "50%", width: `${pct}%`, background: "#16a34a" }
                : { right: "50%", width: `${pct}%`, background: "#dc2626" };
              return (
                <div style={baseStyle}>
                  <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 2, background: "#fff" }}></div>
                  <div style={{ position: "absolute", top: 0, bottom: 0, ...segmentStyle }}></div>
                </div>
              );
            })()}
            <div className="small" style={{ marginTop: 8 }}>
              Balance neto hacia Corriente: <b>${clp(transferStats.balance)}</b>
              {transferStats.balance === 0 ? " (equilibrado)" : transferStats.balance > 0 ? " (flujo neto hacia Corriente)" : " (flujo neto hacia Arquitectura)"}
            </div>
            <div className="mini">*Sumatoria neta según transferencias entre cuentas con nombres que contienen "arquitectura" vs "corriente".</div>
          </div>
        ) : (
          <div className="muted">Aún no hay transferencias para analizar.</div>
        )}
      </Section>

      <Section title="Historial de transferencias entre cuentas">
        <table>
          <thead><tr><th>Fecha</th><th>Desde</th><th>Hacia</th><th>Monto</th><th>Nota</th><th></th></tr></thead>
          <tbody>
            {transferPager.pageItems.map(tr => (
              <tr key={tr.id}>
                <td>{tr.date}</td>
                <td>{accountName(accounts, tr.fromAccountId)}</td>
                <td>{accountName(accounts, tr.toAccountId)}</td>
                <td>${clp(tr.amount)}</td>
                <td className="small">{tr.note}</td>
                <td><button className="danger" onClick={() => delTransfer(tr.id)}>Eliminar</button></td>
              </tr>
            ))}
            {transferPager.total === 0 && <tr><td colSpan={6} className="small">Sin transferencias registradas.</td></tr>}
          </tbody>
        </table>
        <PaginationFooter
          pager={transferPager}
          onPrev={() => setTransferPage(p => Math.max(1, p - 1))}
          onNext={() => setTransferPage(p => p + 1)}
        />
      </Section>
    </div>
  );
}
