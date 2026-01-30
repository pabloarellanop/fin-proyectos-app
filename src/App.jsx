import React, { useEffect, useMemo, useState } from "react";
import Auth from "./Auth";
import { supabase, WORKSPACE_ID } from "./supabaseClient";
import {
  PieChart, Pie, Cell, Tooltip as RTooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer
} from "recharts";

const STORE_KEY = "fin_proyectos_v2";

function uid(){ return crypto.randomUUID(); }
const COLOR_PALETTE = [
  "#16a34a", // verde
  "#22c55e", // verde claro
  "#0ea5e9", // azul
  "#2563eb", // azul fuerte
  "#7c3aed", // violeta
  "#9333ea", // morado
  "#db2777", // fucsia
  "#e11d48", // rojo
  "#f97316", // naranjo
  "#f59e0b", // ámbar
  "#84cc16", // lima
  "#14b8a6", // teal
  "#64748b", // gris
  "#334155", // gris oscuro
  "#111827", // casi negro
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



function badgeStatus(text){
  const t = String(text||"");
  if (t === "Pagado") return "ok";
  if (t === "Parcial") return "warn";
  if (t === "Pendiente") return "bad";
  if (t === "Pago parcial") return "warn";
  return "";
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
 const [state, setState] = useState(DEFAULT_STATE);

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
  const [dashMonth, setDashMonth] = useState(monthKey(new Date().toISOString()));


  // Modal “Registrar…”
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickMode, setQuickMode] = useState("Ingreso"); // Ingreso | Gasto | Transferencia


  

  const settings = state.settings;
  const activeProject = state.projects.find(p=>p.id===activeProjectId) ?? state.projects[0];
  const activeAccount = state.accounts.find(a=>a.id===activeAccountId) ?? state.accounts[0];

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
    setState(prev=>({ ...prev, projects: [...prev.projects, p] }));
    setActiveProjectId(p.id);
    setTab("Proyectos");
  }
  function updateProject(projectId, patch){
    setState(prev=>({
      ...prev,
      projects: prev.projects.map(p=>p.id===projectId ? { ...p, ...patch } : p)
    }));
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
      const next = { ...prev, expenses: [{ id: uid(), ...row }, ...prev.expenses] };
      if (row.method === "Tarjeta Crédito"){
        next.ccPurchases = [{
          id: uid(),
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
  function delExpense(id){
    setState(prev=>({ ...prev, expenses: prev.expenses.filter(x=>x.id!==id) }));
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
  // Caja: transacciones reales
  // =========================
  const cashTransactions = useMemo(()=>{
    // Ingresos a caja: pagado/pago parcial en fecha de pago
    const incomeTx = state.incomes
      .filter(x=>x.status === "Pagado" || x.status === "Pago parcial")
      .map(x=>({
        kind:"Ingreso",
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
        { kind:"Egreso", date: tr.date, amount: tr.amount, category:"Transferencia", projectCategory:"Oficina", accountId: tr.fromAccountId, note:`A ${accountName(state.accounts, tr.toAccountId)}` },
        { kind:"Ingreso", date: tr.date, amount: tr.amount, category:"Transferencia", projectCategory:"Oficina", accountId: tr.toAccountId, note:`Desde ${accountName(state.accounts, tr.fromAccountId)}` },
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
  const tx = dashboardTx.slice().sort((a,b)=>sortByDate(b.date,a.date));
    if (dashMonth === "ALL") return tx;
   return tx.filter(t => monthKey(t.date) === dashMonth);
  }, [dashboardTx, dashMonth]);

  const kpis = useMemo(()=>{
  const totalIncome = dashboardTxMonth.filter(t=>t.kind==="Ingreso").reduce((a,b)=>a+b.amount,0);
  const totalExpense = dashboardTxMonth.filter(t=>t.kind==="Egreso").reduce((a,b)=>a+b.amount,0);
  const net = totalIncome - totalExpense;
  const ccOutstanding = state.ccPurchases.filter(c=>!c.isPaid).reduce((a,b)=>a+b.amount,0);
  return { totalIncome, totalExpense, net, ccOutstanding };
}, [dashboardTxMonth, state.ccPurchases]);

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
  const tabs = ["Dashboard","Ingresos","Egresos","Tarjeta Crédito","Flujo de Caja","Proyectos","Configuración"];

  
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
        <div className="brand">Finanzas Proyectos vTEST-1</div>

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
          <button className="ghost" onClick={async ()=>{ await supabase.auth.signOut(); window.location.reload(); }}>Cerrar sesión</button>
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
                <div className="label">TC pendiente (compras no pagadas)</div>
                <div className="value">${clp(kpis.ccOutstanding)}</div>
              </div>
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
                          const color = state.settings.categoryColors?.expense?.[name];
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
                          const color = state.settings.categoryColors?.income?.[name];
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
             <div className="row">
               <label className="small">Mes</label>
               <select value={dashMonth} onChange={(e)=>setDashMonth(e.target.value)}>
                 {dashboardMonths.map(m=>(
                    <option key={m} value={m}>
                      {monthLabel(m)}
                    </option>
                  ))}
                </select>
              </div>
           }
          >
            <table>
              <thead>
                <tr><th>Fecha</th><th>Tipo</th><th>Monto</th><th>Cuenta</th><th>Categoría</th><th>Nota</th></tr>
              </thead>
              <tbody>
                {dashboardTxMonth
                 .slice(0, 30) // puedes ajustar 14, 20, 30
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
                     <td>{t.category}</td>
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

          <Section title="Ingresos recientes (editable)">
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
                    <td>{x.category}</td>
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

          <Section title="Egresos recientes">
            <table>
              <thead>
                <tr><th>Fecha</th><th>Cuenta</th><th>Alcance</th><th>Centro</th><th>Categoría</th><th>Método</th><th>Monto</th><th></th></tr>
              </thead>
              <tbody>
                {state.expenses.slice(0,22).map(x=>(
                  <tr key={x.id}>
                    <td>{x.datePaid}</td>
                    <td>{accountName(state.accounts, x.accountId)}</td>
                    <td>{x.scope}</td>
                    <td>{x.scope==="Proyecto" ? x.projectCategory : "Oficina"}</td>
                    <td>{x.category}</td>
                    <td>{x.method}</td>
                    <td>${clp(x.amount)}</td>
                    <td><button className="danger" onClick={()=>delExpense(x.id)}>Eliminar</button></td>
                  </tr>
                ))}
                {state.expenses.length===0 && <tr><td colSpan={8} className="small">Sin egresos.</td></tr>}
              </tbody>
            </table>
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

          <Section title="Transferencias entre cuentas">
            <div className="muted">Se registran desde Dashboard → Registrar… → Transferencia.</div>
            <div className="hr"></div>
            <table>
              <thead><tr><th>Fecha</th><th>Desde</th><th>Hacia</th><th>Monto</th><th>Nota</th><th></th></tr></thead>
              <tbody>
                {state.transfers.slice(0,12).map(tr=>(
                  <tr key={tr.id}>
                    <td>{tr.date}</td>
                    <td>{accountName(state.accounts, tr.fromAccountId)}</td>
                    <td>{accountName(state.accounts, tr.toAccountId)}</td>
                    <td>${clp(tr.amount)}</td>
                    <td className="small">{tr.note}</td>
                    <td><button className="danger" onClick={()=>delTransfer(tr.id)}>Eliminar</button></td>
                  </tr>
                ))}
                {state.transfers.length===0 && <tr><td colSpan={6} className="small">Sin transferencias registradas.</td></tr>}
              </tbody>
            </table>
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
            value={settings.categoryColors?.income?.[cat]}
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
            {(scope==="Oficina" ? settings.expenseCategoriesOffice : settings.expenseCategoriesProject).map(c=><option key={c} value={c}>{c}</option>)}
          </select>
        </label>

        <label>Método de pago
          <select value={method} onChange={(e)=>setMethod(e.target.value)}>
            {["Transferencia","Efectivo","Tarjeta Crédito"].map(m=><option key={m} value={m}>{m}</option>)}
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
