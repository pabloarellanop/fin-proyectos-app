// ── Shared utilities ──

export const STORE_KEY = "fin-app-state";

export function uid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).substr(2, 9);
}

export const COLOR_PALETTE = [
  "#06b6d4","#0ea5e9","#2563eb","#1e40af","#7c3aed","#8b5cf6",
  "#9333ea","#a855f7","#db2777","#f472b6","#e11d48","#ef4444",
  "#f97316","#f59e0b","#facc15","#84cc16","#10b981","#14b8a6",
];

export const DOCUMENT_TYPES = [
  { value: "sin_respaldo", label: "Sin respaldo" },
  { value: "boleta", label: "Boleta" },
  { value: "boleta_honorarios", label: "Boleta de honorarios" },
  { value: "factura_afecta", label: "Factura afecta IVA" },
  { value: "factura_exenta", label: "Factura exenta" },
  { value: "nota_credito", label: "Nota de crédito" },
];

export const PAGE_SIZE = 10;

export function nowISO() {
  return new Date().toISOString().slice(0, 10);
}

export function parseMoney(x) {
  const n = Number(String(x ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function monthLabel(yyyyMM) {
  if (!yyyyMM || yyyyMM === "ALL") return "Todos";
  const [y, m] = yyyyMM.split("-").map(Number);
  const names = [
    "Enero","Febrero","Marzo","Abril","Mayo","Junio",
    "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
  ];
  return `${names[(m || 1) - 1]} ${y}`;
}

export function clp(n) {
  const v = Number.isFinite(n) ? n : 0;
  return v.toLocaleString("es-CL");
}

export function monthKey(dateISO) {
  return (dateISO || "").slice(0, 7);
}

export function sortByDate(a, b) {
  return String(a || "").localeCompare(String(b || ""));
}

export function load() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) ?? null; } catch { return null; }
}

export function save(state) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
}

export function documentTypeLabel(type) {
  const found = DOCUMENT_TYPES.find(opt => opt.value === type);
  return found ? found.label : "Sin respaldo";
}

export function contrastColor(hex) {
  if (!hex || typeof hex !== "string") return "#000";
  const c = hex.replace("#", "");
  const r = parseInt(c.length === 3 ? c[0] + c[0] : c.slice(0, 2), 16);
  const g = parseInt(c.length === 3 ? c[1] + c[1] : c.slice(2, 4), 16);
  const b = parseInt(c.length === 3 ? c[2] + c[2] : c.slice(4, 6), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 128 ? "#000" : "#fff";
}

export function autoCells(n) {
  const fills = ["#1f2a44","#334155","#475569","#64748b","#0f172a","#6b7280","#111827","#94a3b8"];
  return Array.from({ length: n }, (_, i) => fills[i % fills.length]);
}

export function accountName(accounts, id) {
  return accounts.find(a => a.id === id)?.name ?? "—";
}

// ── RUT validation (Chilean módulo 11) ──

export function cleanRut(rut) {
  return String(rut || "").replace(/[^0-9kK]/g, "").toUpperCase();
}

export function calcularDV(rutBody) {
  let sum = 0;
  let mul = 2;
  const digits = String(rutBody).split("").reverse();
  for (const d of digits) {
    sum += Number(d) * mul;
    mul = mul === 7 ? 2 : mul + 1;
  }
  const remainder = 11 - (sum % 11);
  if (remainder === 11) return "0";
  if (remainder === 10) return "K";
  return String(remainder);
}

export function validarRut(rut) {
  const clean = cleanRut(rut);
  if (clean.length < 2) return false;
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  if (!/^\d+$/.test(body)) return false;
  if (Number(body) < 1000000) return false;
  return calcularDV(body) === dv;
}

export function formatRut(rut) {
  const clean = cleanRut(rut);
  if (clean.length < 2) return rut;
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  const formatted = body.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${formatted}-${dv}`;
}

// ── IVA (Chile 19%) ──

export const IVA_RATE = 0.19;

export function calcIVA(montoTotal) {
  const neto = Math.round(montoTotal / (1 + IVA_RATE));
  const iva = montoTotal - neto;
  return { neto, iva };
}
