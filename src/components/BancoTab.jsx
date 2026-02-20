import React, { useState, useMemo, useRef } from "react";
import { Section, PaginationFooter } from "./shared";
import { usePagination } from "../hooks/usePagination";
import { clp, parseMoney, uid, monthKey, monthLabel, sortByDate } from "../utils";

/* ─── CSV Parser for Chilean bank statements ─── */
function parseBankDate(str) {
  if (!str) return "";
  // DD/MM/YYYY or DD-MM-YYYY
  const m1 = str.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (m1) {
    let [, d, m, y] = m1;
    if (y.length === 2) y = "20" + y;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  // YYYY-MM-DD
  const m2 = str.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m2) return str.slice(0, 10);
  return "";
}

function parseBankCSV(csvText) {
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const sep = lines[0].includes(";") ? ";" : ",";
  const rawHeaders = lines[0].split(sep).map(h => h.trim().replace(/"/g, "").toLowerCase());

  const dateIdx = rawHeaders.findIndex(h => /fecha/.test(h));
  const descIdx = rawHeaders.findIndex(h => /descripci[oó]n|detalle|glosa|concepto/.test(h));
  const debitIdx = rawHeaders.findIndex(h => /cargo|d[eé]bito|egreso/.test(h));
  const creditIdx = rawHeaders.findIndex(h => /abono|cr[eé]dito|ingreso|dep[oó]sito/.test(h));
  const amountIdx = rawHeaders.findIndex(h => /^monto$|^amount$|^valor$/.test(h));
  const balanceIdx = rawHeaders.findIndex(h => /saldo|balance/.test(h));
  const docIdx = rawHeaders.findIndex(h => /n[uú]mero|documento|comprobante/.test(h));

  if (dateIdx < 0) return [];

  const transactions = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(sep).map(c => c.trim().replace(/"/g, ""));
    if (cols.length < 2 || !cols[dateIdx]) continue;

    const date = parseBankDate(cols[dateIdx]);
    const description = descIdx >= 0 ? (cols[descIdx] || "") : "";

    let amount = 0;
    let type = "debit";

    if (debitIdx >= 0 && creditIdx >= 0) {
      const debit = parseMoney(cols[debitIdx]);
      const credit = parseMoney(cols[creditIdx]);
      if (credit > 0) { amount = credit; type = "credit"; }
      else if (debit > 0) { amount = debit; type = "debit"; }
      else continue;
    } else if (amountIdx >= 0) {
      const raw = parseMoney(cols[amountIdx]);
      if (raw === 0) continue;
      type = raw >= 0 ? "credit" : "debit";
      amount = Math.abs(raw);
    } else continue;

    const balance = balanceIdx >= 0 ? parseMoney(cols[balanceIdx]) : null;
    const docNumber = docIdx >= 0 ? cols[docIdx] || "" : "";

    if (date && amount > 0) {
      transactions.push({
        id: uid(), date, description, amount, type, balance, docNumber,
        source: "csv",
        reconciledWithId: null,
        reconciledWithType: null,
      });
    }
  }
  return transactions.sort((a, b) => sortByDate(b.date, a.date));
}

/* ─── Auto-reconciliation engine ─── */
function dateDiffDays(d1, d2) {
  if (!d1 || !d2) return 999;
  return Math.abs(Math.round((new Date(d1) - new Date(d2)) / 86400000));
}

function autoReconcile(bankTx, incomes, expenses, tolerance = 2) {
  const suggestions = new Map();
  const usedIncomes = new Set();
  const usedExpenses = new Set();

  // Skip already reconciled
  const pending = bankTx.filter(bt => !bt.reconciledWithId);

  for (const bt of pending) {
    let bestMatch = null;
    let bestScore = 0;

    if (bt.type === "credit") {
      for (const inc of incomes) {
        if (usedIncomes.has(inc.id)) continue;
        if (inc.status !== "Pagado" && inc.status !== "Pago parcial") continue;
        const incAmt = inc.status === "Pago parcial" ? (inc.amountPaid || 0) : inc.amount;
        if (Math.abs(incAmt - bt.amount) >= 1) continue;
        const dd = dateDiffDays(bt.date, inc.datePaid);
        if (dd > tolerance) continue;
        const score = 100 - dd * 10;
        if (score > bestScore) { bestScore = score; bestMatch = { matchId: inc.id, matchType: "income", confidence: score }; }
      }
    } else {
      for (const exp of expenses) {
        if (usedExpenses.has(exp.id)) continue;
        if (exp.method === "Tarjeta Crédito") continue;
        if (Math.abs(exp.amount - bt.amount) >= 1) continue;
        const dd = dateDiffDays(bt.date, exp.datePaid);
        if (dd > tolerance) continue;
        const score = 100 - dd * 10;
        if (score > bestScore) { bestScore = score; bestMatch = { matchId: exp.id, matchType: "expense", confidence: score }; }
      }
    }

    if (bestMatch && bestScore >= 50) {
      suggestions.set(bt.id, bestMatch);
      if (bestMatch.matchType === "income") usedIncomes.add(bestMatch.matchId);
      else usedExpenses.add(bestMatch.matchId);
    }
  }
  return suggestions;
}

/* ─── Main Tab ─── */
export default function BancoTab({
  state, bankTransactions,
  addBankTransactions, updateBankTransaction, delBankTransaction, clearBankTransactions,
}) {
  const [search, setSearch] = useState("");
  const [filterMonth, setFilterMonth] = useState("ALL");
  const [filterStatus, setFilterStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [showImport, setShowImport] = useState(false);
  const [importPreview, setImportPreview] = useState([]);
  const fileRef = useRef(null);

  // Months
  const months = useMemo(() => {
    const keys = new Set();
    bankTransactions.forEach(t => { if (t.date) keys.add(monthKey(t.date)); });
    return ["ALL", ...[...keys].sort()];
  }, [bankTransactions]);

  // Filtered
  const filtered = useMemo(() => {
    let list = [...bankTransactions].sort((a, b) => sortByDate(b.date, a.date));
    if (filterMonth !== "ALL") list = list.filter(t => monthKey(t.date) === filterMonth);
    if (filterStatus === "reconciled") list = list.filter(t => t.reconciledWithId);
    if (filterStatus === "pending") list = list.filter(t => !t.reconciledWithId);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(t => (t.description || "").toLowerCase().includes(q) || String(t.amount).includes(q));
    }
    return list;
  }, [bankTransactions, filterMonth, filterStatus, search]);

  const pager = usePagination(filtered, page, 15);

  // Summary
  const summary = useMemo(() => {
    const txm = filterMonth === "ALL" ? bankTransactions : bankTransactions.filter(t => monthKey(t.date) === filterMonth);
    const totalCredits = txm.filter(t => t.type === "credit").reduce((a, b) => a + b.amount, 0);
    const totalDebits = txm.filter(t => t.type === "debit").reduce((a, b) => a + b.amount, 0);
    const reconciled = txm.filter(t => t.reconciledWithId).length;
    const pending = txm.filter(t => !t.reconciledWithId).length;
    const sorted = [...txm].sort((a, b) => sortByDate(b.date, a.date));
    const lastBalance = sorted.length > 0 ? sorted[0]?.balance : null;
    return { totalCredits, totalDebits, reconciled, pending, total: txm.length, lastBalance };
  }, [bankTransactions, filterMonth]);

  // Auto-reconciliation
  const suggestions = useMemo(
    () => autoReconcile(bankTransactions, state.incomes, state.expenses),
    [bankTransactions, state.incomes, state.expenses],
  );

  function handleFileUpload(ev) {
    const file = ev.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      setImportPreview(parseBankCSV(e.target.result));
      setShowImport(true);
    };
    reader.readAsText(file, "UTF-8");
  }

  function confirmImport() {
    if (importPreview.length > 0) {
      addBankTransactions(importPreview);
      setImportPreview([]);
      setShowImport(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function applyReconciliation(bankTxId) {
    const match = suggestions.get(bankTxId);
    if (match) updateBankTransaction(bankTxId, { reconciledWithId: match.matchId, reconciledWithType: match.matchType });
  }

  function applyAllReconciliations() {
    let applied = 0;
    for (const t of bankTransactions.filter(x => !x.reconciledWithId)) {
      const match = suggestions.get(t.id);
      if (match) { updateBankTransaction(t.id, { reconciledWithId: match.matchId, reconciledWithType: match.matchType }); applied++; }
    }
    alert(`${applied} transacciones conciliadas automáticamente.`);
  }

  function removeReconciliation(id) {
    updateBankTransaction(id, { reconciledWithId: null, reconciledWithType: null });
  }

  function getMatchLabel(bt) {
    if (!bt.reconciledWithId) return null;
    if (bt.reconciledWithType === "income") {
      const inc = state.incomes.find(i => i.id === bt.reconciledWithId);
      return inc ? `Ingreso: ${inc.category} — $${clp(inc.amount)}` : "Ingreso (eliminado)";
    }
    const exp = state.expenses.find(e => e.id === bt.reconciledWithId);
    return exp ? `Egreso: ${exp.category} — ${exp.vendor || ""} — $${clp(exp.amount)}` : "Egreso (eliminado)";
  }

  return (
    <div style={{ marginTop: 12 }}>
      {/* KPIs */}
      <div className="kpis" style={{ marginBottom: 12 }}>
        <div className="kpi kpi--green"><div className="label">Abonos</div><div className="value">${clp(summary.totalCredits)}</div></div>
        <div className="kpi kpi--red"><div className="label">Cargos</div><div className="value">${clp(summary.totalDebits)}</div></div>
        <div className="kpi kpi--blue"><div className="label">Conciliadas</div><div className="value">{summary.reconciled} / {summary.total}</div></div>
        <div className="kpi kpi--orange"><div className="label">Pendientes</div><div className="value">{summary.pending}</div></div>
        {summary.lastBalance !== null && (
          <div className="kpi kpi--purple"><div className="label">Último saldo</div><div className="value">${clp(summary.lastBalance)}</div></div>
        )}
      </div>

      <div className="grid">
        {/* CSV Import */}
        <Section title="Importar cartola bancaria">
          <div className="muted" style={{ marginBottom: 10 }}>
            Sube un archivo CSV de tu banco. Se detectan automáticamente las columnas (Fecha, Descripción, Cargo, Abono, Saldo).
          </div>
          <div className="formGrid">
            <label>Archivo CSV
              <input type="file" accept=".csv,.txt,.tsv" ref={fileRef} onChange={handleFileUpload} />
            </label>
          </div>

          {showImport && importPreview.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
                <span className="badge ok">{importPreview.length} transacciones detectadas</span>
                <div className="row">
                  <button className="primary" onClick={confirmImport}>✓ Importar todas</button>
                  <button onClick={() => { setShowImport(false); setImportPreview([]); }}>Cancelar</button>
                </div>
              </div>
              <div style={{ maxHeight: 200, overflowY: "auto" }}>
                <table>
                  <thead><tr><th>Fecha</th><th>Descripción</th><th>Tipo</th><th>Monto</th><th>Saldo</th></tr></thead>
                  <tbody>
                    {importPreview.slice(0, 20).map(t => (
                      <tr key={t.id}>
                        <td>{t.date}</td>
                        <td className="small">{t.description}</td>
                        <td><span className={`badge ${t.type === "credit" ? "ok" : "bad"}`}>{t.type === "credit" ? "Abono" : "Cargo"}</span></td>
                        <td>${clp(t.amount)}</td>
                        <td>{t.balance !== null ? `$${clp(t.balance)}` : "—"}</td>
                      </tr>
                    ))}
                    {importPreview.length > 20 && <tr><td colSpan={5} className="muted">…y {importPreview.length - 20} más</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Section>

        {/* Fintoc real-time */}
        <Section title="🏦 Conexión bancaria en tiempo real">
          <div className="muted" style={{ marginBottom: 10 }}>
            Conecta tu cuenta bancaria directamente para sincronizar movimientos automáticamente, sin subir cartolas.
          </div>
          <div className="bankInfoBox">
            <div style={{ fontWeight: 700, marginBottom: 6 }}>¿Cómo funciona?</div>
            <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: "#374151" }}>
              <li>Crea una cuenta en <a href="https://fintoc.com" target="_blank" rel="noopener noreferrer">fintoc.com</a></li>
              <li>Obtén tu <b>Public Key</b> y <b>Secret Key</b></li>
              <li>Configura las variables de entorno:
                <div style={{ background: "#f1f5f9", padding: "6px 10px", borderRadius: 8, marginTop: 4, fontFamily: "monospace", fontSize: 12 }}>
                  VITE_FINTOC_PUBLIC_KEY=pk_live_…<br />
                  FINTOC_SECRET_KEY=sk_live_… <span style={{ color: "#6b7280" }}>(en Supabase Edge Function)</span>
                </div>
              </li>
              <li>Agrega el script de Fintoc en <code>index.html</code></li>
              <li>Despliega la Edge Function de Supabase para el proxy seguro</li>
            </ol>
          </div>
          {import.meta.env.VITE_FINTOC_PUBLIC_KEY ? (
            <button className="primary" style={{ marginTop: 10 }} onClick={() => {
              if (window.Fintoc) {
                const widget = window.Fintoc.create({
                  holderType: "business",
                  product: "movements",
                  publicKey: import.meta.env.VITE_FINTOC_PUBLIC_KEY,
                  onSuccess: (link) => {
                    alert(`Banco conectado: ${link.institution?.name || "OK"}. Configura la Edge Function para sincronizar movimientos.`);
                  },
                  onExit: () => {},
                });
                widget.open();
              } else {
                alert("Fintoc widget no cargado. Agrega <script src=\"https://js.fintoc.com/v1/\"></script> a index.html.");
              }
            }}>
              🔗 Conectar banco
            </button>
          ) : (
            <div className="muted" style={{ marginTop: 8, fontStyle: "italic" }}>
              ⚠️ Variable VITE_FINTOC_PUBLIC_KEY no configurada. Usa importación CSV por ahora.
            </div>
          )}
        </Section>

        {/* Conciliación */}
        <Section
          title="Conciliación bancaria"
          right={
            suggestions.size > 0
              ? <button className="primary" onClick={applyAllReconciliations}>✓ Conciliar {suggestions.size} auto</button>
              : null
          }
        >
          <div className="muted" style={{ marginBottom: 10 }}>
            Matching automático por monto y fecha (±2 días) entre transacciones bancarias y tus registros de ingresos/egresos.
          </div>
          <div className="filterRow">
            <label>Mes
              <select value={filterMonth} onChange={e => { setFilterMonth(e.target.value); setPage(1); }}>
                {months.map(m => <option key={m} value={m}>{m === "ALL" ? "Todos" : monthLabel(m)}</option>)}
              </select>
            </label>
            <label>Estado
              <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }}>
                <option value="all">Todas</option>
                <option value="reconciled">Conciliadas</option>
                <option value="pending">Pendientes</option>
              </select>
            </label>
            <label>Buscar
              <input type="text" placeholder="🔍 Descripción o monto…" value={search} onChange={e => setSearch(e.target.value)} className="searchInput" />
            </label>
          </div>

          {summary.total > 0 && (
            <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
              <span className="badge ok">✓ {summary.reconciled} conciliadas</span>
              <span className="badge warn">⏳ {summary.pending} pendientes</span>
              {suggestions.size > 0 && <span className="badge" style={{ background: "#eff6ff", borderColor: "#bfdbfe", color: "#1d4ed8" }}>💡 {suggestions.size} sugerencias</span>}
            </div>
          )}

          <table>
            <thead><tr><th>Fecha</th><th>Descripción</th><th>Tipo</th><th>Monto</th><th>Estado</th><th>Conciliación</th><th></th></tr></thead>
            <tbody>
              {pager.pageItems.map(t => {
                const isRec = !!t.reconciledWithId;
                const hasSug = !isRec && suggestions.has(t.id);
                return (
                  <tr key={t.id} className={isRec ? "reconciledRow" : hasSug ? "suggestionRow" : ""}>
                    <td>{t.date}</td>
                    <td className="small" style={{ maxWidth: 250 }}>{t.description}</td>
                    <td><span className={`badge ${t.type === "credit" ? "ok" : "bad"}`}>{t.type === "credit" ? "Abono" : "Cargo"}</span></td>
                    <td style={{ fontWeight: 700, color: t.type === "credit" ? "#16a34a" : "#dc2626" }}>${clp(t.amount)}</td>
                    <td>
                      {isRec
                        ? <span className="badge ok">✓ Conciliada</span>
                        : hasSug
                          ? <span className="badge" style={{ background: "#eff6ff", borderColor: "#bfdbfe", color: "#1d4ed8" }}>💡 Sugerencia</span>
                          : <span className="badge warn">Pendiente</span>}
                    </td>
                    <td className="small">
                      {isRec ? (
                        <div>
                          <div>{getMatchLabel(t)}</div>
                          <button className="danger" style={{ fontSize: 11, padding: "2px 6px", marginTop: 2 }} onClick={() => removeReconciliation(t.id)}>Deshacer</button>
                        </div>
                      ) : hasSug ? (
                        <div>
                          <div className="muted">{(() => {
                            const m = suggestions.get(t.id);
                            if (m.matchType === "income") { const inc = state.incomes.find(i => i.id === m.matchId); return inc ? `↔ ${inc.category}` : "↔ Ingreso"; }
                            const exp = state.expenses.find(e => e.id === m.matchId); return exp ? `↔ ${exp.category}${exp.vendor ? " — " + exp.vendor : ""}` : "↔ Egreso";
                          })()}</div>
                          <button className="primary" style={{ fontSize: 11, padding: "2px 8px", marginTop: 2 }} onClick={() => applyReconciliation(t.id)}>Aceptar</button>
                        </div>
                      ) : <span className="muted">—</span>}
                    </td>
                    <td><button className="danger" onClick={() => delBankTransaction(t.id)}>×</button></td>
                  </tr>
                );
              })}
              {pager.total === 0 && <tr><td colSpan={7} className="small">Sin transacciones bancarias. Importa una cartola CSV o conecta tu banco.</td></tr>}
            </tbody>
          </table>
          <PaginationFooter pager={pager} onPrev={() => setPage(p => Math.max(1, p - 1))} onNext={() => setPage(p => p + 1)} />
        </Section>

        {/* Clear */}
        {bankTransactions.length > 0 && (
          <Section title="Acciones">
            <button className="danger" onClick={() => { if (confirm(`¿Eliminar las ${bankTransactions.length} transacciones bancarias?`)) clearBankTransactions(); }}>
              🗑 Limpiar todas las transacciones bancarias
            </button>
          </Section>
        )}
      </div>
    </div>
  );
}
