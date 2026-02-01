import React, { useEffect, useMemo, useState } from "react";
import {
  PieChart, Pie, Cell, Tooltip as RTooltip, Legend,
  BarChart, Bar, CartesianGrid, XAxis, YAxis, ResponsiveContainer
} from "recharts";
import { supabase, WORKSPACE_ID } from "./supabaseClient";

const STORE_KEY = "fin-app-state";

function uid() {
  return Math.random().toString(36).substr(2, 9);
}

const COLOR_PALETTE = [
  "#06b6d4",
  "#0ea5e9",
  "#2563eb",
  "#1e40af",
  "#7c3aed",
  "#8b5cf6",
  "#9333ea",
  "#a855f7",
  "#db2777",
  "#f472b6",
  "#e11d48",
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#facc15",
  "#84cc16",
  "#10b981",
  "#14b8a6",
];
function nowISO(){ return new Date().toISOString().slice(0,10); }
function parseMoney(x){
  const n = Number(String(x ?? "").replace(/[^\d.-]/g,""));
  return Number.isFinite(n) ? n : 0;
}
function monthLabel(yyyyMM){
  if (!yyyyMM || yyyyMM === "ALL") return "Todos";
  const [y, m] = yyyyMM.split("-").map(Number);
  const names = [
    "Enero","Febrero","Marzo","Abril","Mayo","Junio",
    "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"
  ];
  return `${names[(m||1)-1]} ${y}`;
}
function clp(n){
  const v = Number.isFinite(n) ? n : 0;
  return v.toLocaleString("es-CL");
}
function monthKey(dateISO){ return (dateISO || "").slice(0,7); }
function sortByDate(a,b){ return String(a||"").localeCompare(String(b||"")); }

function load(){
  try{ return JSON.parse(localStorage.getItem(STORE_KEY)) ?? null; } catch { return null; }
}
function save(state){
  try{ localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
}

const DOCUMENT_TYPES = [
  { value: "sin_respaldo", label: "Sin respaldo" },
  { value: "boleta", label: "Boleta" },
  { value: "boleta_honorarios", label: "Boleta de honorarios" },
  { value: "factura_afecta", label: "Factura afecta IVA" },
  { value: "factura_exenta", label: "Factura exenta" },
  { value: "nota_credito", label: "Nota de crédito" },
];

const PAGE_SIZE = 10;

function documentTypeLabel(type){
  const found = DOCUMENT_TYPES.find(opt=>opt.value===type);
  return found ? found.label : "Sin respaldo";
}

function contrastColor(hex){
  if (!hex || typeof hex !== 'string') return '#000';
  const c = hex.replace('#','');
  const r = parseInt(c.length===3 ? c[0]+c[0] : c.slice(0,2), 16);
  const g = parseInt(c.length===3 ? c[1]+c[1] : c.slice(2,4), 16);
  const b = parseInt(c.length===3 ? c[2]+c[2] : c.slice(4,6), 16);
  const yiq = (r*299 + g*587 + b*114) / 1000;
  return yiq >= 128 ? '#000' : '#fff';
}

function Section({title, right, children}){
  return (
    <div className="card">
      <div className="topbar" style={{ marginBottom: 6 }}>
        <div className="h2">{title}</div>
        <div>{right}</div>
      </div>
      {children}
    </div>
  );
}

function Modal({open, title, onClose, children}){
  if (!open) return null;
  return (
    <div className="modalOverlay" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e)=>e.stopPropagation()}>
        <div className="modalHeader">
          <div className="modalTitle">{title}</div>
          <button onClick={onClose}>Cerrar</button>
        </div>
        <div style={{ marginTop: 10 }}>
          {children}
        </div>
      </div>
    </div>
  );
}


function ColorPicker({ value, onChange }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {COLOR_PALETTE.map((color) => (
        <div
          key={color}
          onClick={() => onChange(color)}
          style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            background: color,
            cursor: "pointer",
            border: value === color ? "3px solid #000" : "1px solid #e5e7eb",
          }}
          title={color}
        />
      ))}
    </div>
  );
}

// Single-color picker uses the existing `ColorPicker` component.


// Paleta automática (no fijamos colores explícitos para cumplir tu preferencia visual neutra)
function autoCells(n){
  // produce grises/azules suaves alternados sin especificar “colores” rígidos por categoría
  // (Recharts requiere fill; usamos una secuencia mínima de tonos neutros)
  const fills = ["#1f2a44","#334155","#475569","#64748b","#0f172a","#6b7280","#111827","#94a3b8"];
  return Array.from({length:n}, (_,i)=>fills[i % fills.length]);
}

const DEFAULT_STATE = {
  settings: {
    paymentTypes: ["Anticipo","Hito 1","Hito 2","Hito 3","Hito 4","Adicional","Otro"],
    incomeCategories: ["OBRA: Casa Algarrobo","OBRA: Los Estanques","OBRA: Depto. Nilan","Préstamo","Devolución","Otro"],
    expenseCategoriesOffice: ["Sueldos","Imposiciones","Arriendo","Contabilidad","Bancos","Meta Ads","Arquitectura","F19","Préstamo","Otros"],
    expenseCategoriesProject: ["Materiales","Subcontratos","Servicios","Sueldos Obra","Movilización y colación","Herramientas","Arriendo equipos","Fletes","Permisos","Otros"],
    creditCardCategories: ["Materiales","Servicios","Subcontratos","Suministros","Transporte","Otros"],
    categoryColors: {
  income: {},
  expense: {},
},
  },

  accounts: [
    { id: uid(), name: "Corriente" },
    { id: uid(), name: "Efectivo" },
  ],

  projects: [
    {
      id: uid(),
      name:"Casa Algarrobo",
      category:"OBRA: Casa Algarrobo",
      client:"",
      contractTotal:0,
      // plan de pagos por tipo: porcentaje contractual
      paymentPlan: [
        { type:"Anticipo", pct:30 },
        { type:"Hito 1", pct:20 },
        { type:"Hito 2", pct:20 },
        { type:"Hito 3", pct:20 },
        { type:"Hito 4", pct:10 },
      ]
    },
    {
      id: uid(),
      name:"Los Estanques",
      category:"OBRA: Los Estanques",
      client:"",
      contractTotal:0,
      paymentPlan: [
        { type:"Anticipo", pct:30 },
        { type:"Hito 1", pct:35 },
        { type:"Hito 2", pct:35 },
      ]
    },
    {
      id: uid(),
      name:"Depto. Nilan",
      category:"OBRA: Depto. Nilan",
      client:"",
      contractTotal:0,
      paymentPlan: [
        { type:"Anticipo", pct:30 },
        { type:"Hito 1", pct:70 },
      ]
    },
  ],

  // Ingresos (oficina)
  incomes: [],
  // Egresos
  expenses: [],
  // Compras TC (no caja)
  ccPurchases: [],
  // Pagos TC (sí caja)
  ccPayments: [],
  // Transferencias entre cuentas (sí caja, pero neto consolidado 0)
  transfers: [],

  cashOpeningByMonth: {}, // { "2026-01": 5731319 }
};

