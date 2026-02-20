import React, { useState, useMemo } from "react";
import IncomeForm from "./IncomeForm";
import { Section, PaginationFooter } from "./shared";
import { usePagination } from "../hooks/usePagination";
import { clp, nowISO, parseMoney, accountName, sortByDate } from "../utils";

export default function IngresosTab({
  state, settings, accounts, activeProject, activeAccountId,
  addIncome, updateIncome, delIncome, exportIncomes,
}) {
  // Search & Filter
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    let list = [...state.incomes];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(x =>
        (x.category || '').toLowerCase().includes(q) ||
        (x.typePago || '').toLowerCase().includes(q) ||
        (x.note || '').toLowerCase().includes(q) ||
        String(x.amount || '').includes(q)
      );
    }
    if (dateFrom) list = list.filter(x => (x.datePaid || '') >= dateFrom);
    if (dateTo) list = list.filter(x => (x.datePaid || '') <= dateTo);
    if (filterStatus) list = list.filter(x => x.status === filterStatus);
    return list;
  }, [state.incomes, search, dateFrom, dateTo, filterStatus]);

  React.useEffect(() => { setPage(1); }, [search, dateFrom, dateTo, filterStatus]);

  const pager = usePagination(filtered, page, 12);
  const hasFilters = search || dateFrom || dateTo || filterStatus;

  return (
    <div className="grid" style={{ marginTop: 12 }}>
      <Section title="Registrar ingreso">
        <IncomeForm
          settings={settings}
          accounts={accounts}
          defaultCategory={activeProject?.category}
          defaultAccountId={activeAccountId}
          onAdd={addIncome}
        />
        <div className="muted" style={{ marginTop: 8 }}>
          Puedes cambiar Pendiente ↔ Pagado ↔ Pago parcial en la tabla.
        </div>
      </Section>

      <Section title="Ingresos" right={<button className="ghost" onClick={exportIncomes}>CSV</button>}>
        {/* Search */}
        <div className="searchBar">
          <input
            type="text"
            placeholder="🔍 Buscar por categoría, tipo, nota..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="searchInput"
          />
        </div>
        {/* Filters */}
        <div className="filterRow">
          <label>Desde <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></label>
          <label>Hasta <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></label>
          <label>Estado
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="">Todos</option>
              <option value="Pagado">Pagado</option>
              <option value="Pendiente">Pendiente</option>
              <option value="Pago parcial">Pago parcial</option>
            </select>
          </label>
          {hasFilters && (
            <button className="ghost" onClick={() => { setSearch(""); setDateFrom(""); setDateTo(""); setFilterStatus(""); }}>
              Limpiar filtros
            </button>
          )}
        </div>

        <table>
          <thead>
            <tr><th>Fecha pago</th><th>Cuenta</th><th>Categoría</th><th>Tipo</th><th>Estado</th><th>Monto</th><th>Monto pagado</th><th></th></tr>
          </thead>
          <tbody>
            {pager.pageItems.map(x => (
              <tr key={x.id}>
                <td>
                  <input type="date" value={x.datePaid || ""} disabled={x.status === "Pendiente"} onChange={(e) => updateIncome(x.id, { datePaid: e.target.value })} />
                </td>
                <td>{accountName(accounts, x.accountId)}</td>
                <td>
                  <select value={x.category} onChange={(e) => updateIncome(x.id, { category: e.target.value })}>
                    {settings.incomeCategories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </td>
                <td>{x.typePago}</td>
                <td>
                  <select
                    value={x.status}
                    onChange={(e) => {
                      const next = e.target.value;
                      if (next === "Pendiente") updateIncome(x.id, { status: next, datePaid: "", amountPaid: 0 });
                      else if (next === "Pagado") updateIncome(x.id, { status: next, datePaid: x.datePaid || nowISO(), amountPaid: 0 });
                      else updateIncome(x.id, { status: next, datePaid: x.datePaid || nowISO() });
                    }}
                  >
                    {["Pagado", "Pendiente", "Pago parcial"].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
                <td>${clp(x.amount)}</td>
                <td>
                  <input
                    value={x.amountPaid || 0}
                    disabled={x.status !== "Pago parcial"}
                    onChange={(e) => updateIncome(x.id, { amountPaid: parseMoney(e.target.value) })}
                    style={{ width: 120 }}
                  />
                </td>
                <td><button className="danger" onClick={() => delIncome(x.id)}>×</button></td>
              </tr>
            ))}
            {pager.total === 0 && (
              <tr><td colSpan={8} className="small">{hasFilters ? 'Sin resultados.' : 'Sin ingresos.'}</td></tr>
            )}
          </tbody>
        </table>
        <PaginationFooter
          pager={pager}
          onPrev={() => setPage(p => Math.max(1, p - 1))}
          onNext={() => setPage(p => p + 1)}
        />
      </Section>
    </div>
  );
}
