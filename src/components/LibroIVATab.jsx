import React, { useState, useMemo } from "react";
import { Section, PaginationFooter } from "./shared";
import { usePagination } from "../hooks/usePagination";
import { clp, monthKey, monthLabel, sortByDate, calcIVA, IVA_RATE } from "../utils";

export default function LibroIVATab({ state }) {
  const [filterMonth, setFilterMonth] = useState("ALL");
  const [view, setView] = useState("compras");
  const [pageC, setPageC] = useState(1);
  const [pageV, setPageV] = useState(1);

  // ── Libro de Compras: Expenses with factura afecta ──
  const libroCompras = useMemo(() => {
    return state.expenses
      .filter(e => e.documentType === "factura_afecta")
      .map(e => {
        const { neto, iva } = calcIVA(e.amount);
        return {
          ...e, neto, iva, total: e.amount,
          month: monthKey(e.documentIssuedAt || e.datePaid),
          providerRut: e.documentProvider || e.vendor || "",
        };
      })
      .sort((a, b) => sortByDate(b.documentIssuedAt || b.datePaid, a.documentIssuedAt || a.datePaid));
  }, [state.expenses]);

  // ── Libro de Ventas: Incomes (IVA included) ──
  const libroVentas = useMemo(() => {
    return state.incomes
      .filter(i => i.status === "Pagado" || i.status === "Pago parcial")
      .map(i => {
        const amount = i.status === "Pago parcial" ? (i.amountPaid || 0) : i.amount;
        const { neto, iva } = calcIVA(amount);
        return { ...i, neto, iva, total: amount, month: monthKey(i.datePaid) };
      })
      .sort((a, b) => sortByDate(b.datePaid, a.datePaid));
  }, [state.incomes]);

  // ── Filtered ──
  const comprasFiltered = useMemo(() => {
    if (filterMonth === "ALL") return libroCompras;
    return libroCompras.filter(e => e.month === filterMonth);
  }, [libroCompras, filterMonth]);

  const ventasFiltered = useMemo(() => {
    if (filterMonth === "ALL") return libroVentas;
    return libroVentas.filter(e => e.month === filterMonth);
  }, [libroVentas, filterMonth]);

  const comprasPager = usePagination(comprasFiltered, pageC, 15);
  const ventasPager = usePagination(ventasFiltered, pageV, 15);

  // ── Monthly IVA summary ──
  const resumenIVA = useMemo(() => {
    const allMonths = new Set();
    libroCompras.forEach(e => allMonths.add(e.month));
    libroVentas.forEach(e => allMonths.add(e.month));
    return [...allMonths].sort().reverse().map(month => {
      const compras = libroCompras.filter(e => e.month === month);
      const ventas = libroVentas.filter(e => e.month === month);
      const ivaCredito = compras.reduce((a, b) => a + b.iva, 0);
      const ivaDebito = ventas.reduce((a, b) => a + b.iva, 0);
      return {
        month,
        nFacturas: compras.length,
        nVentas: ventas.length,
        netoCompras: compras.reduce((a, b) => a + b.neto, 0),
        netoVentas: ventas.reduce((a, b) => a + b.neto, 0),
        ivaCredito,
        ivaDebito,
        ivaPagar: ivaDebito - ivaCredito,
      };
    });
  }, [libroCompras, libroVentas]);

  // Available months
  const months = useMemo(() => {
    const keys = new Set();
    libroCompras.forEach(e => keys.add(e.month));
    libroVentas.forEach(e => keys.add(e.month));
    return ["ALL", ...[...keys].filter(Boolean).sort()];
  }, [libroCompras, libroVentas]);

  // Totals
  const totals = useMemo(() => {
    const ivaCredito = comprasFiltered.reduce((a, b) => a + b.iva, 0);
    const ivaDebito = ventasFiltered.reduce((a, b) => a + b.iva, 0);
    return {
      ivaCredito, ivaDebito,
      ivaPagar: ivaDebito - ivaCredito,
      netoCompras: comprasFiltered.reduce((a, b) => a + b.neto, 0),
      netoVentas: ventasFiltered.reduce((a, b) => a + b.neto, 0),
      totalCompras: comprasFiltered.reduce((a, b) => a + b.total, 0),
      totalVentas: ventasFiltered.reduce((a, b) => a + b.total, 0),
    };
  }, [comprasFiltered, ventasFiltered]);

  return (
    <div style={{ marginTop: 12 }}>
      {/* KPIs */}
      <div className="kpis" style={{ marginBottom: 12 }}>
        <div className="kpi kpi--green"><div className="label">IVA Débito (ventas)</div><div className="value">${clp(totals.ivaDebito)}</div></div>
        <div className="kpi kpi--red"><div className="label">IVA Crédito (compras)</div><div className="value">${clp(totals.ivaCredito)}</div></div>
        <div className={`kpi ${totals.ivaPagar >= 0 ? "kpi--orange" : "kpi--green"}`}>
          <div className="label">{totals.ivaPagar >= 0 ? "IVA a pagar" : "Remanente IVA"}</div>
          <div className="value">${clp(Math.abs(totals.ivaPagar))}</div>
        </div>
        <div className="kpi kpi--blue"><div className="label">Tasa IVA</div><div className="value">{IVA_RATE * 100}%</div></div>
      </div>

      {/* Filters */}
      <div className="filterRow">
        <label>Mes
          <select value={filterMonth} onChange={e => { setFilterMonth(e.target.value); setPageC(1); setPageV(1); }}>
            {months.map(m => <option key={m} value={m}>{m === "ALL" ? "Todos los meses" : monthLabel(m)}</option>)}
          </select>
        </label>
        <div className="pillRow" style={{ marginTop: 0 }}>
          {[
            { key: "compras", label: "📥 Libro Compras" },
            { key: "ventas", label: "📤 Libro Ventas" },
            { key: "resumen", label: "📊 Resumen IVA" },
          ].map(v => (
            <button key={v.key} className={`pill ${view === v.key ? "active" : ""}`} onClick={() => setView(v.key)}>{v.label}</button>
          ))}
        </div>
      </div>

      {/* Libro de Compras */}
      {view === "compras" && (
        <Section title="Libro de Compras (Facturas recibidas)">
          <div className="muted" style={{ marginBottom: 8 }}>
            Generado automáticamente desde egresos con tipo de documento "Factura afecta IVA". Para agregar facturas, registra un egreso y asígnale el tipo de documento en Egresos → 📎.
          </div>
          <table>
            <thead><tr><th>N° Doc.</th><th>Fecha</th><th>Proveedor</th><th>Categoría</th><th>Neto</th><th>IVA (19%)</th><th>Total</th></tr></thead>
            <tbody>
              {comprasPager.pageItems.map(e => (
                <tr key={e.id}>
                  <td><b>{e.documentNumber || "—"}</b></td>
                  <td>{e.documentIssuedAt || e.datePaid}</td>
                  <td>{e.providerRut}</td>
                  <td className="small">{e.category}</td>
                  <td>${clp(e.neto)}</td>
                  <td className="amountRed">${clp(e.iva)}</td>
                  <td><b>${clp(e.total)}</b></td>
                </tr>
              ))}
              {comprasPager.total === 0 && (
                <tr><td colSpan={7} className="small">Sin facturas de compra. Registra egresos con tipo "Factura afecta IVA" para poblar este libro.</td></tr>
              )}
            </tbody>
            {comprasPager.total > 0 && (
              <tfoot>
                <tr style={{ fontWeight: 700, borderTop: "2px solid var(--line)" }}>
                  <td colSpan={4}>TOTALES</td>
                  <td>${clp(totals.netoCompras)}</td>
                  <td className="amountRed">${clp(totals.ivaCredito)}</td>
                  <td>${clp(totals.totalCompras)}</td>
                </tr>
              </tfoot>
            )}
          </table>
          <PaginationFooter pager={comprasPager} onPrev={() => setPageC(p => Math.max(1, p - 1))} onNext={() => setPageC(p => p + 1)} />
        </Section>
      )}

      {/* Libro de Ventas */}
      {view === "ventas" && (
        <Section title="Libro de Ventas (Facturas emitidas)">
          <div className="muted" style={{ marginBottom: 8 }}>
            Generado desde ingresos pagados. Se asume IVA incluido en el monto total.
          </div>
          <table>
            <thead><tr><th>Fecha</th><th>Categoría</th><th>Tipo pago</th><th>Neto</th><th>IVA (19%)</th><th>Total</th></tr></thead>
            <tbody>
              {ventasPager.pageItems.map(i => (
                <tr key={i.id}>
                  <td>{i.datePaid}</td>
                  <td>{i.category}</td>
                  <td className="small">{i.typePago}</td>
                  <td>${clp(i.neto)}</td>
                  <td className="amountGreen">${clp(i.iva)}</td>
                  <td><b>${clp(i.total)}</b></td>
                </tr>
              ))}
              {ventasPager.total === 0 && (
                <tr><td colSpan={6} className="small">Sin ventas registradas en este período.</td></tr>
              )}
            </tbody>
            {ventasPager.total > 0 && (
              <tfoot>
                <tr style={{ fontWeight: 700, borderTop: "2px solid var(--line)" }}>
                  <td colSpan={3}>TOTALES</td>
                  <td>${clp(totals.netoVentas)}</td>
                  <td className="amountGreen">${clp(totals.ivaDebito)}</td>
                  <td>${clp(totals.totalVentas)}</td>
                </tr>
              </tfoot>
            )}
          </table>
          <PaginationFooter pager={ventasPager} onPrev={() => setPageV(p => Math.max(1, p - 1))} onNext={() => setPageV(p => p + 1)} />
        </Section>
      )}

      {/* Resumen IVA */}
      {view === "resumen" && (
        <Section title="Resumen IVA mensual">
          <div className="muted" style={{ marginBottom: 8 }}>
            Diferencia entre IVA Débito Fiscal (ventas) e IVA Crédito Fiscal (compras). Si el resultado es positivo, se debe pagar al SII.
          </div>
          <table>
            <thead><tr><th>Mes</th><th>N° Facturas</th><th>N° Ventas</th><th>Neto Compras</th><th>Neto Ventas</th><th>IVA Crédito</th><th>IVA Débito</th><th>IVA neto</th></tr></thead>
            <tbody>
              {resumenIVA.map(r => (
                <tr key={r.month}>
                  <td><b>{monthLabel(r.month)}</b></td>
                  <td>{r.nFacturas}</td>
                  <td>{r.nVentas}</td>
                  <td>${clp(r.netoCompras)}</td>
                  <td>${clp(r.netoVentas)}</td>
                  <td className="amountRed">${clp(r.ivaCredito)}</td>
                  <td className="amountGreen">${clp(r.ivaDebito)}</td>
                  <td style={{ fontWeight: 700, color: r.ivaPagar >= 0 ? "#dc2626" : "#16a34a" }}>
                    {r.ivaPagar >= 0 ? "" : "−"}${clp(Math.abs(r.ivaPagar))}
                    {r.ivaPagar < 0 && <div className="small" style={{ color: "#16a34a" }}>Remanente</div>}
                  </td>
                </tr>
              ))}
              {resumenIVA.length === 0 && (
                <tr><td colSpan={8} className="small">Sin datos. Registra egresos con facturas y/o ingresos para ver el resumen de IVA.</td></tr>
              )}
            </tbody>
          </table>
        </Section>
      )}
    </div>
  );
}