export default function App(){
  // --- Auth (Supabase) ---
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

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => {
      mounted = false;
      listener?.subscription?.unsubscribe?.();
    };
  }, []);

  // --- Local fallback state (localStorage) ---
  const [state, setState] = useState(() => load() ?? DEFAULT_STATE);

  // --- Cloud state (Supabase) ---
  // Load the latest saved state for this workspace after login.
  useEffect(() => {
    if (!session) {
      setCloudReady(false);
      return;
    }

    (async () => {
      const { data, error } = await supabase
        .from("app_state")
        .select("state")
        .eq("workspace_id", WORKSPACE_ID)
        .maybeSingle();

      if (error) {
        console.error("Supabase load app_state error:", error);
        setCloudReady(true);
        return;
      }

      if (data?.state) {
        setState(data.state);
      }
      setCloudReady(true);
    })();
  }, [session]);

  // Always keep a local copy (offline fallback).
  useEffect(() => {
    save(state);
  }, [state]);

  // Save to Supabase (debounced) when logged in.
  useEffect(() => {
    if (!session || !cloudReady) return;

    const t = setTimeout(async () => {
      const payload = {
        workspace_id: WORKSPACE_ID,
        state,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase.from("app_state").upsert(payload);
      if (error) console.error("Supabase save app_state error:", error);
    }, 600);

    return () => clearTimeout(t);
  }, [state, session, cloudReady]);


  const [tab, setTab] = useState("Dashboard");

  const [activeProjectId, setActiveProjectId] = useState(() => state.projects[0]?.id ?? "");
  const [activeAccountId, setActiveAccountId] = useState(() => state.accounts[0]?.id ?? "");
  const [cashViewAccountId, setCashViewAccountId] = useState("CONSOLIDADO");

  // Dashboard: filtro de mes para “Últimos movimientos”
  const [dashMonth, setDashMonth] = useState(
  localStorage.getItem("dashMonth") || monthKey(new Date().toISOString())
);

  // Dashboard: paginación y orden de “Últimos movimientos”
  const [dashSort, setDashSort] = useState("DESC"); // DESC = más reciente primero
  const [dashPage, setDashPage] = useState(1);

  // Modal “Registrar…”
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickMode, setQuickMode] = useState("Ingreso"); // Ingreso | Gasto | Transferencia
  const [docModalExpenseId, setDocModalExpenseId] = useState(null);
  const [recentExpensePage, setRecentExpensePage] = useState(1);
  const [projectExpensePage, setProjectExpensePage] = useState(1);
  const [transferPage, setTransferPage] = useState(1);


  useEffect(()=>{
    localStorage.setItem("dashMonth", dashMonth);
  }, [dashMonth]);

  useEffect(()=>{ setDashPage(1); }, [dashMonth, cashViewAccountId]);

  const settings = state.settings;
  const activeProject = state.projects.find(p=>p.id===activeProjectId) ?? state.projects[0];
  const activeAccount = state.accounts.find(a=>a.id===activeAccountId) ?? state.accounts[0];
  const docModalExpense = state.expenses.find(e=>e.id===docModalExpenseId) || null;
  const sortedExpenses = useMemo(()=>
    state.expenses.slice().sort((a,b)=>sortByDate(b.datePaid, a.datePaid)),
    [state.expenses]
  );
  const projectExpenses = useMemo(()=>
    sortedExpenses.filter(e=>e.scope==="Proyecto" && e.projectCategory===activeProject?.category),
    [sortedExpenses, activeProject?.category]
  );
  const recentPager = usePagination(sortedExpenses, recentExpensePage, PAGE_SIZE);
  const projectPager = usePagination(projectExpenses, projectExpensePage, PAGE_SIZE);
  const transfersSorted = useMemo(()=>
    state.transfers.slice().sort((a,b)=>sortByDate(b.date, a.date)),
    [state.transfers]
  );
  const transferPager = usePagination(transfersSorted, transferPage, PAGE_SIZE);
  const transferStats = useMemo(()=>{
    const net = new Map();
    state.transfers.forEach(tr=>{
      const amt = Number(tr.amount)||0;
      net.set(tr.toAccountId, (net.get(tr.toAccountId)||0) + amt);
      net.set(tr.fromAccountId, (net.get(tr.fromAccountId)||0) - amt);
    });
    const matchKeyword = (keyword)=>{
      const needle = keyword.toLowerCase();
      return state.accounts
        .filter(acc=> (acc.name || "").toLowerCase().includes(needle))
        .reduce((sum, acc)=> sum + (net.get(acc.id)||0), 0);
    };
    const netArquitectura = matchKeyword("arquitectura");
    const netCorriente = matchKeyword("corriente");
    const balance = netCorriente - netArquitectura;
    const maxAbs = Math.max(1, Math.abs(netArquitectura), Math.abs(netCorriente), Math.abs(balance));
    return { net, netArquitectura, netCorriente, balance, maxAbs };
  }, [state.transfers, state.accounts]);

  useEffect(()=>{ setProjectExpensePage(1); }, [activeProject?.id]);

  // =========================
  // CRUD Helpers
  // =========================
  function updateSettings(patch){
    setState(prev=>({ ...prev, settings: { ...prev.settings, ...patch } }));
  }
  function addProject(){
    const name = prompt("Nombre del proyecto:");
    if (!name) return;
    const category = prompt('Categoría (debe ser única, ej: "OBRA: Proyecto X"):', `OBRA: ${name}`);
    if (!category) return;

    const p = {
      id: uid(),
      name,
      category,
      client:"",
      contractTotal:0,
      paymentPlan: [{ type: settings.paymentTypes[0] ?? "Anticipo", pct: 0 }]
    };
    setState(prev=>({
      ...prev,
      projects: [...prev.projects, p],
      settings: {
        ...prev.settings,
        incomeCategories: prev.settings.incomeCategories.includes(category)
          ? prev.settings.incomeCategories
          : [category, ...prev.settings.incomeCategories]
      }
    }));
    setActiveProjectId(p.id);
    setTab("Proyectos");
  }
  function updateProject(projectId, patch){
    setState(prev=>({
      ...prev,
      projects: prev.projects.map(p=>p.id===projectId ? { ...p, ...patch } : p)
    }));
  }

  function delProject(projectId){
    const p = state.projects.find(x=>x.id===projectId);
    if (!p) return;
    const ok = confirm(`¿Eliminar proyecto "${p.name}"? (No borra ingresos/egresos ya registrados, solo el proyecto en la lista)`);
    if (!ok) return;
    setState(prev=>{
      const nextProjects = prev.projects.filter(x=>x.id!==projectId);
      // Ajustar proyecto activo si corresponde
      if (activeProjectId === projectId){
        setActiveProjectId(nextProjects[0]?.id || "");
      }
      return { ...prev, projects: nextProjects };
    });
  }

  function addAccount(){
    const name = prompt("Nombre de la cuenta (ej: Corriente 2, Ahorro, Caja Chica):");
    if (!name) return;
    setState(prev=>({ ...prev, accounts: [...prev.accounts, { id: uid(), name }] }));
  }

  function addIncome(row){
    setState(prev=>({ ...prev, incomes: [{ id: uid(), ...row }, ...prev.incomes] }));
  }
  function updateIncome(id, patch){
    setState(prev=>({ ...prev, incomes: prev.incomes.map(x=>x.id===id ? { ...x, ...patch } : x) }));
  }
  function delIncome(id){
    setState(prev=>({ ...prev, incomes: prev.incomes.filter(x=>x.id!==id) }));
  }

  function addExpense(row){
    // Si es TC: además crea ccPurchase con categoría TC (y permite montos negativos)
    setState(prev=>{
      const expenseId = uid();
      const newExpense = {
        id: expenseId,
        documentType: "sin_respaldo",
        documentNumber: "",
        documentIssuedAt: "",
        documentNotes: "",
        documentProvider: "",
        ...row
      };
      const next = { ...prev, expenses: [newExpense, ...prev.expenses] };
      if (row.method === "Tarjeta Crédito"){
        next.ccPurchases = [{
          id: uid(),
          sourceExpenseId: expenseId,
          isPaid:false,
          datePurchase: row.datePaid,
          vendor: row.vendor || "",
          amount: row.amount, // puede ser negativo (devolución)
          ccCategory: row.ccCategory || (prev.settings.creditCardCategories?.[0] ?? "Otros"),
          projectCategory: row.scope==="Proyecto" ? row.projectCategory : "",
          note: `${row.category}${row.note ? " — " + row.note : ""}`
        }, ...prev.ccPurchases];
      }
      return next;
    });
  }
  function updateExpense(id, patch){
    setState(prev=>{
      const prevExp = prev.expenses.find(x=>x.id===id);
      if (!prevExp) return prev;
      const updated = { ...prevExp, ...patch };
      const nextExpenses = prev.expenses.map(x=>x.id===id ? updated : x);

      let next = { ...prev, expenses: nextExpenses };

      // Si cambió el método y pasó a Tarjeta Crédito -> crear ccPurchase asociado
      if ((prevExp.method || "") !== "Tarjeta Crédito" && (updated.method || "") === "Tarjeta Crédito"){
        const cc = {
          id: uid(),
          sourceExpenseId: id,
          isPaid: false,
          datePurchase: updated.datePaid,
          vendor: updated.vendor || "",
          amount: updated.amount,
          ccCategory: updated.ccCategory || (prev.settings.creditCardCategories?.[0] ?? "Otros"),
          projectCategory: updated.scope==="Proyecto" ? updated.projectCategory : "",
          note: `${updated.category}${updated.note ? " — " + updated.note : ""}`
        };
        next = { ...next, ccPurchases: [cc, ...prev.ccPurchases] };
      }

      // Si cambió de Tarjeta Crédito a otro método -> borrar ccPurchases vinculadas
      if ((prevExp.method || "") === "Tarjeta Crédito" && (updated.method || "") !== "Tarjeta Crédito"){
        next = { ...next, ccPurchases: prev.ccPurchases.filter(c=>c.sourceExpenseId !== id) };
      }

      // Si cambiaron montos/fecha/categoría en un gasto TC ya existente, sincronizar la ccPurchase vinculada
      if ((updated.method || "") === "Tarjeta Crédito"){
        next = {
          ...next,
          ccPurchases: next.ccPurchases.map(c=> c.sourceExpenseId===id ? { ...c,
            datePurchase: updated.datePaid,
            vendor: updated.vendor || c.vendor,
            amount: updated.amount,
            projectCategory: updated.scope==="Proyecto" ? updated.projectCategory : c.projectCategory,
            note: `${updated.category}${updated.note ? " — " + updated.note : ""}`
          } : c)
        };
      }

      return next;
    });
  }

  function delExpense(id){
    setState(prev=>({
      ...prev,
      expenses: prev.expenses.filter(x=>x.id!==id),
      ccPurchases: prev.ccPurchases.filter(c=>c.sourceExpenseId !== id)
    }));
  }

  function addCCPayment(row){
    setState(prev=>({ ...prev, ccPayments: [{ id: uid(), ...row }, ...prev.ccPayments] }));
  }
  function delCCPayment(id){
    setState(prev=>({ ...prev, ccPayments: prev.ccPayments.filter(x=>x.id!==id) }));
  }
  function toggleCCPaid(id, isPaid){
    setState(prev=>({
      ...prev,
      ccPurchases: prev.ccPurchases.map(x=>x.id===id ? { ...x, isPaid } : x)
    }));
  }

  function addTransfer(row){
    setState(prev=>({ ...prev, transfers: [{ id: uid(), ...row }, ...prev.transfers] }));
  }
  function delTransfer(id){
    setState(prev=>({ ...prev, transfers: prev.transfers.filter(x=>x.id!==id) }));
  }

  function setOpening(month, value){
    setState(prev=>({
      ...prev,
      cashOpeningByMonth: { ...(prev.cashOpeningByMonth||{}), [month]: value }
    }));
  }


  // =========================
  // Export (CSV para Excel)
  // =========================
  function downloadCSV(filename, rows){
    const csvEscape = (v) => {
      const s = String(v ?? "");
      if (/[",\n]/.test(s)) return '"' + s.replace(/"/g,'""') + '"';
      return s;
    };
    const header = Object.keys(rows[0] || {});
    const lines = [
      header.join(","),
      ...rows.map(r => header.map(h => csvEscape(r[h])).join(","))
    ];
    const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function exportIncomes(){
    const rows = state.incomes.map(x=>({
      fecha_pago: x.datePaid || "",
      cuenta: accountName(state.accounts, x.accountId),
      categoria: x.category,
      tipo: x.typePago,
      estado: x.status,
      monto: x.amount,
      monto_pagado: x.amountPaid || 0,
      nota: x.note || ""
    }));
    downloadCSV("ingresos.csv", rows);
  }

  function exportExpenses(){
    const rows = state.expenses.map(x=>({
      fecha: x.datePaid || "",
      cuenta: accountName(state.accounts, x.accountId),
      alcance: x.scope,
      proyecto: x.scope==="Proyecto" ? x.projectCategory : "",
      categoria: x.category,
      metodo: x.method,
      monto: x.amount,
      proveedor: x.vendor || "",
      nota: x.note || "",
      documento_tipo: documentTypeLabel(x.documentType),
      documento_numero: x.documentNumber || "",
      documento_fecha_emision: x.documentIssuedAt || "",
      documento_proveedor: x.documentProvider || x.vendor || "",
      documento_notas: x.documentNotes || "",
    }));
    downloadCSV("egresos.csv", rows);
  }

  function exportMovements(){
    const rows = dashboardTxMonth.map(t=>({
      fecha: t.date,
      tipo: t.kind,
      monto: t.amount,
      cuenta: t.accountId ? accountName(state.accounts, t.accountId) : "",
      categoria: t.category || "",
      nota: t.note || ""
    }));
    downloadCSV("movimientos_caja.csv", rows);
  }

  // =========================
  // Caja: transacciones reales
  // =========================
  const cashTransactions = useMemo(()=>{
    // Ingresos a caja: pagado/pago parcial en fecha de pago
    const incomeTx = state.incomes
      .filter(x=>x.status === "Pagado" || x.status === "Pago parcial")
      .map(x=>({
        kind:"Ingreso",
        sourceType:"income",
        sourceId:x.id,
        date:x.datePaid,
        amount:(x.status==="Pago parcial" ? (x.amountPaid||0) : x.amount),
        category:x.category,
        type:x.typePago,
        accountId:x.accountId,
        note:x.note || ""
      }))
      .filter(t=>t.date);

    // Egresos a caja: solo no-TC
    const expenseTx = state.expenses
      .filter(x=>x.method !== "Tarjeta Crédito")
      .map(x=>({
        kind:"Egreso",
        sourceType:"expense",
        sourceId:x.id,
        date:x.datePaid,
        amount:x.amount,
        category:x.category,
        projectCategory: x.scope==="Proyecto" ? x.projectCategory : "Oficina",
        accountId:x.accountId,
        note:`${x.scope==="Proyecto" ? x.projectCategory + " — " : ""}${x.vendor ? x.vendor + " — " : ""}${x.note || ""}`
      }))
      .filter(t=>t.date);

    // Pagos de TC a caja (desde una cuenta)
    const ccPayTx = state.ccPayments.map(p=>({
      kind:"Egreso",
      sourceType:"ccPayment",
      sourceId:p.id,
      date:p.datePaid,
      amount:p.amount,
      category:"Pago Tarjeta Crédito",
      projectCategory:"Oficina",
      accountId:p.accountId,
      note:`Pago TC — ${p.cardName || "Tarjeta"}`
    })).filter(t=>t.date);

    // Transferencias entre cuentas: (consolidado neto 0, pero por cuenta sí afecta)
    const transferTx = state.transfers.flatMap(tr=>{
      if (!tr.date) return [];
      return [
        { kind:"Egreso", sourceType:"transfer", sourceId: tr.id, date: tr.date, amount: tr.amount, category:"Transferencia", projectCategory:"Oficina", accountId: tr.fromAccountId, note:`A ${accountName(state.accounts, tr.toAccountId)}` },
        { kind:"Ingreso", sourceType:"transfer", sourceId: tr.id, date: tr.date, amount: tr.amount, category:"Transferencia", projectCategory:"Oficina", accountId: tr.toAccountId, note:`Desde ${accountName(state.accounts, tr.fromAccountId)}` },
      ];
    });

    return [...incomeTx, ...expenseTx, ...ccPayTx, ...transferTx];
  }, [state.incomes, state.expenses, state.ccPayments, state.transfers, state.accounts]);

  function filteredCashTx(){
    if (cashViewAccountId === "CONSOLIDADO") return cashTransactions;
    return cashTransactions.filter(t=>t.accountId === cashViewAccountId);
  }

  const months = useMemo(()=>{
    const keys = new Set();
    filteredCashTx().forEach(t=>keys.add(monthKey(t.date)));
    Object.keys(state.cashOpeningByMonth || {}).forEach(k=>keys.add(k));
    return [...keys].filter(Boolean).sort();
  }, [cashTransactions, state.cashOpeningByMonth, cashViewAccountId]);

  const cashflow = useMemo(()=>{
    const tx = filteredCashTx();
    const byMonth = Object.fromEntries(months.map(m=>[m,{ incomes:0, expenses:0 }]));
    for (const t of tx){
      const m = monthKey(t.date);
      if (!byMonth[m]) byMonth[m] = { incomes:0, expenses:0 };
      if (t.kind==="Ingreso") byMonth[m].incomes += t.amount;
      else byMonth[m].expenses += t.amount;
    }
    const rows = [];
    let running = 0;
    months.forEach((m, idx)=>{
      const opening = (idx===0)
        ? (state.cashOpeningByMonth?.[m] ?? 0)
        : running;
      const inc = byMonth[m]?.incomes ?? 0;
      const exp = byMonth[m]?.expenses ?? 0;
      const net = inc - exp;
      const closing = opening + net;
      running = closing;
      rows.push({ month:m, opening, incomes:inc, expenses:exp, net, closing });
    });
    return rows;
  }, [months, cashTransactions, state.cashOpeningByMonth, cashViewAccountId]);

  // =========================
  // Dashboard Aggregations
  // =========================
  const dashboardTx = useMemo(()=>filteredCashTx(), [cashTransactions, cashViewAccountId]);
  const dashboardMonths = useMemo(()=>{
    // meses disponibles en dashboard (mismos que “months”, pero con opción ALL)
    return ["ALL", ...months];
  }, [months]);
  const dashboardTxMonth = useMemo(()=>{
  const tx = dashboardTx.slice().sort((a,b)=>{
    const cmp = sortByDate(b.date,a.date);
    return dashSort === "DESC" ? cmp : -cmp;
  });
  if (dashMonth === "ALL") return tx;
  return tx.filter(t => monthKey(t.date) === dashMonth);
}, [dashboardTx, dashMonth, dashSort]);

  const DASH_PAGE_SIZE = 10;
  const dashTotalPages = Math.max(1, Math.ceil(dashboardTxMonth.length / DASH_PAGE_SIZE));
  const dashPageClamped = Math.min(Math.max(dashPage, 1), dashTotalPages);
  const dashStart = (dashPageClamped - 1) * DASH_PAGE_SIZE;
  const dashPageTx = dashboardTxMonth.slice(dashStart, dashStart + DASH_PAGE_SIZE);

const kpis = useMemo(()=>{
  const totalIncome = dashboardTxMonth.filter(t=>t.kind==="Ingreso").reduce((a,b)=>a+b.amount,0);
  const totalExpense = dashboardTxMonth.filter(t=>t.kind==="Egreso").reduce((a,b)=>a+b.amount,0);
  const net = totalIncome - totalExpense;
  const ccOutstanding = state.ccPurchases.filter(c=>!c.isPaid).reduce((a,b)=>a+b.amount,0);

  // Saldo en caja según mes seleccionado (y cuenta/Consolidado)
  let cashBalance = 0;
  if (cashflow.length){
    if (dashMonth === "ALL"){
      cashBalance = cashflow[cashflow.length - 1].closing;
    } else {
      const row = cashflow.find(r => r.month === dashMonth);
      cashBalance = row ? row.closing : cashflow[cashflow.length - 1].closing;
    }
  }
  return { totalIncome, totalExpense, net, ccOutstanding, cashBalance };
}, [dashboardTxMonth, state.ccPurchases, cashflow, dashMonth]);

  const expenseByCategory = useMemo(()=>{
    const map = new Map();
    dashboardTxMonth.filter(t=>t.kind==="Egreso").forEach(t=>{
      const key = t.category || "Sin categoría";
      map.set(key, (map.get(key)||0) + t.amount);
    });
    return [...map.entries()].map(([name, value])=>({ name, value })).sort((a,b)=>b.value-a.value);
  }, [dashboardTxMonth]);

const incomeByCategory = useMemo(()=>{
  const map = new Map();
  dashboardTxMonth.filter(t=>t.kind==="Ingreso").forEach(t=>{
    const key = t.category || "Sin categoría";
    map.set(key, (map.get(key)||0) + t.amount);
  });
  return [...map.entries()].map(([name, value])=>({ name, value })).sort((a,b)=>b.value-a.value);
}, [dashboardTxMonth]);

  const cashflowBars = useMemo(()=>{
    return cashflow.map(r=>({ month: r.month, Ingresos: r.incomes, Egresos: r.expenses }));
  }, [cashflow]);

  // =========================
  // Proyectos: Plan vs Pagado
  // =========================
  const projectReceiptsByType = useMemo(()=>{
    // suma de ingresos pagados por proyecto y typePago
    const result = {};
    for (const p of state.projects){
      const map = new Map();
      state.incomes
        .filter(i=>i.category===p.category)
        .filter(i=>i.status==="Pagado" || i.status==="Pago parcial")
        .forEach(i=>{
          const amt = i.status==="Pago parcial" ? (i.amountPaid||0) : i.amount;
          map.set(i.typePago, (map.get(i.typePago)||0) + amt);
        });
      result[p.id] = map;
    }
    return result;
  }, [state.incomes, state.projects]);

  function normalizePaymentPlan(project){
    // asegura que el plan solo use tipos existentes; si un tipo fue borrado, queda como "Otro"
    const valid = new Set(settings.paymentTypes);
    const plan = (project.paymentPlan || []).map(x=>{
      const type = valid.has(x.type) ? x.type : "Otro";
      return { ...x, type };
    });
    return plan;
  }

  // =========================
  // Tabs
  // =========================
  const tabs = ["Dashboard","Ingresos","Egresos","Tarjeta Crédito","Flujo de Caja","Proyectos","Transferencias","Configuración"];

  
  // --- Auth gate ---
  if (authLoading) {
    return (
      <div className="container">
        <div className="card">Cargando sesión…</div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="container">
        <Auth />
      </div>
    );
  }

  if (!cloudReady) {
    return (
      <div className="container">
        <div className="card">Cargando datos…</div>
      </div>
    );
  }

return (
    <div className="container">
      <div className="topbar">
        <div className="brand">Finanzas Proyectos</div>

        <div className="row">
          <label className="small">Cuenta activa</label>
          <select value={activeAccountId} onChange={(e)=>setActiveAccountId(e.target.value)}>
            {state.accounts.map(a=> <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <button className="primary" onClick={addAccount}>+ Cuenta</button>

          <label className="small">Proyecto activo</label>
          <select value={activeProjectId} onChange={(e)=>setActiveProjectId(e.target.value)}>
            {state.projects.map(p=> <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button className="primary" onClick={addProject}>+ Proyecto</button>
          <button className="ghost" onClick={async ()=>{ await supabase.auth.signOut(); localStorage.removeItem(STORE_KEY); window.location.reload(); }}>Cerrar sesión</button>
          <div className="small" style={{opacity:0.7}}> {session?.user?.email}</div>
        </div>
      </div>

      <div className="tabs">
        {tabs.map(t=>(
          <button key={t} className={"tab " + (tab===t ? "active" : "")} onClick={()=>setTab(t)}>{t}</button>
        ))}
      </div>

      {/* QUICK MODAL */}
      <Modal open={quickOpen} title="Registrar movimiento" onClose={()=>setQuickOpen(false)}>
        <div className="pillRow">
          {["Ingreso","Gasto","Transferencia"].map(m=>(
            <button key={m} className={"pill " + (quickMode===m ? "active" : "")} onClick={()=>setQuickMode(m)}>{m}</button>
          ))}
        </div>

        <div className="hr"></div>

        {quickMode==="Ingreso" && (
          <IncomeForm
            settings={settings}
            accounts={state.accounts}
            defaultCategory={activeProject?.category}
            defaultAccountId={activeAccountId}
            onAdd={(row)=>{ addIncome(row); setQuickOpen(false); setTab("Ingresos"); }}
          />
        )}

        {quickMode==="Gasto" && (
          <ExpenseForm
            settings={settings}
            accounts={state.accounts}
            defaultAccountId={activeAccountId}
            activeProject={activeProject}
            onAdd={(row)=>{ addExpense(row); setQuickOpen(false); setTab("Egresos"); }}
          />
        )}

        {quickMode==="Transferencia" && (
          <TransferForm
            accounts={state.accounts}
            defaultFrom={activeAccountId}
            onAdd={(row)=>{ addTransfer(row); setQuickOpen(false); setTab("Dashboard"); }}
          />
        )}
      </Modal>

      {/* DASHBOARD */}
      {tab==="Dashboard" && (
        <div className="grid" style={{ marginTop:12 }}>
          <Section
            title="Resumen"
            right={
              <div className="row">
                <select value={cashViewAccountId} onChange={(e)=>setCashViewAccountId(e.target.value)}>
                  <option value="CONSOLIDADO">Consolidado (todas las cuentas)</option>
                  {state.accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                <button className="primary" onClick={()=>{ setQuickMode("Ingreso"); setQuickOpen(true); }}>
                  Registrar…
                </button>
              </div>
            }
          >
            <div className="row" style={{ marginBottom: 12 }}>
  <div>
    <div className="muted">Mes</div>
    <select value={dashMonth} onChange={(e)=>setDashMonth(e.target.value)}>
      {dashboardMonths.map(m=>(
        <option key={m} value={m}>
          {monthLabel(m)}
        </option>
      ))}
    </select>
  </div>
</div>

            <div className="kpis">
              <div className="kpi">
                <div className="label">Ingresos (caja)</div>
                <div className="value">${clp(kpis.totalIncome)}</div>
              </div>
              <div className="kpi">
                <div className="label">Egresos (caja)</div>
                <div className="value">${clp(kpis.totalExpense)}</div>
              </div>
              <div className="kpi">
                <div className="label">Neto</div>
                <div className="value">${clp(kpis.net)}</div>
              </div>
              <div className="kpi">
                <div className="label">Saldo en caja</div>
                <div className="value">${clp(kpis.cashBalance)}</div>
              </div>
              <div className="kpi">
                <div className="label">TC pendiente (compras no pagadas)</div>
                <div className="value">${clp(kpis.ccOutstanding)}</div>
              </div>
            </div>

            <div className="row" style={{ justifyContent:"flex-end", marginTop: 8 }}>
              <button className="danger" type="button" onClick={()=>delProject(activeProject.id)}>
                Eliminar proyecto
              </button>
            </div>

            <div className="hr"></div>

            <div className="grid">
              <div className="card">
                <div className="h2">Egresos por categoría</div>
                <div style={{ height: 260 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={expenseByCategory} dataKey="value" nameKey="name" outerRadius={90} label={false} labelLine={false}>
                          {expenseByCategory.map((row, i)=>{
                          const name = row?.name;
                          const colors = state.settings.categoryColors?.expense?.[name];
                          const color = Array.isArray(colors) ? colors[0] : colors;
                          const fallback = autoCells(expenseByCategory.length)[i];
                          return <Cell key={i} fill={color || fallback} />;
                        })}
                      </Pie>
                      <RTooltip formatter={(v)=>`$${clp(v)}`} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="card">
                <div className="h2">Ingresos por categoría</div>
                <div style={{ height: 260 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={incomeByCategory} dataKey="value" nameKey="name" outerRadius={90} label={false} labelLine={false}>
                          {incomeByCategory.map((row, i)=>{
                          const name = row?.name;
                          const colors = state.settings.categoryColors?.income?.[name];
                          const color = Array.isArray(colors) ? colors[0] : colors;
                          const fallback = autoCells(incomeByCategory.length)[i];
                          return <Cell key={i} fill={color || fallback} />;
                        })}
                      </Pie>
                      <RTooltip formatter={(v)=>`$${clp(v)}`} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </Section>

          <Section
            title="Últimos movimientos (caja)"
            right={
              <div className="row" style={{ flexWrap: "wrap" }}>
                <label className="small">Mes</label>
                <select value={dashMonth} onChange={(e)=>setDashMonth(e.target.value)}>
                  {dashboardMonths.map(m=>(
                    <option key={m} value={m}>
                      {monthLabel(m)}
                    </option>
                  ))}
                </select>

                <label className="small">Orden</label>
                <select value={dashSort} onChange={(e)=>setDashSort(e.target.value)}>
                  <option value="DESC">Más reciente</option>
                  <option value="ASC">Más antiguo</option>
                </select>

                <button className="ghost" onClick={exportMovements}>Exportar movimientos</button>

                <div className="row" style={{ gap: 6 }}>
                  <button className="ghost" onClick={()=>setDashPage(p=>Math.max(1, p-1))} disabled={dashPageClamped<=1}>◀</button>
                  <span className="small">{dashPageClamped} / {dashTotalPages}</span>
                  <button className="ghost" onClick={()=>setDashPage(p=>Math.min(dashTotalPages, p+1))} disabled={dashPageClamped>=dashTotalPages}>▶</button>
                </div>
              </div>
            }
          >
            <table>
              <thead>
                <tr><th>Fecha</th><th>Tipo</th><th>Monto</th><th>Cuenta</th><th>Categoría</th><th>Nota</th></tr>
              </thead>
              <tbody>
                {dashPageTx
                 .map((t,idx)=>(
                   <tr key={idx}>
                     <td>{t.date}</td>
                      <td>
                        <span className={"badge " + (t.kind==="Ingreso" ? "ok" : "bad")}>
                          {t.kind}
                        </span>
                      </td>
                      <td className={t.kind==="Ingreso" ? "amountGreen" : "amountRed"}>
                          ${clp(t.amount)}
                      </td>
                      <td>{accountName(state.accounts, t.accountId)}</td>
                     <td>
                        {t.sourceType==="income" ? (
                          <select
                            value={t.category}
                            onChange={(e)=>updateIncome(t.sourceId, { category: e.target.value })}
                          >
                            {settings.incomeCategories.map(c=><option key={c} value={c}>{c}</option>)}
                          </select>
                        ) : t.sourceType==="expense" ? (
                          <select
                            value={t.category}
                            onChange={(e)=>updateExpense(t.sourceId, { category: e.target.value })}
                          >
                            {( (state.expenses.find(x=>x.id===t.sourceId)?.scope)==="Oficina"
                              ? settings.expenseCategoriesOffice
                              : settings.expenseCategoriesProject
                            ).map(c=>{
                              const colors = state.settings.categoryColors?.expense?.[c];
                              const color = Array.isArray(colors) ? colors[0] : colors;
                              const style = color ? { backgroundColor: color, color: contrastColor(color) } : undefined;
                              return <option key={c} value={c} style={style}>{c}</option>;
                            })}
                          </select>
                        ) : (
                          <span>{t.category}</span>
                        )}
                      </td>
                     <td className="small">{t.note}</td>
                    </tr>
                  ))}
                {dashboardTxMonth.length===0 && (
                  <tr><td colSpan={6} className="small">Sin movimientos en el mes seleccionado.</td></tr>
                )}

              </tbody>
            </table>
          </Section>
        </div>
      )}

      {/* INGRESOS */}
      {tab==="Ingresos" && (
        <div className="grid" style={{ marginTop:12 }}>
          <Section title="Registrar ingreso (INGRESOS OFICINA)">
            <IncomeForm
              settings={settings}
              accounts={state.accounts}
              defaultCategory={activeProject?.category}
              defaultAccountId={activeAccountId}
              onAdd={addIncome}
            />
            <div className="muted" style={{ marginTop:8 }}>
              En “Ingresos recientes” puedes cambiar Pendiente ↔ Pagado ↔ Pago parcial.
            </div>
          </Section>

          <Section title="Ingresos recientes (editable)" right={<button className="ghost" onClick={exportIncomes}>Exportar ingresos</button>}>
            <table>
              <thead>
                <tr>
                  <th>Fecha pago</th><th>Cuenta</th><th>Categoría</th><th>Tipo</th><th>Estado</th>
                  <th>Monto</th><th>Monto pagado</th><th></th>
                </tr>
              </thead>
              <tbody>
                {state.incomes.slice(0,22).map(x=>(
                  <tr key={x.id}>
                    <td>
                      <input
                        type="date"
                        value={x.datePaid || ""}
                        disabled={x.status==="Pendiente"}
                        onChange={(e)=>updateIncome(x.id, { datePaid: e.target.value })}
                      />
                    </td>
                    <td>{accountName(state.accounts, x.accountId)}</td>
                    <td>
                      <select value={x.category} onChange={(e)=>updateIncome(x.id, { category: e.target.value })}>
                        {settings.incomeCategories.map(c=><option key={c} value={c}>{c}</option>)}
                      </select>
                    </td>
                    <td>{x.typePago}</td>
                    <td>
                      <select
                        value={x.status}
                        onChange={(e)=>{
                          const next = e.target.value;
                          if (next==="Pendiente"){
                            updateIncome(x.id, { status: next, datePaid:"", amountPaid: 0 });
                          } else if (next==="Pagado"){
                            updateIncome(x.id, { status: next, datePaid: x.datePaid || nowISO(), amountPaid: 0 });
                          } else {
                            // Pago parcial
                            updateIncome(x.id, { status: next, datePaid: x.datePaid || nowISO() });
                          }
                        }}
                      >
                        {["Pagado","Pendiente","Pago parcial"].map(s=><option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    <td>${clp(x.amount)}</td>
                    <td>
                      <input
                        value={x.amountPaid || 0}
                        disabled={x.status!=="Pago parcial"}
                        onChange={(e)=>updateIncome(x.id, { amountPaid: parseMoney(e.target.value) })}
                        style={{ width: 120 }}
                      />
                    </td>
                    <td><button className="danger" onClick={()=>delIncome(x.id)}>Eliminar</button></td>
                  </tr>
                ))}
                {state.incomes.length===0 && <tr><td colSpan={8} className="small">Sin ingresos.</td></tr>}
              </tbody>
            </table>
          </Section>
        </div>
      )}

      {/* EGRESOS */}
      {tab==="Egresos" && (
        <div className="grid" style={{ marginTop:12 }}>
          <Section title="Registrar egreso">
            <ExpenseForm
              settings={settings}
              accounts={state.accounts}
              defaultAccountId={activeAccountId}
              activeProject={activeProject}
              onAdd={addExpense}
            />
            <div className="muted" style={{ marginTop:8 }}>
              Si método = Tarjeta Crédito, se crea una compra TC con su categoría TC. La caja baja solo cuando registras el “Pago de TC”.
            </div>
          </Section>

          <Section title="Egresos recientes" right={<button className="ghost" onClick={exportExpenses}>Exportar egresos</button>}>
            <table>
              <thead>
                <tr><th>Fecha</th><th>Cuenta</th><th>Alcance</th><th>Centro</th><th>Categoría</th><th>Método</th><th>Documento</th><th>Monto</th><th></th></tr>
              </thead>
              <tbody>
                {recentPager.pageItems.map(x=>{
                  const projectOptions = settings.incomeCategories.filter(y=>y.startsWith("OBRA:"));
                  const docType = x.documentType || "sin_respaldo";
                  const docLabel = documentTypeLabel(docType);
                  const storedProvider = (x.documentProvider || "").trim();
                  const vendorName = (x.vendor || "").trim();
                  const docProvider = storedProvider || vendorName;
                  const providerIsCustom = storedProvider && storedProvider !== vendorName;
                  const hasDocument = (docType && docType !== "sin_respaldo")
                    || x.documentNumber
                    || x.documentIssuedAt
                    || x.documentNotes
                    || providerIsCustom;
                  return (
                  <tr key={x.id}>
                    <td>
                      <input type="date" value={x.datePaid || ""} onChange={(e)=>updateExpense(x.id, { datePaid: e.target.value })} />
                    </td>
                    <td>
                      <select value={x.accountId} onChange={(e)=>updateExpense(x.id, { accountId: e.target.value })}>
                        {state.accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                    </td>
                    <td>
                      <select value={x.scope} onChange={(e)=>{
                        const next = e.target.value;
                        updateExpense(x.id, { scope: next, projectCategory: next==="Proyecto" ? (x.projectCategory || projectOptions[0] || "") : "" });
                      }}>
                        {["Oficina","Proyecto"].map(s=> <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    <td>
                      {x.scope==="Proyecto" ? (
                        <select value={x.projectCategory || ""} onChange={(e)=>updateExpense(x.id, { projectCategory: e.target.value })}>
                          {projectOptions.map(c=><option key={c} value={c}>{c}</option>)}
                        </select>
                      ) : (
                        <span>Oficina</span>
                      )}
                    </td>
                    <td>
                      {(() => {
                        const selColors = state.settings.categoryColors?.expense?.[x.category];
                        const selColor = Array.isArray(selColors) ? selColors[0] : selColors;
                        const selectStyle = selColor ? { backgroundColor: selColor, color: contrastColor(selColor), padding: '6px 8px', borderRadius: 6 } : undefined;
                        return (
                          <select
                            value={x.category}
                            onChange={(e)=>updateExpense(x.id, { category: e.target.value })}
                            style={selectStyle}
                          >
                            {(x.scope==="Oficina" ? settings.expenseCategoriesOffice : settings.expenseCategoriesProject)
                              .map(c=>{
                                const colors = state.settings.categoryColors?.expense?.[c];
                                const color = Array.isArray(colors) ? colors[0] : colors;
                                const style = color ? { backgroundColor: color, color: contrastColor(color) } : undefined;
                                return <option key={c} value={c} style={style}>{c}</option>;
                              })}
                          </select>
                        );
                      })()}
                    </td>
                    <td>
                      <select value={x.method || "Transferencia"} onChange={(e)=>updateExpense(x.id, { method: e.target.value })}>
                        {["Transferencia","Débito","Efectivo","Tarjeta Crédito"].map(m=><option key={m} value={m}>{m}</option>)}
                      </select>
                    </td>
                    <td>
                      <div className="small" style={{ marginBottom:6 }}>
                        <div><b>{docLabel}</b></div>
                        {docProvider && <div>Proveedor: {docProvider}</div>}
                        {x.documentNumber && <div>N° {x.documentNumber}</div>}
                        {x.documentIssuedAt && <div>Emisión: {x.documentIssuedAt}</div>}
                        {x.documentNotes && <div className="mini">{x.documentNotes}</div>}
                        {!hasDocument && (
                          <div className="muted">Sin respaldo registrado.</div>
                        )}
                      </div>
                      <button className="ghost" type="button" onClick={()=>setDocModalExpenseId(x.id)}>
                        {hasDocument ? "Editar documento" : "Agregar documento"}
                      </button>
                    </td>
                    <td>
                      <input value={x.amount} onChange={(e)=>updateExpense(x.id, { amount: parseMoney(e.target.value) })} style={{ width:120 }} />
                    </td>
                    <td><button className="danger" onClick={()=>delExpense(x.id)}>Eliminar</button></td>
                  </tr>
                )})}
                {recentPager.total===0 && <tr><td colSpan={9} className="small">Sin egresos.</td></tr>}
              </tbody>
            </table>
            <PaginationFooter
              pager={recentPager}
              onPrev={()=>setRecentExpensePage(p=>Math.max(1, p-1))}
              onNext={()=>setRecentExpensePage(p=>p+1)}
            />
          </Section>
        </div>
      )}

      {/* TARJETA CREDITO */}
      {tab==="Tarjeta Crédito" && (
        <div className="grid" style={{ marginTop:12 }}>
          <Section title="Pago de TC (sí caja)">
            <CCPaymentForm
              accounts={state.accounts}
              defaultAccountId={activeAccountId}
              onAdd={addCCPayment}
            />
          </Section>

          <Section
            title="Compras TC (con categorías, incluye devoluciones)"
            right={<span className="badge warn">Pendiente: ${clp(state.ccPurchases.filter(x=>!x.isPaid).reduce((a,b)=>a+b.amount,0))}</span>}
          >
            <div className="muted">
              Puedes ingresar devoluciones con monto negativo (eso resta a la categoría).
            </div>
            <div className="hr"></div>

            <table>
              <thead>
                <tr><th>Fecha</th><th>Categoría TC</th><th>Proyecto</th><th>Proveedor</th><th>Monto</th><th>Glosa</th><th>Pagada</th></tr>
              </thead>
              <tbody>
                {state.ccPurchases.slice(0,24).map(x=>(
                  <tr key={x.id}>
                    <td>{x.datePurchase}</td>
                    <td>{x.ccCategory}</td>
                    <td className="small">{x.projectCategory || "—"}</td>
                    <td>{x.vendor}</td>
                    <td>${clp(x.amount)}</td>
                    <td className="small">{x.note}</td>
                    <td><input type="checkbox" checked={!!x.isPaid} onChange={(e)=>toggleCCPaid(x.id, e.target.checked)} /></td>
                  </tr>
                ))}
                {state.ccPurchases.length===0 && <tr><td colSpan={7} className="small">Aún no hay compras TC. Se crean automáticamente al registrar egreso con método “Tarjeta Crédito”.</td></tr>}
              </tbody>
            </table>

            <div className="hr"></div>

            <div className="h2">Pagos de TC registrados</div>
            <table>
              <thead><tr><th>Fecha pago</th><th>Cuenta</th><th>Tarjeta</th><th>Monto</th><th>Nota</th><th></th></tr></thead>
              <tbody>
                {state.ccPayments.slice(0,12).map(x=>(
                  <tr key={x.id}>
                    <td>{x.datePaid}</td>
                    <td>{accountName(state.accounts, x.accountId)}</td>
                    <td>{x.cardName}</td>
                    <td>${clp(x.amount)}</td>
                    <td className="small">{x.note}</td>
                    <td><button className="danger" onClick={()=>delCCPayment(x.id)}>Eliminar</button></td>
                  </tr>
                ))}
                {state.ccPayments.length===0 && <tr><td colSpan={6} className="small">Sin pagos TC.</td></tr>}
              </tbody>
            </table>
          </Section>
        </div>
      )}

      {/* FLUJO DE CAJA */}
      {tab==="Flujo de Caja" && (
        <div style={{ marginTop:12 }}>
          <Section
            title="Flujo de caja mensual (con gráfico)"
            right={
              <select value={cashViewAccountId} onChange={(e)=>setCashViewAccountId(e.target.value)}>
                <option value="CONSOLIDADO">Consolidado (todas las cuentas)</option>
                {state.accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            }
          >
            <div className="muted">
              El saldo inicial solo se edita en el primer mes del flujo (según los movimientos existentes).
            </div>

            <div className="hr"></div>

            <div style={{ height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={cashflowBars}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <RTooltip formatter={(v)=>`$${clp(v)}`} />
                  <Legend />
                  <Bar dataKey="Ingresos" fill="#16a34a" />
                  <Bar dataKey="Egresos" fill="#dc2626" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="hr"></div>

            <table>
              <thead>
                <tr><th>Mes</th><th>Saldo inicial</th><th>Ingresos</th><th>Egresos</th><th>Neto</th><th>Saldo final</th><th>Editar saldo inicial (primer mes)</th></tr>
              </thead>
              <tbody>
                {cashflow.map((r, idx)=>(
                  <tr key={r.month}>
                    <td><b>{r.month}</b></td>
                    <td>${clp(r.opening)}</td>
                    <td>${clp(r.incomes)}</td>
                    <td>${clp(r.expenses)}</td>
                    <td>${clp(r.net)}</td>
                    <td><b>${clp(r.closing)}</b></td>
                    <td>
                      {idx===0 ? (
                        <input
                          style={{ width: 180 }}
                          placeholder="ej: 5731319"
                          value={state.cashOpeningByMonth?.[r.month] ?? ""}
                          onChange={(e)=>setOpening(r.month, parseMoney(e.target.value))}
                        />
                      ) : <span className="small">—</span>}
                    </td>
                  </tr>
                ))}
                {cashflow.length===0 && <tr><td colSpan={7} className="small">Aún no hay movimientos para calcular flujo.</td></tr>}
              </tbody>
            </table>
          </Section>
        </div>
      )}

      {/* PROYECTOS */}
      {tab==="Proyectos" && (
        <div className="grid" style={{ marginTop:12 }}>
          <Section title="Datos del proyecto (incluye plan de pagos)">
            <div className="formGrid">
              <label>Nombre
                <input value={activeProject?.name || ""} onChange={(e)=>updateProject(activeProject.id,{name:e.target.value})}/>
              </label>
              <label>Categoría (match ingresos)
                <input value={activeProject?.category || ""} onChange={(e)=>updateProject(activeProject.id,{category:e.target.value})}/>
              </label>
              <label>Cliente
                <input value={activeProject?.client || ""} onChange={(e)=>updateProject(activeProject.id,{client:e.target.value})}/>
              </label>
              <label>Monto contrato (CLP)
                <input value={activeProject?.contractTotal || 0} onChange={(e)=>updateProject(activeProject.id,{contractTotal:parseMoney(e.target.value)})}/>
              </label>
            </div>

            <div style={{ marginTop: 8 }}>
              <button className="danger" onClick={()=>{ if (activeProject?.id) delProject(activeProject.id); }}>Eliminar proyecto</button>
            </div>

            <div className="hr"></div>

            <div className="h2">Plan de pagos contractual (hitos y %)</div>
            <div className="muted">
              Este plan se vincula al “Tipo de pago” en Ingresos. Si registras un ingreso con “Hito 1”, se sumará como pagado del hito 1.
            </div>

            <div className="hr"></div>

            <PaymentPlanEditor
              project={activeProject}
              paymentTypes={settings.paymentTypes}
              onChange={(nextPlan)=>updateProject(activeProject.id, { paymentPlan: nextPlan })}
            />

            <div className="hr"></div>

            <div className="h2">Estado por hito (esperado vs recibido)</div>
            <ProjectPaymentSummary
              project={activeProject}
              paymentTypes={settings.paymentTypes}
              receiptsMap={projectReceiptsByType[activeProject.id]}
            />
            <div className="hr"></div>

            <Section title="Progreso y desglose de gasto">
              {(() => {
                const contract = Number(activeProject?.contractTotal || 0);
                const spent = cashTransactions
                  .filter(t=>t.kind==="Egreso" && t.projectCategory===activeProject?.category)
                  .reduce((s,t)=>s + (Number(t.amount)||0), 0);
                const percent = contract > 0 ? Math.round((spent / contract) * 100) : 0;

                // breakdown by expense category (project-related)
                const map = new Map();
                cashTransactions
                  .filter(t=>t.kind==="Egreso" && t.projectCategory===activeProject?.category)
                  .forEach(t=> map.set(t.category || "Sin categoría", (map.get(t.category)||0) + t.amount));
                const breakdown = [...map.entries()].map(([name, value])=>({ name, value })).sort((a,b)=>b.value-a.value);

                return (
                  <div>
                    <div style={{ marginBottom: 8 }}>
                      <div className="muted">Contrato: ${clp(contract)} — Gastado: ${clp(spent)} {contract>0 && <span>({percent}%)</span>}</div>
                      <div style={{ height: 16, background: '#e5e7eb', borderRadius: 8, overflow: 'hidden', marginTop:6 }}>
                        <div style={{ width: Math.min(100, Math.max(0, percent)) + '%', height: '100%', background: '#16a34a' }} />
                      </div>
                    </div>

                    <div style={{ marginTop: 12 }}>
                      <div className="h3">Detalle gasto por categoría</div>
                      <table>
                        <thead><tr><th>Categoría</th><th>Monto</th></tr></thead>
                        <tbody>
                          {breakdown.map(b=> (
                            <tr key={b.name}>
                              <td>
                                {(() => {
                                  const colors = state.settings.categoryColors?.expense?.[b.name];
                                  const color = Array.isArray(colors) ? colors[0] : colors;
                                  if (!color) return <span>{b.name}</span>;
                                  const fg = contrastColor(color);
                                  return <span style={{ display:'inline-block', padding:'4px 8px', borderRadius:8, background: color, color: fg, fontWeight:600 }}>{b.name}</span>;
                                })()}
                              </td>
                              <td>${clp(b.value)}</td>
                            </tr>
                          ))}
                          {breakdown.length===0 && <tr><td colSpan={2} className="small">Sin gastos registrados para este proyecto.</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}
            </Section>
          </Section>

          <Section title="Resumen por proyecto (caja)">
            <table>
              <thead><tr><th>Proyecto</th><th>Ingresos</th><th>Egresos</th><th>Neto</th></tr></thead>
              <tbody>
                {state.projects.map(p=>{
                  const inc = cashTransactions.filter(t=>t.kind==="Ingreso" && t.category===p.category).reduce((a,b)=>a+b.amount,0);
                  const exp = cashTransactions.filter(t=>t.kind==="Egreso" && t.projectCategory===p.category).reduce((a,b)=>a+b.amount,0);
                  return (
                    <tr key={p.id}>
                      <td><b>{p.name}</b><div className="small">{p.category}</div></td>
                      <td>${clp(inc)}</td>
                      <td>${clp(exp)}</td>
                      <td><b>${clp(inc-exp)}</b></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Section>

          <Section title="Egresos del proyecto">
            <table>
              <thead><tr><th>Fecha</th><th>Cuenta</th><th>Categoría</th><th>Método</th><th>Proveedor</th><th>Monto</th><th>Nota</th><th></th></tr></thead>
              <tbody>
                {projectPager.pageItems.map(e=> (
                  <tr key={e.id}>
                    <td>{e.datePaid}</td>
                    <td>{accountName(state.accounts, e.accountId)}</td>
                    <td>
                      {(() => {
                        const colors = state.settings.categoryColors?.expense?.[e.category];
                        const color = Array.isArray(colors) ? colors[0] : colors;
                        if (!color) return <span>{e.category}</span>;
                        const fg = contrastColor(color);
                        return (
                          <span style={{ display:'inline-block', padding:'4px 8px', borderRadius:8, background: color, color: fg, fontWeight:600 }}>
                            {e.category}
                          </span>
                        );
                      })()}
                    </td>
                    <td>{e.method}</td>
                    <td>{e.vendor || ""}</td>
                    <td>${clp(e.amount)}</td>
                    <td className="small">{e.note}</td>
                    <td><button className="danger" onClick={()=>delExpense(e.id)}>Eliminar</button></td>
                  </tr>
                ))}
                {projectPager.total===0 && (
                  <tr><td colSpan={8} className="small">No hay egresos para este proyecto.</td></tr>
                )}
              </tbody>
            </table>
            <PaginationFooter
              pager={projectPager}
              onPrev={()=>setProjectExpensePage(p=>Math.max(1, p-1))}
              onNext={()=>setProjectExpensePage(p=>p+1)}
            />
          </Section>
        </div>
      )}

      {tab==="Transferencias" && (
        <div className="grid" style={{ marginTop:12 }}>
          <Section title="Indicador de flujo entre cuentas">
            {state.transfers.length ? (
              <div>
                <div className="row" style={{ justifyContent:"space-between", fontWeight:600, textTransform:"uppercase", marginBottom:6 }}>
                  <span>Arquitectura</span>
                  <span>Corriente</span>
                </div>
                {(() => {
                  const pct = Math.min(50, (Math.abs(transferStats.balance) / transferStats.maxAbs) * 50);
                  const baseStyle = {
                    position:"relative",
                    height:18,
                    borderRadius:9,
                    background:'#e5e7eb',
                    overflow:'hidden'
                  };
                  const segmentStyle = transferStats.balance >= 0
                    ? { left:'50%', width:`${pct}%`, background:'#16a34a' }
                    : { right:'50%', width:`${pct}%`, background:'#dc2626' };
                  return (
                    <div style={baseStyle}>
                      <div style={{ position:'absolute', left:'50%', top:0, bottom:0, width:2, background:'#fff' }}></div>
                      <div style={{ position:'absolute', top:0, bottom:0, ...segmentStyle }}></div>
                    </div>
                  );
                })()}
                <div className="small" style={{ marginTop:8 }}>
                  Balance neto hacia Corriente: <b>${clp(transferStats.balance)}</b>
                  {transferStats.balance===0 ? " (equilibrado)" : transferStats.balance>0 ? " (flujo neto hacia Corriente)" : " (flujo neto hacia Arquitectura)"}
                </div>
                <div className="mini">
                  *Sumatoria neta según transferencias entre cuentas con nombres que contienen “arquitectura” vs “corriente”.
                </div>
              </div>
            ) : (
              <div className="muted">Aún no hay transferencias para analizar.</div>
            )}
          </Section>

          <Section title="Historial de transferencias entre cuentas">
            <table>
              <thead><tr><th>Fecha</th><th>Desde</th><th>Hacia</th><th>Monto</th><th>Nota</th><th></th></tr></thead>
              <tbody>
                {transferPager.pageItems.map(tr=>(
                  <tr key={tr.id}>
                    <td>{tr.date}</td>
                    <td>{accountName(state.accounts, tr.fromAccountId)}</td>
                    <td>{accountName(state.accounts, tr.toAccountId)}</td>
                    <td>${clp(tr.amount)}</td>
                    <td className="small">{tr.note}</td>
                    <td><button className="danger" onClick={()=>delTransfer(tr.id)}>Eliminar</button></td>
                  </tr>
                ))}
                {transferPager.total===0 && (
                  <tr><td colSpan={6} className="small">Sin transferencias registradas.</td></tr>
                )}
              </tbody>
            </table>
            <PaginationFooter
              pager={transferPager}
              onPrev={()=>setTransferPage(p=>Math.max(1, p-1))}
              onNext={()=>setTransferPage(p=>p+1)}
            />
          </Section>
        </div>
      )}

      {/* CONFIGURACIÓN */}
      {tab==="Configuración" && (
        <div className="grid" style={{ marginTop:12 }}>
          <Section title="Tipos de pago (hitos) — se usan en Ingresos y Plan de Proyectos">
            <ListEditor
              title="Tipos de pago"
              items={settings.paymentTypes}
              onChange={(items)=>updateSettings({ paymentTypes: items })}
              placeholder='ej: "Hito Permiso", "Entrega Anteproyecto"'
            />
          </Section>

          <Section title="Categorías de ingresos (menú desplegable)">
            <ListEditor
              title="Categorías de ingresos"
              items={settings.incomeCategories}
              onChange={(items)=>updateSettings({ incomeCategories: items })}
              placeholder='ej: "OBRA: Proyecto X", "Préstamo"'
            />
          </Section>

          <Section title="Categorías de egresos (Oficina)">
            <ListEditor
              title="Egresos Oficina"
              items={settings.expenseCategoriesOffice}
              onChange={(items)=>updateSettings({ expenseCategoriesOffice: items })}
              placeholder='ej: "Software", "Telefonía"'
            />
          </Section>

          <Section title="Categorías de egresos (Proyecto)">
            <ListEditor
              title="Egresos Proyecto"
              items={settings.expenseCategoriesProject}
              onChange={(items)=>updateSettings({ expenseCategoriesProject: items })}
              placeholder='ej: "Seguridad", "Arriendo bodega"'
            />
          </Section>

          <Section title="Categorías de Tarjeta de Crédito (TC)">
            <ListEditor
              title="Categorías TC"
              items={settings.creditCardCategories}
              onChange={(items)=>updateSettings({ creditCardCategories: items })}
              placeholder='ej: "Ferretería", "Logística"'
            />
          </Section>

          <Section title="Colores: Categorías de ingresos">
            <table>
              <thead><tr><th>Categoría</th><th>Color</th></tr></thead>
              <tbody>
                {settings.incomeCategories.map(cat=>(
                  <tr key={cat}>
                    <td>{cat}</td>
                    <td>
                      <ColorPicker
                        value={settings.categoryColors?.income?.[cat] || ""}
                        onChange={(color)=>updateSettings({
                          categoryColors: {
                            ...(settings.categoryColors||{}),
                            income: {
                              ...(settings.categoryColors?.income||{}),
                              [cat]: color
                            }
                          }
                        })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          <Section title="Colores: Categorías de egresos">
            <table>
              <thead><tr><th>Categoría</th><th>Color</th></tr></thead>
              <tbody>
                {[...settings.expenseCategoriesOffice, ...settings.expenseCategoriesProject].map(cat=>(
                  <tr key={cat}>
                    <td>{cat}</td>
                    <td>
                      <ColorPicker
                        value={settings.categoryColors?.expense?.[cat] || ""}
                        onChange={(color)=>updateSettings({
                          categoryColors: {
                            ...(settings.categoryColors||{}),
                            expense: {
                              ...(settings.categoryColors?.expense||{}),
                              [cat]: color
                            }
                          }
                        })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        </div>
      )}

      <DocumentModal
        open={!!docModalExpenseId}
        expense={docModalExpense}
        onClose={()=>setDocModalExpenseId(null)}
        onSave={(payload)=>{
          if (!docModalExpenseId) return;
          updateExpense(docModalExpenseId, {
            documentType: payload.documentType,
            documentNumber: payload.documentNumber,
            documentIssuedAt: payload.documentIssuedAt,
            documentNotes: payload.documentNotes,
            documentProvider: payload.documentProvider,
          });
          setDocModalExpenseId(null);
        }}
        onRemove={()=>{
          if (!docModalExpenseId) return;
          const fallbackProvider = docModalExpense?.vendor || "";
          updateExpense(docModalExpenseId, {
            documentType: "sin_respaldo",
            documentNumber: "",
            documentIssuedAt: "",
            documentNotes: "",
            documentProvider: fallbackProvider,
          });
          setDocModalExpenseId(null);
        }}
      />
    </div>
  );
  
}

function accountName(accounts, id){
  return accounts.find(a=>a.id===id)?.name ?? "—";
}

function ListEditor({ title, items, onChange, placeholder }){
  const [value, setValue] = useState("");
  function add(){
    const v = value.trim();
    if (!v) return;
    if (items.includes(v)) return;
    onChange([...items, v]);
    setValue("");
  }
  function remove(item){
    onChange(items.filter(x=>x!==item));
  }
  return (
    <div>
      <div className="muted">Agrega o elimina items. Esto afecta los menús desplegables.</div>
      <div className="hr"></div>
      <div className="row">
        <input value={value} onChange={(e)=>setValue(e.target.value)} placeholder={placeholder} style={{ minWidth: 320 }} />
        <button className="primary" onClick={add}>Agregar</button>
      </div>
      <div className="hr"></div>
      <div className="row" style={{ flexWrap: "wrap" }}>
        {items.map(it=>(
          <span key={it} className="badge">
            {it}{" "}
            <button className="danger" style={{ marginLeft: 8 }} onClick={()=>remove(it)}>x</button>
          </span>
        ))}
        {items.length===0 && <span className="small">Sin items.</span>}
      </div>
    </div>
  );
}

function IncomeForm({ settings, accounts, defaultCategory, defaultAccountId, onAdd }){
  const [category, setCategory] = useState(defaultCategory || settings.incomeCategories[0]);
  const [typePago, setTypePago] = useState(settings.paymentTypes[0] || "Anticipo");
  const [status, setStatus] = useState("Pagado");
  const [dateInvoice, setDateInvoice] = useState(nowISO());
  const [datePaid, setDatePaid] = useState(nowISO());
  const [amount, setAmount] = useState("");
  const [amountPaid, setAmountPaid] = useState("");
  const [note, setNote] = useState("");
  const [accountId, setAccountId] = useState(defaultAccountId || accounts[0]?.id);

  useEffect(()=>{ if (defaultCategory) setCategory(defaultCategory); }, [defaultCategory]);
  useEffect(()=>{ if (defaultAccountId) setAccountId(defaultAccountId); }, [defaultAccountId]);

  function submit(e){
    e.preventDefault();
    const a = parseMoney(amount);
    const ap = parseMoney(amountPaid);

    if (!accountId || !category || !typePago || !a) return;

    onAdd({
      accountId,
      category,
      typePago,
      status,
      dateInvoice,
      datePaid: status === "Pendiente" ? "" : datePaid,
      amount: a,
      amountPaid: status === "Pago parcial" ? ap : 0,
      note
    });

    setAmount("");
    setAmountPaid("");
    setNote("");
  }

  return (
    <form onSubmit={submit}>
      <div className="formGrid">
        <label>Cuenta
          <select value={accountId} onChange={(e)=>setAccountId(e.target.value)}>
            {accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>

        <label>Categoría
          <select value={category} onChange={(e)=>setCategory(e.target.value)}>
            {settings.incomeCategories.map(c=><option key={c} value={c}>{c}</option>)}
          </select>
        </label>

        <label>Tipo de pago
          <select value={typePago} onChange={(e)=>setTypePago(e.target.value)}>
            {settings.paymentTypes.map(t=><option key={t} value={t}>{t}</option>)}
          </select>
        </label>

        <label>Estado
          <select value={status} onChange={(e)=>setStatus(e.target.value)}>
            {["Pagado","Pendiente","Pago parcial"].map(s=><option key={s} value={s}>{s}</option>)}
          </select>
        </label>

        <label>Fecha factura
          <input type="date" value={dateInvoice} onChange={(e)=>setDateInvoice(e.target.value)} />
        </label>

        <label>Fecha pago (si aplica)
          <input type="date" value={datePaid} onChange={(e)=>setDatePaid(e.target.value)} />
        </label>

        <label>Monto (factura/EP)
          <input value={amount} onChange={(e)=>setAmount(e.target.value)} placeholder="ej: 5000000" />
        </label>

        <label>Monto pagado (solo si pago parcial)
          <input value={amountPaid} onChange={(e)=>setAmountPaid(e.target.value)} placeholder="ej: 2500000" disabled={status!=="Pago parcial"} />
        </label>

        <label style={{ gridColumn:"1 / -1" }}>Nota
          <input value={note} onChange={(e)=>setNote(e.target.value)} placeholder="observación" />
        </label>
      </div>

      <div style={{ marginTop:10 }}>
        <button className="primary" type="submit">Agregar ingreso</button>
      </div>
    </form>
  );
}

function ExpenseForm({ settings, accounts, defaultAccountId, activeProject, onAdd }){
  const [scope, setScope] = useState("Proyecto");
  const [projectCategory, setProjectCategory] = useState(activeProject?.category || settings.incomeCategories.find(x=>x.startsWith("OBRA:")) || "");
  const [category, setCategory] = useState(settings.expenseCategoriesProject[0]);
  const [method, setMethod] = useState("Transferencia");
  const [datePaid, setDatePaid] = useState(nowISO());
  const [vendor, setVendor] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [accountId, setAccountId] = useState(defaultAccountId || accounts[0]?.id);

  // TC extra fields
  const [ccCategory, setCCCategory] = useState(settings.creditCardCategories?.[0] || "Otros");

  useEffect(()=>{ if (defaultAccountId) setAccountId(defaultAccountId); }, [defaultAccountId]);
  useEffect(()=>{ if (activeProject?.category) setProjectCategory(activeProject.category); }, [activeProject]);

  useEffect(()=>{
    setCategory(scope==="Oficina" ? settings.expenseCategoriesOffice[0] : settings.expenseCategoriesProject[0]);
  }, [scope, settings.expenseCategoriesOffice, settings.expenseCategoriesProject]);

  function submit(e){
    e.preventDefault();
    const a = parseMoney(amount);
    if (!accountId || !datePaid || !a) return;
    if (scope==="Proyecto" && !projectCategory) return;

    onAdd({
      accountId,
      scope,
      projectCategory: scope==="Proyecto" ? projectCategory : "",
      category,
      method,
      datePaid,
      vendor,
      amount: a,
      note,
      ccCategory: method==="Tarjeta Crédito" ? ccCategory : ""
    });

    setVendor(""); setAmount(""); setNote("");
  }

  return (
    <form onSubmit={submit}>
      <div className="formGrid">
        <label>Cuenta (desde donde sale)
          <select value={accountId} onChange={(e)=>setAccountId(e.target.value)}>
            {accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>

        <label>Alcance
          <select value={scope} onChange={(e)=>setScope(e.target.value)}>
            {["Oficina","Proyecto"].map(s=><option key={s} value={s}>{s}</option>)}
          </select>
        </label>

        {scope==="Proyecto" && (
          <label>Proyecto (categoría)
            <select value={projectCategory} onChange={(e)=>setProjectCategory(e.target.value)}>
              {settings.incomeCategories.filter(x=>x.startsWith("OBRA:")).map(c=><option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        )}

        <label>Categoría
          <select value={category} onChange={(e)=>setCategory(e.target.value)}>
            {(scope==="Oficina" ? settings.expenseCategoriesOffice : settings.expenseCategoriesProject).map(c=>{
              const colors = settings.categoryColors?.expense?.[c];
              const color = Array.isArray(colors) ? colors[0] : colors;
              const style = color ? { backgroundColor: color, color: contrastColor(color) } : undefined;
              return <option key={c} value={c} style={style}>{c}</option>;
            })}
          </select>
        </label>

        <label>Método de pago
          <select value={method} onChange={(e)=>setMethod(e.target.value)}>
            {["Transferencia","Débito","Efectivo","Tarjeta Crédito"].map(m=><option key={m} value={m}>{m}</option>)}
          </select>
        </label>

        <label>Fecha
          <input type="date" value={datePaid} onChange={(e)=>setDatePaid(e.target.value)} />
        </label>

        <label>Proveedor
          <input value={vendor} onChange={(e)=>setVendor(e.target.value)} placeholder="ej: Sodimac / maestro" />
        </label>

        <label>Monto (CLP) — puede ser negativo si es devolución
          <input value={amount} onChange={(e)=>setAmount(e.target.value)} placeholder="ej: 350000 o -50000" />
        </label>

        {method==="Tarjeta Crédito" && (
          <label>Categoría TC
            <select value={ccCategory} onChange={(e)=>setCCCategory(e.target.value)}>
              {settings.creditCardCategories.map(c=><option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        )}

        <label style={{ gridColumn:"1 / -1" }}>Nota
          <input value={note} onChange={(e)=>setNote(e.target.value)} placeholder="glosa" />
        </label>
      </div>

      <div style={{ marginTop:10 }}>
        <button className="primary" type="submit">Agregar egreso</button>
      </div>
    </form>
  );
}

function CCPaymentForm({ accounts, defaultAccountId, onAdd }){
  const [datePaid, setDatePaid] = useState(nowISO());
  const [cardName, setCardName] = useState("TC Principal");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [accountId, setAccountId] = useState(defaultAccountId || accounts[0]?.id);

  useEffect(()=>{ if (defaultAccountId) setAccountId(defaultAccountId); }, [defaultAccountId]);

  function submit(e){
    e.preventDefault();
    const a = parseMoney(amount);
    if (!datePaid || !a || !accountId) return;
    onAdd({ datePaid, cardName, amount: a, note, accountId });
    setAmount(""); setNote("");
  }

  return (
    <form onSubmit={submit}>
      <div className="formGrid">
        <label>Cuenta (desde donde pagas)
          <select value={accountId} onChange={(e)=>setAccountId(e.target.value)}>
            {accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>

        <label>Fecha pago
          <input type="date" value={datePaid} onChange={(e)=>setDatePaid(e.target.value)} />
        </label>

        <label>Tarjeta
          <input value={cardName} onChange={(e)=>setCardName(e.target.value)} />
        </label>

        <label>Monto pagado
          <input value={amount} onChange={(e)=>setAmount(e.target.value)} placeholder="ej: 1800000" />
        </label>

        <label style={{ gridColumn:"1 / -1" }}>Nota
          <input value={note} onChange={(e)=>setNote(e.target.value)} />
        </label>
      </div>

      <div style={{ marginTop:10 }}>
        <button className="primary" type="submit">Registrar pago de TC</button>
      </div>
    </form>
  );
}

function TransferForm({ accounts, defaultFrom, onAdd }){
  const [date, setDate] = useState(nowISO());
  const [fromAccountId, setFrom] = useState(defaultFrom || accounts[0]?.id);
  const [toAccountId, setTo] = useState(accounts[1]?.id || accounts[0]?.id);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  useEffect(()=>{ if (defaultFrom) setFrom(defaultFrom); }, [defaultFrom]);
  function submit(e){
    e.preventDefault();
    const a = parseMoney(amount);
    if (!date || !a || !fromAccountId || !toAccountId) return;
    if (fromAccountId === toAccountId) return;
    onAdd({ date, fromAccountId, toAccountId, amount: a, note });
    setAmount(""); setNote("");
  }

  return (
    <form onSubmit={submit}>
      <div className="formGrid">
        <label>Fecha
          <input type="date" value={date} onChange={(e)=>setDate(e.target.value)} />
        </label>

        <label>Desde cuenta
          <select value={fromAccountId} onChange={(e)=>setFrom(e.target.value)}>
            {accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>

        <label>Hacia cuenta
          <select value={toAccountId} onChange={(e)=>setTo(e.target.value)}>
            {accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>

        <label>Monto
          <input value={amount} onChange={(e)=>setAmount(e.target.value)} placeholder="ej: 200000" />
        </label>

        <label style={{ gridColumn:"1 / -1" }}>Nota
          <input value={note} onChange={(e)=>setNote(e.target.value)} placeholder="ej: recargar caja chica" />
        </label>
      </div>

      <div style={{ marginTop:10 }}>
        <button className="primary" type="submit">Registrar transferencia</button>
      </div>
    </form>
  );
}

function PaymentPlanEditor({ project, paymentTypes, onChange }){
  const plan = project.paymentPlan || [];

  function addRow(){
    const type = paymentTypes[0] || "Anticipo";
    onChange([...plan, { type, pct: 0 }]);
  }
  function updateRow(idx, patch){
    onChange(plan.map((r,i)=> i===idx ? { ...r, ...patch } : r));
  }
  function delRow(idx){
    onChange(plan.filter((_,i)=>i!==idx));
  }

  const totalPct = plan.reduce((a,b)=>a + (Number(b.pct)||0), 0);

  return (
    <div>
      <div className="row" style={{ justifyContent:"space-between" }}>
        <div className="badge">Total % plan: <b style={{ marginLeft:6 }}>{totalPct.toFixed(2)}%</b></div>
        <button className="primary" onClick={addRow} type="button">+ Agregar hito</button>
      </div>

      <div className="hr"></div>

      <table>
        <thead><tr><th>Tipo</th><th>% del contrato</th><th></th></tr></thead>
        <tbody>
          {plan.map((r, idx)=>(
            <tr key={idx}>
              <td>
                <select value={r.type} onChange={(e)=>updateRow(idx, { type: e.target.value })}>
                  {paymentTypes.map(t=><option key={t} value={t}>{t}</option>)}
                </select>
              </td>
              <td>
                <input
                  value={r.pct}
                  onChange={(e)=>updateRow(idx, { pct: parseMoney(e.target.value) })}
                  style={{ width: 140 }}
                />
              </td>
              <td><button className="danger" type="button" onClick={()=>delRow(idx)}>Eliminar</button></td>
            </tr>
          ))}
          {plan.length===0 && <tr><td colSpan={3} className="small">Sin plan definido.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function ProjectPaymentSummary({ project, paymentTypes, receiptsMap }){
  const plan = project.paymentPlan || [];
  const total = project.contractTotal || 0;

  // Consolidar por tipo
  const planByType = new Map();
  plan.forEach(p=>{
    const pct = Number(p.pct)||0;
    planByType.set(p.type, (planByType.get(p.type)||0) + pct);
  });

  const rows = [...planByType.entries()].map(([type, pct])=>{
    const expected = total * (pct/100);
    const received = receiptsMap?.get(type) || 0;
    const pending = expected - received;
    return { type, pct, expected, received, pending };
  });

  // Tipos con ingresos pero sin plan (para detectar)
  const extra = [];
  if (receiptsMap){
    for (const [type, received] of receiptsMap.entries()){
      if (!planByType.has(type) && received !== 0){
        extra.push({ type, pct: 0, expected: 0, received, pending: -received });
      }
    }
  }

  const all = [...rows, ...extra].sort((a,b)=>b.expected - a.expected);

  return (
    <table>
      <thead><tr><th>Tipo</th><th>%</th><th>Monto esperado</th><th>Recibido</th><th>Pendiente</th></tr></thead>
      <tbody>
        {all.map((r, idx)=>(
          <tr key={idx}>
            <td><b>{r.type}</b>{r.expected===0 && r.received>0 ? <div className="small">Sin plan (%=0)</div> : null}</td>
            <td>{r.pct.toFixed(2)}%</td>
            <td>${clp(r.expected)}</td>
            <td>${clp(r.received)}</td>
            <td><b>${clp(r.pending)}</b></td>
          </tr>
        ))}
        {all.length===0 && <tr><td colSpan={5} className="small">Define el plan de pagos y registra ingresos para ver estado.</td></tr>}
      </tbody>
    </table>
  );
}

function DocumentModal({ open, expense, onClose, onSave, onRemove }){
  const [type, setType] = useState("sin_respaldo");
  const [number, setNumber] = useState("");
  const [issuedAt, setIssuedAt] = useState(nowISO());
  const [provider, setProvider] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(()=>{
    if (!open || !expense){
      setType("sin_respaldo");
      setNumber("");
      setIssuedAt(nowISO());
      setProvider("");
      setNotes("");
      return;
    }
    setType(expense.documentType || "sin_respaldo");
    setNumber(expense.documentNumber || "");
    setIssuedAt(expense.documentIssuedAt || expense.datePaid || nowISO());
    setProvider(expense.documentProvider || expense.vendor || "");
    setNotes(expense.documentNotes || "");
  }, [open, expense]);

  if (!open || !expense){
    return null;
  }

  const vendorName = (expense.vendor || "").trim();
  const storedProvider = (expense.documentProvider || "").trim();
  const providerIsCustom = storedProvider && storedProvider !== vendorName;
  const hasExistingDoc = (expense.documentType && expense.documentType !== "sin_respaldo")
    || expense.documentNumber
    || expense.documentIssuedAt
    || expense.documentNotes
    || providerIsCustom;

  function submit(e){
    e.preventDefault();
    const cleanNumber = type === "sin_respaldo" ? "" : number.trim();
    const cleanIssuedAt = type === "sin_respaldo" ? "" : (issuedAt || "");
    const cleanProvider = (provider || vendorName).trim();

    onSave({
      documentType: type,
      documentNumber: cleanNumber,
      documentIssuedAt: cleanIssuedAt,
      documentProvider: cleanProvider,
      documentNotes: notes.trim(),
    });
    onClose();
  }

  function handleRemove(){
    onRemove();
  }

  return (
    <Modal open={open} title={`Documento de respaldo — ${expense.vendor || expense.category}`} onClose={onClose}>
      <form onSubmit={submit} className="col" style={{ gap:12 }}>
        <label>Tipo de documento
          <select value={type} onChange={(e)=>setType(e.target.value)}>
            {DOCUMENT_TYPES.map(opt=>(
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </label>

        <label>Fecha de emisión
          <input type="date" value={issuedAt} onChange={(e)=>setIssuedAt(e.target.value)} />
        </label>

        <label>Número / folio
          <input value={number} onChange={(e)=>setNumber(e.target.value)} placeholder="Ej: 12345" />
        </label>

        <label>Proveedor
          <input value={provider} onChange={(e)=>setProvider(e.target.value)} placeholder="Razón social o proveedor" />
        </label>

        <label>Notas
          <input value={notes} onChange={(e)=>setNotes(e.target.value)} placeholder="Observaciones" />
        </label>

        <div className="row" style={{ justifyContent:"flex-end", gap:8 }}>
          {hasExistingDoc && (
            <button type="button" className="ghost" onClick={()=>{ handleRemove(); onClose(); }}>Quitar documento</button>
          )}
          <button type="submit" className="primary">Guardar documento</button>
        </div>
      </form>
    </Modal>
  );
}

function usePagination(items, page, pageSize = 10){
  return useMemo(()=>{
    const total = items.length;
    const totalPages = total === 0 ? 1 : Math.ceil(total / pageSize);
    const currentPage = Math.min(Math.max(page, 1), totalPages);
    const startIndex = total === 0 ? 0 : (currentPage - 1) * pageSize;
    const endIndex = total === 0 ? 0 : Math.min(startIndex + pageSize, total);
    const pageItems = total === 0 ? [] : items.slice(startIndex, endIndex);
    return { pageItems, total, totalPages, currentPage, startIndex, endIndex, pageSize };
  }, [items, page, pageSize]);
}

function PaginationFooter({ pager, onPrev, onNext }){
  if (!pager || pager.total === 0) return null;
  const rangeLabel = `${pager.startIndex + 1}–${pager.endIndex} de ${pager.total}`;
  const showControls = pager.total > pager.pageSize;
  return (
    <div className="row" style={{ justifyContent:"space-between", alignItems:"center", marginTop:8, flexWrap:"wrap", gap:8 }}>
      <span className="small">{rangeLabel}</span>
      {showControls && (
        <div className="row" style={{ gap:8 }}>
          <button className="ghost" type="button" onClick={onPrev} disabled={pager.currentPage<=1}>← Anterior</button>
          <button className="ghost" type="button" onClick={onNext} disabled={pager.currentPage>=pager.totalPages}>Siguiente →</button>
        </div>
      )}
    </div>
  );
}
