import React, { useEffect, useMemo, useState } from "react";
import Auth from "./Auth";
import { supabase, WORKSPACE_ID } from "./supabaseClient";
import {
  uid, STORE_KEY, load, save, monthKey, sortByDate, accountName, parseMoney, clp,
} from "./utils";
import { usePagination } from "./hooks/usePagination";
import { Modal } from "./components/shared";
import IncomeForm from "./components/IncomeForm";
import ExpenseForm from "./components/ExpenseForm";
import TransferForm from "./components/TransferForm";
import DocumentModal from "./components/DocumentModal";

// Tabs
import DashboardTab from "./components/DashboardTab";
import IngresosTab from "./components/IngresosTab";
import EgresosTab from "./components/EgresosTab";
import TarjetaCreditoTab from "./components/TarjetaCreditoTab";
import FlujoCajaTab from "./components/FlujoCajaTab";
import ProyectosTab from "./components/ProyectosTab";
import TransferenciasTab from "./components/TransferenciasTab";
import ConfiguracionTab from "./components/ConfiguracionTab";
import RentabilidadTab from "./components/RentabilidadTab";
import ProveedoresTab from "./components/ProveedoresTab";
import BancoTab from "./components/BancoTab";
import LibroIVATab from "./components/LibroIVATab";
import DTEValidationPanel from "./components/DTEValidationPanel";

const PAGE_SIZE = 10;

const DEFAULT_STATE = {
  settings: {
    paymentTypes: ["Anticipo","Hito 1","Hito 2","Hito 3","Hito 4","Adicional","Otro"],
    incomeCategories: ["OBRA: Casa Algarrobo","OBRA: Los Estanques","OBRA: Depto. Nilan","Préstamo","Devolución","Otro"],
    expenseCategoriesOffice: ["Sueldos","Imposiciones","Arriendo","Contabilidad","Bancos","Meta Ads","Arquitectura","F19","Préstamo","Otros"],
    expenseCategoriesProject: ["Materiales","Subcontratos","Servicios","Sueldos Obra","Movilización y colación","Herramientas","Arriendo equipos","Fletes","Permisos","Otros"],
    creditCardCategories: ["Materiales","Servicios","Subcontratos","Suministros","Transporte","Otros"],
    categoryColors: { income: {}, expense: {} },
  },
  accounts: [
    { id: uid(), name: "Corriente" },
    { id: uid(), name: "Efectivo" },
  ],
  projects: [
    { id: uid(), name: "Casa Algarrobo", category: "OBRA: Casa Algarrobo", client: "", contractTotal: 0, paymentPlan: [{ type: "Anticipo", pct: 30 },{ type: "Hito 1", pct: 20 },{ type: "Hito 2", pct: 20 },{ type: "Hito 3", pct: 20 },{ type: "Hito 4", pct: 10 }] },
    { id: uid(), name: "Los Estanques", category: "OBRA: Los Estanques", client: "", contractTotal: 0, paymentPlan: [{ type: "Anticipo", pct: 30 },{ type: "Hito 1", pct: 35 },{ type: "Hito 2", pct: 35 }] },
    { id: uid(), name: "Depto. Nilan", category: "OBRA: Depto. Nilan", client: "", contractTotal: 0, paymentPlan: [{ type: "Anticipo", pct: 30 },{ type: "Hito 1", pct: 70 }] },
  ],
  incomes: [],
  expenses: [],
  ccPurchases: [],
  ccPayments: [],
  transfers: [],
  cashOpeningByMonth: {},
  providers: [],
  purchaseOrders: [],
  quotes: [],
  bankTransactions: [],
};

