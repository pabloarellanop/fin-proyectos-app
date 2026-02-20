import React, { useState, useMemo } from "react";
import ExpenseForm from "./ExpenseForm";
import ExpenseEditModal from "./ExpenseEditModal";
import OCRScanner from "./OCRScanner";
import { Section, PaginationFooter } from "./shared";
import { usePagination } from "../hooks/usePagination";
import { clp, documentTypeLabel, contrastColor, accountName, sortByDate } from "../utils";
import { validateExpenseDocument, validationBadge } from "../dteValidator";

export default function EgresosTab({
  state, settings, accounts, activeProject, activeAccountId,
  addExpense, updateExpense, delExpense, exportExpenses,
  setDocModalExpenseId, providerNames,
}) {
  const [editExpenseId, setEditExpenseId] = useState(null);
  const editExpense = state.expenses.find(e => e.id === editExpenseId) || null;
  const [ocrOpen, setOcrOpen] = useState(false);
  const [ocrPrefill, setOcrPrefill] = useState(null);

  // Search & Filter
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [filterScope, setFilterScope] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [page, setPage] = useState(1);

  const allCategories = useMemo(() => {
    const cats = new Set();
    state.expenses.forEach(e => { if (e.category) cats.add(e.category); });
    return [...cats].sort();
  }, [state.expenses]);

  const filtered = useMemo(() => {
    let list = state.expenses.slice().sort((a, b) => sortByDate(b.datePaid, a.datePaid));
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(e =>
        (e.category || '').toLowerCase().includes(q) ||
        (e.vendor || '').toLowerCase().includes(q) ||
        (e.note || '').toLowerCase().includes(q) ||
        (e.projectCategory || '').toLowerCase().includes(q) ||
        String(e.amount || '').includes(q)
      );
    }
    if (dateFrom) list = list.filter(e => (e.datePaid || '') >= dateFrom);
    if (dateTo) list = list.filter(e => (e.datePaid || '') <= dateTo);
    if (filterScope) list = list.filter(e => e.scope === filterScope);
    if (filterCategory) list = list.filter(e => e.category === filterCategory);
    return list;
  }, [state.expenses, search, dateFrom, dateTo, filterScope, filterCategory]);

  React.useEffect(() => { setPage(1); }, [search, dateFrom, dateTo, filterScope, filterCategory]);

  const pager = usePagination(filtered, page, 10);
  const hasFilters = search || dateFrom || dateTo || filterScope || filterCategory;

  return (
    <div className="grid" style={{ marginTop: 12 }}>
      <Section title="Registrar egreso" right={<button className="primary" onClick={() => setOcrOpen(true)}>📷 Escanear doc</button>}>
        <ExpenseForm
          settings={settings}
          accounts={accounts}
          defaultAccountId={activeAccountId}
          activeProject={activeProject}
          onAdd={(row) => {
            // Merge OCR document data if available
            if (ocrPrefill) {
              row.documentType = ocrPrefill.documentType || row.documentType;
              row.documentNumber = ocrPrefill.documentNumber || row.documentNumber;
              row.documentProvider = ocrPrefill.rut || row.documentProvider;
              setOcrPrefill(null);
            }
            addExpense(row);
          }}
          providerNames={providerNames}
          expenses={state.expenses}
          ocrPrefill={ocrPrefill}
        />
        <div className="muted" style={{ marginTop: 8 }}>
          Si método = Tarjeta Crédito, se crea una compra TC.
        </div>
      </Section>

      <OCRScanner
        open={ocrOpen}
        onClose={() => setOcrOpen(false)}
        onResult={(data) => setOcrPrefill(data)}
      />

      <Section title="Egresos" right={<button className="ghost" onClick={exportExpenses}>CSV</button>}>
        {/* Search */}
        <div className="searchBar">
          <input
            type="text"
            placeholder="🔍 Buscar por categoría, proveedor, nota..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="searchInput"
          />
        </div>
        {/* Filters */}
        <div className="filterRow">
          <label>Desde <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></label>
          <label>Hasta <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></label>
          <label>Alcance
            <select value={filterScope} onChange={(e) => setFilterScope(e.target.value)}>
              <option value="">Todos</option>
              <option value="Oficina">Oficina</option>
              <option value="Proyecto">Proyecto</option>
            </select>
          </label>
          <label>Categoría
            <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
              <option value="">Todas</option>
              {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          {hasFilters && (
            <button className="ghost" onClick={() => { setSearch(""); setDateFrom(""); setDateTo(""); setFilterScope(""); setFilterCategory(""); }}>
              Limpiar filtros
            </button>
          )}
        </div>

        <table>
          <thead>
            <tr><th>Fecha</th><th>Cuenta</th><th>Alcance</th><th>Centro</th><th>Categoría</th><th>Método</th><th>Doc</th><th>Monto</th><th></th></tr>
          </thead>
          <tbody>
            {pager.pageItems.map(x => {
              const docType = x.documentType || "sin_respaldo";
              const docLabel = documentTypeLabel(docType);
              const hasDocument = (docType && docType !== "sin_respaldo") || x.documentNumber || x.documentIssuedAt || x.documentNotes;
              const docValidation = hasDocument ? validateExpenseDocument(x) : null;
              const docBadge = docValidation ? validationBadge(docValidation.valid ? (docValidation.warnings.length ? "warning" : "ok") : "error") : null;

              return (
                <tr key={x.id} onClick={() => setEditExpenseId(x.id)} style={{ cursor: "pointer" }}>
                  <td>{x.datePaid}</td>
                  <td>{accountName(accounts, x.accountId)}</td>
                  <td>{x.scope}</td>
                  <td>{x.scope === "Proyecto" ? x.projectCategory : "Oficina"}</td>
                  <td>
                    {(() => {
                      const colors = state.settings.categoryColors?.expense?.[x.category];
                      const color = Array.isArray(colors) ? colors[0] : colors;
                      if (!color) return <span>{x.category}</span>;
                      return <span style={{ display: "inline-block", padding: "4px 8px", borderRadius: 6, background: color, color: contrastColor(color), fontWeight: 600 }}>{x.category}</span>;
                    })()}
                  </td>
                  <td>{x.method}</td>
                  <td>
                    <div className="small">
                      <div><b>{docLabel}</b></div>
                      {!hasDocument && <div className="muted">Sin respaldo</div>}
                      {docBadge && <span className={"badge " + docBadge.cls} style={{ fontSize: 10, marginTop: 2, padding: '1px 6px' }}>{docBadge.icon}</span>}
                      {x.siiStatus && <span className={"badge " + (x.siiStatus === 'DOK' ? 'ok' : x.siiStatus === 'DNK' ? 'warn' : 'bad')} style={{ fontSize: 10, marginTop: 2, padding: '1px 6px', marginLeft: 3 }}>SII:{x.siiStatus}</span>}
                    </div>
                    <button className="ghost" type="button" onClick={(e) => { e.stopPropagation(); setDocModalExpenseId(x.id); }}>
                      {hasDocument ? "Editar" : "+ Doc"}
                    </button>
                  </td>
                  <td>${clp(x.amount)}</td>
                  <td>
                    <button className="danger" onClick={(e) => { e.stopPropagation(); delExpense(x.id); }}>×</button>
                  </td>
                </tr>
              );
            })}
            {pager.total === 0 && (
              <tr><td colSpan={9} className="small">{hasFilters ? 'Sin resultados para los filtros.' : 'Sin egresos.'}</td></tr>
            )}
          </tbody>
        </table>
        <PaginationFooter
          pager={pager}
          onPrev={() => setPage(p => Math.max(1, p - 1))}
          onNext={() => setPage(p => p + 1)}
        />
      </Section>

      <ExpenseEditModal
        open={!!editExpenseId}
        expense={editExpense}
        settings={settings}
        accounts={accounts}
        onClose={() => setEditExpenseId(null)}
        onSave={(id, patch) => updateExpense(id, patch)}
        onDelete={(id) => delExpense(id)}
      />
    </div>
  );
}