export default function App() {
  // ── Auth ──
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [cloudReady, setCloudReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setAuthLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => { mounted = false; listener?.subscription?.unsubscribe?.(); };
  }, []);

  // ── State ──
  const [state, setState] = useState(() => load() ?? DEFAULT_STATE);

  useEffect(() => {
    if (!session) { setCloudReady(false); return; }
    (async () => {
      const { data, error } = await supabase.from("app_state").select("state").eq("workspace_id", WORKSPACE_ID).maybeSingle();
      if (error) { console.error("Supabase load error:", error); setCloudReady(true); return; }
      if (data?.state) setState(data.state);
      setCloudReady(true);
    })();
  }, [session]);

  useEffect(() => { save(state); }, [state]);

  useEffect(() => {
    if (!session || !cloudReady) return;
    const t = setTimeout(async () => {
      const { error } = await supabase.from("app_state").upsert({ workspace_id: WORKSPACE_ID, state, updated_at: new Date().toISOString() });
      if (error) console.error("Supabase save error:", error);
    }, 600);
    return () => clearTimeout(t);
  }, [state, session, cloudReady]);

  // ── UI state ──
  const [tab, setTab] = useState("Dashboard");
  const [activeProjectId, setActiveProjectId] = useState(() => state.projects[0]?.id ?? "");
  const [activeAccountId, setActiveAccountId] = useState(() => state.accounts[0]?.id ?? "");
  const [cashViewAccountId, setCashViewAccountId] = useState("CONSOLIDADO");
  const [dashMonth, setDashMonth] = useState(localStorage.getItem("dashMonth") || monthKey(new Date().toISOString()));
  const [dashSort, setDashSort] = useState("DESC");
  const [dashPage, setDashPage] = useState(1);
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickMode, setQuickMode] = useState("Ingreso");
  const [docModalExpenseId, setDocModalExpenseId] = useState(null);
  const [projectExpensePage, setProjectExpensePage] = useState(1);
  const [transferPage, setTransferPage] = useState(1);

  useEffect(() => { localStorage.setItem("dashMonth", dashMonth); }, [dashMonth]);
  useEffect(() => { setDashPage(1); }, [dashMonth, cashViewAccountId]);

  const settings = state.settings;
  const activeProject = state.projects.find(p => p.id === activeProjectId) ?? state.projects[0];
  const docModalExpense = state.expenses.find(e => e.id === docModalExpenseId) || null;

  const sortedExpenses = useMemo(() => state.expenses.slice().sort((a, b) => sortByDate(b.datePaid, a.datePaid)), [state.expenses]);
  const projectExpenses = useMemo(() => sortedExpenses.filter(e => e.scope === "Proyecto" && e.projectCategory === activeProject?.category), [sortedExpenses, activeProject?.category]);
  const projectPager = usePagination(projectExpenses, projectExpensePage, PAGE_SIZE);

  const transfersSorted = useMemo(() => state.transfers.slice().sort((a, b) => sortByDate(b.date, a.date)), [state.transfers]);
  const transferPager = usePagination(transfersSorted, transferPage, PAGE_SIZE);

  const transferStats = useMemo(() => {
    const net = new Map();
    state.transfers.forEach(tr => {
      const amt = Number(tr.amount) || 0;
      net.set(tr.toAccountId, (net.get(tr.toAccountId) || 0) + amt);
      net.set(tr.fromAccountId, (net.get(tr.fromAccountId) || 0) - amt);
    });
    const matchKeyword = (keyword) => {
      const needle = keyword.toLowerCase();
      return state.accounts.filter(acc => (acc.name || "").toLowerCase().includes(needle)).reduce((sum, acc) => sum + (net.get(acc.id) || 0), 0);
    };
    const netArquitectura = matchKeyword("arquitectura");
    const netCorriente = matchKeyword("corriente");
    const balance = netCorriente - netArquitectura;
    const maxAbs = Math.max(1, Math.abs(netArquitectura), Math.abs(netCorriente), Math.abs(balance));
    return { net, netArquitectura, netCorriente, balance, maxAbs };
  }, [state.transfers, state.accounts]);

  useEffect(() => { setProjectExpensePage(1); }, [activeProject?.id]);

  // ── CRUD ──
  function updateSettings(patch) { setState(prev => ({ ...prev, settings: { ...prev.settings, ...patch } })); }

  function addProject() {
    const name = prompt("Nombre del proyecto:");
    if (!name) return;
    const category = prompt('Categoría (ej: "OBRA: Proyecto X"):', `OBRA: ${name}`);
    if (!category) return;
    const p = { id: uid(), name, category, client: "", contractTotal: 0, paymentPlan: [{ type: settings.paymentTypes[0] ?? "Anticipo", pct: 0 }] };
    setState(prev => ({
      ...prev, projects: [...prev.projects, p],
      settings: { ...prev.settings, incomeCategories: prev.settings.incomeCategories.includes(category) ? prev.settings.incomeCategories : [category, ...prev.settings.incomeCategories] },
    }));
    setActiveProjectId(p.id);
    setTab("Proyectos");
  }

  function updateProject(id, patch) { setState(prev => ({ ...prev, projects: prev.projects.map(p => p.id === id ? { ...p, ...patch } : p) })); }

  function delProject(id) {
    const p = state.projects.find(x => x.id === id);
    if (!p || !confirm(`¿Eliminar proyecto "${p.name}"?`)) return;
    setState(prev => {
      const next = prev.projects.filter(x => x.id !== id);
      if (activeProjectId === id) setActiveProjectId(next[0]?.id || "");
      return { ...prev, projects: next };
    });
  }

  function addAccount() {
    const name = prompt("Nombre de la cuenta:");
    if (!name) return;
    setState(prev => ({ ...prev, accounts: [...prev.accounts, { id: uid(), name }] }));
  }

  function addIncome(row) { setState(prev => ({ ...prev, incomes: [{ id: uid(), ...row }, ...prev.incomes] })); }
  function updateIncome(id, patch) { setState(prev => ({ ...prev, incomes: prev.incomes.map(x => x.id === id ? { ...x, ...patch } : x) })); }
  function delIncome(id) { setState(prev => ({ ...prev, incomes: prev.incomes.filter(x => x.id !== id) })); }

  function addExpense(row) {
    setState(prev => {
      const expenseId = uid();
      const newExpense = { id: expenseId, documentType: "sin_respaldo", documentNumber: "", documentIssuedAt: "", documentNotes: "", documentProvider: "", ...row };
      const next = { ...prev, expenses: [newExpense, ...prev.expenses] };
      if (row.method === "Tarjeta Crédito") {
        next.ccPurchases = [{ id: uid(), sourceExpenseId: expenseId, isPaid: false, datePurchase: row.datePaid, vendor: row.vendor || "", amount: row.amount, ccCategory: row.ccCategory || (prev.settings.creditCardCategories?.[0] ?? "Otros"), projectCategory: row.scope === "Proyecto" ? row.projectCategory : "", note: `${row.category}${row.note ? " — " + row.note : ""}` }, ...prev.ccPurchases];
      }
      return next;
    });
  }

  function updateExpense(id, patch) {
    setState(prev => {
      const prevExp = prev.expenses.find(x => x.id === id);
      if (!prevExp) return prev;
      const updated = { ...prevExp, ...patch };
      const nextExpenses = prev.expenses.map(x => x.id === id ? updated : x);
      let next = { ...prev, expenses: nextExpenses };
      if ((prevExp.method || "") !== "Tarjeta Crédito" && (updated.method || "") === "Tarjeta Crédito") {
        next = { ...next, ccPurchases: [{ id: uid(), sourceExpenseId: id, isPaid: false, datePurchase: updated.datePaid, vendor: updated.vendor || "", amount: updated.amount, ccCategory: updated.ccCategory || (prev.settings.creditCardCategories?.[0] ?? "Otros"), projectCategory: updated.scope === "Proyecto" ? updated.projectCategory : "", note: `${updated.category}${updated.note ? " — " + updated.note : ""}` }, ...prev.ccPurchases] };
      }
      if ((prevExp.method || "") === "Tarjeta Crédito" && (updated.method || "") !== "Tarjeta Crédito") {
        next = { ...next, ccPurchases: prev.ccPurchases.filter(c => c.sourceExpenseId !== id) };
      }
      if ((updated.method || "") === "Tarjeta Crédito") {
        next = { ...next, ccPurchases: next.ccPurchases.map(c => c.sourceExpenseId === id ? { ...c, datePurchase: updated.datePaid, vendor: updated.vendor || c.vendor, amount: updated.amount, projectCategory: updated.scope === "Proyecto" ? updated.projectCategory : c.projectCategory, note: `${updated.category}${updated.note ? " — " + updated.note : ""}` } : c) };
      }
      return next;
    });
  }

  function delExpense(id) { setState(prev => ({ ...prev, expenses: prev.expenses.filter(x => x.id !== id), ccPurchases: prev.ccPurchases.filter(c => c.sourceExpenseId !== id) })); }

  function addCCPayment(row) { setState(prev => ({ ...prev, ccPayments: [{ id: uid(), ...row }, ...prev.ccPayments] })); }
  function delCCPayment(id) { setState(prev => ({ ...prev, ccPayments: prev.ccPayments.filter(x => x.id !== id) })); }
  function toggleCCPaid(id, isPaid) { setState(prev => ({ ...prev, ccPurchases: prev.ccPurchases.map(x => x.id === id ? { ...x, isPaid } : x) })); }

  function addTransfer(row) { setState(prev => ({ ...prev, transfers: [{ id: uid(), ...row }, ...prev.transfers] })); }
  function delTransfer(id) { setState(prev => ({ ...prev, transfers: prev.transfers.filter(x => x.id !== id) })); }

  function setOpening(month, value) { setState(prev => ({ ...prev, cashOpeningByMonth: { ...(prev.cashOpeningByMonth || {}), [month]: value } })); }

  // ── Proveedores CRUD ──
  function addProveedor(row) { setState(prev => ({ ...prev, providers: [{ id: uid(), createdAt: new Date().toISOString(), ...row }, ...(prev.providers || [])] })); }
  function updateProveedor(id, patch) { setState(prev => ({ ...prev, providers: (prev.providers || []).map(x => x.id === id ? { ...x, ...patch } : x) })); }
  function delProveedor(id) { if (!confirm("¿Eliminar proveedor?")) return; setState(prev => ({ ...prev, providers: (prev.providers || []).filter(x => x.id !== id) })); }

  // ── Órdenes de compra CRUD ──
  function addOrden(row) { setState(prev => ({ ...prev, purchaseOrders: [{ id: uid(), createdAt: new Date().toISOString(), ...row }, ...(prev.purchaseOrders || [])] })); }
  function updateOrden(id, patch) { setState(prev => ({ ...prev, purchaseOrders: (prev.purchaseOrders || []).map(x => x.id === id ? { ...x, ...patch } : x) })); }
  function delOrden(id) { if (!confirm("¿Eliminar orden de compra?")) return; setState(prev => ({ ...prev, purchaseOrders: (prev.purchaseOrders || []).filter(x => x.id !== id) })); }

  // ── Cotizaciones CRUD ──
  function addCotizacion(row) { setState(prev => ({ ...prev, quotes: [{ id: uid(), createdAt: new Date().toISOString(), ...row }, ...(prev.quotes || [])] })); }
  function delCotizacion(id) { setState(prev => ({ ...prev, quotes: (prev.quotes || []).filter(x => x.id !== id) })); }

  // ── Bank transactions CRUD ──
  function addBankTransactions(rows) { setState(prev => ({ ...prev, bankTransactions: [...rows, ...(prev.bankTransactions || [])] })); }
  function updateBankTransaction(id, patch) { setState(prev => ({ ...prev, bankTransactions: (prev.bankTransactions || []).map(x => x.id === id ? { ...x, ...patch } : x) })); }
  function delBankTransaction(id) { setState(prev => ({ ...prev, bankTransactions: (prev.bankTransactions || []).filter(x => x.id !== id) })); }
  function clearBankTransactions() { setState(prev => ({ ...prev, bankTransactions: [] })); }

  // ── CSV Export ──
  function downloadCSV(filename, rows) {
    const csvEscape = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const header = Object.keys(rows[0] || {});
    const lines = [header.join(","), ...rows.map(r => header.map(h => csvEscape(r[h])).join(","))];
    const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  function exportIncomes() {
    downloadCSV("ingresos.csv", state.incomes.map(x => ({ fecha_pago: x.datePaid || "", cuenta: accountName(state.accounts, x.accountId), categoria: x.category, tipo: x.typePago, estado: x.status, monto: x.amount, monto_pagado: x.amountPaid || 0, nota: x.note || "" })));
  }
  function exportExpenses() {
    downloadCSV("egresos.csv", state.expenses.map(x => ({ fecha: x.datePaid || "", cuenta: accountName(state.accounts, x.accountId), alcance: x.scope, proyecto: x.scope === "Proyecto" ? x.projectCategory : "", categoria: x.category, metodo: x.method, monto: x.amount, proveedor: x.vendor || "", nota: x.note || "" })));
  }
  function exportMovements() {
    downloadCSV("movimientos_caja.csv", dashboardTxMonth.map(t => ({ fecha: t.date, tipo: t.kind, monto: t.amount, cuenta: t.accountId ? accountName(state.accounts, t.accountId) : "", categoria: t.category || "", nota: t.note || "" })));
  }

  // ── Cash transactions ──
  const cashTransactions = useMemo(() => {
    const incomeTx = state.incomes.filter(x => x.status === "Pagado" || x.status === "Pago parcial").map(x => ({ kind: "Ingreso", sourceType: "income", sourceId: x.id, date: x.datePaid, amount: x.status === "Pago parcial" ? (x.amountPaid || 0) : x.amount, category: x.category, type: x.typePago, accountId: x.accountId, note: x.note || "" })).filter(t => t.date);
    const expenseTx = state.expenses.filter(x => x.method !== "Tarjeta Crédito").map(x => ({ kind: "Egreso", sourceType: "expense", sourceId: x.id, date: x.datePaid, amount: x.amount, category: x.category, projectCategory: x.scope === "Proyecto" ? x.projectCategory : "Oficina", accountId: x.accountId, documentType: x.documentType || "", documentNumber: x.documentNumber || "", note: `${x.scope === "Proyecto" ? x.projectCategory + " — " : ""}${x.vendor ? x.vendor + " — " : ""}${x.note || ""}` })).filter(t => t.date);
    const ccPayTx = state.ccPayments.map(p => ({ kind: "Egreso", sourceType: "ccPayment", sourceId: p.id, date: p.datePaid, amount: p.amount, category: "Pago Tarjeta Crédito", projectCategory: "Oficina", accountId: p.accountId, note: `Pago TC — ${p.cardName || "Tarjeta"}` })).filter(t => t.date);
    const transferTx = state.transfers.flatMap(tr => {
      if (!tr.date) return [];
      return [
        { kind: "Egreso", sourceType: "transfer", sourceId: tr.id, date: tr.date, amount: tr.amount, category: "Transferencia", projectCategory: "Oficina", accountId: tr.fromAccountId, note: `A ${accountName(state.accounts, tr.toAccountId)}` },
        { kind: "Ingreso", sourceType: "transfer", sourceId: tr.id, date: tr.date, amount: tr.amount, category: "Transferencia", projectCategory: "Oficina", accountId: tr.toAccountId, note: `Desde ${accountName(state.accounts, tr.fromAccountId)}` },
      ];
    });
    return [...incomeTx, ...expenseTx, ...ccPayTx, ...transferTx];
  }, [state.incomes, state.expenses, state.ccPayments, state.transfers, state.accounts]);

  function filteredCashTx() {
    if (cashViewAccountId === "CONSOLIDADO") return cashTransactions;
    return cashTransactions.filter(t => t.accountId === cashViewAccountId);
  }

  const months = useMemo(() => {
    const keys = new Set();
    filteredCashTx().forEach(t => keys.add(monthKey(t.date)));
    Object.keys(state.cashOpeningByMonth || {}).forEach(k => keys.add(k));
    return [...keys].filter(Boolean).sort();
  }, [cashTransactions, state.cashOpeningByMonth, cashViewAccountId]);

  const cashflow = useMemo(() => {
    const tx = filteredCashTx();
    const byMonth = Object.fromEntries(months.map(m => [m, { incomes: 0, expenses: 0 }]));
    for (const t of tx) { const m = monthKey(t.date); if (!byMonth[m]) byMonth[m] = { incomes: 0, expenses: 0 }; if (t.kind === "Ingreso") byMonth[m].incomes += t.amount; else byMonth[m].expenses += t.amount; }
    const rows = []; let running = 0;
    months.forEach((m, idx) => {
      const opening = idx === 0 ? (state.cashOpeningByMonth?.[m] ?? 0) : running;
      const inc = byMonth[m]?.incomes ?? 0; const exp = byMonth[m]?.expenses ?? 0;
      const net = inc - exp; const closing = opening + net; running = closing;
      rows.push({ month: m, opening, incomes: inc, expenses: exp, net, closing });
    });
    return rows;
  }, [months, cashTransactions, state.cashOpeningByMonth, cashViewAccountId]);

  // ── Dashboard aggregations ──
  const dashboardTx = useMemo(() => filteredCashTx(), [cashTransactions, cashViewAccountId]);
  const dashboardMonths = useMemo(() => ["ALL", ...months], [months]);
  const dashboardTxMonth = useMemo(() => {
    const tx = dashboardTx.slice().sort((a, b) => { const cmp = sortByDate(b.date, a.date); return dashSort === "DESC" ? cmp : -cmp; });
    if (dashMonth === "ALL") return tx;
    return tx.filter(t => monthKey(t.date) === dashMonth);
  }, [dashboardTx, dashMonth, dashSort]);

  const DASH_PAGE_SIZE = 10;
  const dashTotalPages = Math.max(1, Math.ceil(dashboardTxMonth.length / DASH_PAGE_SIZE));
  const dashPageClamped = Math.min(Math.max(dashPage, 1), dashTotalPages);
  const dashStart = (dashPageClamped - 1) * DASH_PAGE_SIZE;
  const dashPageTx = dashboardTxMonth.slice(dashStart, dashStart + DASH_PAGE_SIZE);

  const kpis = useMemo(() => {
    const totalIncome = dashboardTxMonth.filter(t => t.kind === "Ingreso").reduce((a, b) => a + b.amount, 0);
    const totalExpense = dashboardTxMonth.filter(t => t.kind === "Egreso").reduce((a, b) => a + b.amount, 0);
    const net = totalIncome - totalExpense;
    const ccOutstanding = state.ccPurchases.filter(c => !c.isPaid).reduce((a, b) => a + b.amount, 0);
    let cashBalance = 0;
    if (cashflow.length) {
      if (dashMonth === "ALL") cashBalance = cashflow[cashflow.length - 1].closing;
      else { const row = cashflow.find(r => r.month === dashMonth); cashBalance = row ? row.closing : cashflow[cashflow.length - 1].closing; }
    }
    return { totalIncome, totalExpense, net, ccOutstanding, cashBalance };
  }, [dashboardTxMonth, state.ccPurchases, cashflow, dashMonth]);

  const expenseByCategory = useMemo(() => {
    const map = new Map();
    dashboardTxMonth.filter(t => t.kind === "Egreso").forEach(t => { const key = t.category || "Sin categoría"; map.set(key, (map.get(key) || 0) + t.amount); });
    return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [dashboardTxMonth]);

  const incomeByCategory = useMemo(() => {
    const map = new Map();
    dashboardTxMonth.filter(t => t.kind === "Ingreso").forEach(t => { const key = t.category || "Sin categoría"; map.set(key, (map.get(key) || 0) + t.amount); });
    return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [dashboardTxMonth]);

  const cashflowBars = useMemo(() => cashflow.map(r => ({ month: r.month, Ingresos: r.incomes, Egresos: r.expenses })), [cashflow]);

  const projectReceiptsByType = useMemo(() => {
    const result = {};
    for (const p of state.projects) {
      const map = new Map();
      state.incomes.filter(i => i.category === p.category).filter(i => i.status === "Pagado" || i.status === "Pago parcial").forEach(i => {
        const amt = i.status === "Pago parcial" ? (i.amountPaid || 0) : i.amount;
        map.set(i.typePago, (map.get(i.typePago) || 0) + amt);
      });
      result[p.id] = map;
    }
    return result;
  }, [state.incomes, state.projects]);

  const tabs = ["Dashboard", "Ingresos", "Egresos", "Tarjeta Crédito", "Flujo de Caja", "Banco", "Proyectos", "Rentabilidad", "Proveedores", "Libro IVA", "Validación DTE", "Transferencias", "Configuración"];

  // ── Auth gate ──
  if (authLoading) return <div className="container"><div className="card">Cargando sesión…</div></div>;
  if (!session) return <div className="container"><Auth /></div>;
  if (!cloudReady) return <div className="container"><div className="card">Cargando datos…</div></div>;

  return (
    <div className="container">
      <div className="topbar">
        <div className="brand">Finanzas Proyectos</div>
        <div className="row">
          <label className="small">Cuenta activa</label>
          <select value={activeAccountId} onChange={(e) => setActiveAccountId(e.target.value)}>
            {state.accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <button className="primary" onClick={addAccount}>+ Cuenta</button>
          <label className="small">Proyecto activo</label>
          <select value={activeProjectId} onChange={(e) => setActiveProjectId(e.target.value)}>
            {state.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button className="primary" onClick={addProject}>+ Proyecto</button>
          <button className="ghost" onClick={async () => { await supabase.auth.signOut(); localStorage.removeItem(STORE_KEY); window.location.reload(); }}>Cerrar sesión</button>
          <div className="small" style={{ opacity: 0.7 }}>{session?.user?.email}</div>
        </div>
      </div>

      <div className="tabs">
        {tabs.map(t => (
          <button key={t} className={"tab " + (tab === t ? "active" : "")} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {/* Quick modal */}
      <Modal open={quickOpen} title="Registrar movimiento" onClose={() => setQuickOpen(false)}>
        <div className="pillRow">
          {["Ingreso", "Gasto", "Transferencia"].map(m => (
            <button key={m} className={"pill " + (quickMode === m ? "active" : "")} onClick={() => setQuickMode(m)}>{m}</button>
          ))}
        </div>
        <div className="hr"></div>
        {quickMode === "Ingreso" && <IncomeForm settings={settings} accounts={state.accounts} defaultCategory={activeProject?.category} defaultAccountId={activeAccountId} onAdd={(row) => { addIncome(row); setQuickOpen(false); setTab("Ingresos"); }} />}
        {quickMode === "Gasto" && <ExpenseForm settings={settings} accounts={state.accounts} defaultAccountId={activeAccountId} activeProject={activeProject} providerNames={(state.providers || []).map(p => p.name)} expenses={state.expenses} onAdd={(row) => { addExpense(row); setQuickOpen(false); setTab("Egresos"); }} />}
        {quickMode === "Transferencia" && <TransferForm accounts={state.accounts} defaultFrom={activeAccountId} onAdd={(row) => { addTransfer(row); setQuickOpen(false); setTab("Dashboard"); }} />}
      </Modal>

      {tab === "Dashboard" && <DashboardTab state={state} settings={settings} kpis={kpis} cashViewAccountId={cashViewAccountId} setCashViewAccountId={setCashViewAccountId} dashMonth={dashMonth} setDashMonth={setDashMonth} dashboardMonths={dashboardMonths} dashSort={dashSort} setDashSort={setDashSort} dashPageClamped={dashPageClamped} dashTotalPages={dashTotalPages} setDashPage={setDashPage} dashPageTx={dashPageTx} dashboardTxMonth={dashboardTxMonth} expenseByCategory={expenseByCategory} incomeByCategory={incomeByCategory} activeProject={activeProject} updateIncome={updateIncome} updateExpense={updateExpense} exportMovements={exportMovements} delProject={delProject} setQuickMode={setQuickMode} setQuickOpen={setQuickOpen} cashflow={cashflow} cashTransactions={cashTransactions} />}

      {tab === "Ingresos" && <IngresosTab state={state} settings={settings} accounts={state.accounts} activeProject={activeProject} activeAccountId={activeAccountId} addIncome={addIncome} updateIncome={updateIncome} delIncome={delIncome} exportIncomes={exportIncomes} />}

      {tab === "Egresos" && <EgresosTab state={state} settings={settings} accounts={state.accounts} activeProject={activeProject} activeAccountId={activeAccountId} addExpense={addExpense} updateExpense={updateExpense} delExpense={delExpense} exportExpenses={exportExpenses} setDocModalExpenseId={setDocModalExpenseId} providerNames={(state.providers || []).map(p => p.name)} />}

      {tab === "Tarjeta Crédito" && <TarjetaCreditoTab state={state} accounts={state.accounts} activeAccountId={activeAccountId} addCCPayment={addCCPayment} delCCPayment={delCCPayment} toggleCCPaid={toggleCCPaid} />}

      {tab === "Flujo de Caja" && <FlujoCajaTab state={state} cashViewAccountId={cashViewAccountId} setCashViewAccountId={setCashViewAccountId} cashflow={cashflow} cashflowBars={cashflowBars} setOpening={setOpening} />}

      {tab === "Banco" && <BancoTab state={state} bankTransactions={state.bankTransactions || []} addBankTransactions={addBankTransactions} updateBankTransaction={updateBankTransaction} delBankTransaction={delBankTransaction} clearBankTransactions={clearBankTransactions} />}

      {tab === "Proyectos" && <ProyectosTab state={state} settings={settings} activeProject={activeProject} cashTransactions={cashTransactions} projectReceiptsByType={projectReceiptsByType} updateProject={updateProject} delProject={delProject} delExpense={delExpense} projectPager={projectPager} projectExpensePage={projectExpensePage} setProjectExpensePage={setProjectExpensePage} />}

      {tab === "Rentabilidad" && <RentabilidadTab state={state} cashTransactions={cashTransactions} />}

      {tab === "Proveedores" && <ProveedoresTab state={state} proveedores={state.providers || []} addProveedor={addProveedor} updateProveedor={updateProveedor} delProveedor={delProveedor} ordenes={state.purchaseOrders || []} addOrden={addOrden} updateOrden={updateOrden} delOrden={delOrden} cotizaciones={state.quotes || []} addCotizacion={addCotizacion} delCotizacion={delCotizacion} cashTransactions={cashTransactions} />}

      {tab === "Libro IVA" && <LibroIVATab state={state} />}

      {tab === "Validación DTE" && <DTEValidationPanel state={state} updateExpense={updateExpense} />}

      {tab === "Transferencias" && <TransferenciasTab state={state} accounts={state.accounts} transferStats={transferStats} transferPager={transferPager} transferPage={transferPage} setTransferPage={setTransferPage} delTransfer={delTransfer} />}

      {tab === "Configuración" && <ConfiguracionTab settings={settings} updateSettings={updateSettings} />}

      <DocumentModal
        open={!!docModalExpenseId}
        expense={docModalExpense}
        onClose={() => setDocModalExpenseId(null)}
        onSave={(payload) => { if (docModalExpenseId) { updateExpense(docModalExpenseId, payload); setDocModalExpenseId(null); } }}
        onRemove={() => { if (docModalExpenseId) { updateExpense(docModalExpenseId, { documentType: "sin_respaldo", documentNumber: "", documentIssuedAt: "", documentNotes: "", documentProvider: docModalExpense?.vendor || "" }); setDocModalExpenseId(null); } }}
      />
    </div>
  );
}
