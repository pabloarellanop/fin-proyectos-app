import React, { useState, useMemo } from "react";
import { Section, Modal, PaginationFooter } from "./shared";
import { usePagination } from "../hooks/usePagination";
import { clp, uid, parseMoney, nowISO, accountName, validarRut, formatRut } from "../utils";

/* ─── Proveedor Form ─── */
function ProveedorForm({ onAdd, existingNames }) {
  const [name, setName] = useState("");
  const [rut, setRut] = useState("");
  const [giro, setGiro] = useState("");
  const [contact, setContact] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [errors, setErrors] = useState({});
  const [attempted, setAttempted] = useState(false);

  function validate() {
    const e = {};
    if (!name.trim()) e.name = "Requerido";
    if (name.trim() && existingNames.includes(name.trim().toLowerCase())) e.name = "Ya existe";
    if (rut.trim() && !validarRut(rut)) e.rut = "RUT inválido (verificar dígito)";
    return e;
  }

  function submit(ev) {
    ev.preventDefault();
    setAttempted(true);
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length) return;
    onAdd({ name: name.trim(), rut: rut.trim(), giro: giro.trim(), contact: contact.trim(), phone: phone.trim(), email: email.trim(), address: address.trim() });
    setName(""); setRut(""); setGiro(""); setContact(""); setPhone(""); setEmail(""); setAddress("");
    setAttempted(false); setErrors({});
  }

  const fs = (f) => attempted && errors[f] ? { borderColor: "#ef4444" } : {};

  return (
    <form onSubmit={submit}>
      <div className="formGrid">
        <label>Nombre / Razón social *
          <input value={name} onChange={e => setName(e.target.value)} style={fs("name")} placeholder="ej: Ferretería Central" />
          {attempted && errors.name && <span className="fieldError">{errors.name}</span>}
        </label>
        <label>RUT
          <input value={rut} onChange={e => setRut(e.target.value)} onBlur={() => { if (rut.trim()) setRut(formatRut(rut)); }} placeholder="ej: 76.123.456-7" style={fs("rut")} />
          {attempted && errors.rut && <span className="fieldError">{errors.rut}</span>}
        </label>
        <label>Giro
          <input value={giro} onChange={e => setGiro(e.target.value)} placeholder="ej: Venta de materiales" />
        </label>
        <label>Contacto
          <input value={contact} onChange={e => setContact(e.target.value)} placeholder="Nombre contacto" />
        </label>
        <label>Teléfono
          <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+56 9 ..." />
        </label>
        <label>Email
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@proveedor.cl" />
        </label>
        <label>Dirección
          <input value={address} onChange={e => setAddress(e.target.value)} placeholder="Dirección" />
        </label>
      </div>
      <button className="primary" type="submit" style={{ marginTop: 10 }}>+ Agregar proveedor</button>
    </form>
  );
}

/* ─── Proveedor Edit Modal ─── */
function ProveedorEditModal({ open, proveedor, onClose, onSave, onDelete }) {
  const [form, setForm] = useState({});

  React.useEffect(() => {
    if (proveedor) setForm({ ...proveedor });
  }, [proveedor]);

  if (!open || !proveedor) return null;

  function handleSave() {
    onSave(proveedor.id, form);
    onClose();
  }

  return (
    <Modal open={open} title="Editar proveedor" onClose={onClose}>
      <div className="formGrid">
        <label>Nombre
          <input value={form.name || ""} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        </label>
        <label>RUT
          <input value={form.rut || ""} onChange={e => setForm(f => ({ ...f, rut: e.target.value }))} onBlur={() => { if (form.rut) setForm(f => ({ ...f, rut: formatRut(f.rut) })); }} />
          {form.rut && !validarRut(form.rut) && <span className="fieldError">RUT inválido</span>}
        </label>
        <label>Giro
          <input value={form.giro || ""} onChange={e => setForm(f => ({ ...f, giro: e.target.value }))} />
        </label>
        <label>Contacto
          <input value={form.contact || ""} onChange={e => setForm(f => ({ ...f, contact: e.target.value }))} />
        </label>
        <label>Teléfono
          <input value={form.phone || ""} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
        </label>
        <label>Email
          <input value={form.email || ""} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
        </label>
        <label>Dirección
          <input value={form.address || ""} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
        </label>
      </div>
      <div className="row" style={{ justifyContent: "space-between", marginTop: 12 }}>
        <button className="danger" onClick={() => { onDelete(proveedor.id); onClose(); }}>Eliminar</button>
        <button className="primary" onClick={handleSave}>Guardar</button>
      </div>
    </Modal>
  );
}

/* ─── Orden de Compra Form ─── */
function OrdenCompraForm({ projects, proveedores, onAdd }) {
  const [projectId, setProjectId] = useState(projects[0]?.id || "");
  const [proveedorId, setProveedorId] = useState(proveedores[0]?.id || "");
  const [date, setDate] = useState(nowISO());
  const [description, setDescription] = useState("");
  const [items, setItems] = useState([{ description: "", quantity: 1, unitPrice: 0 }]);
  const [errors, setErrors] = useState({});
  const [attempted, setAttempted] = useState(false);

  function addItem() { setItems([...items, { description: "", quantity: 1, unitPrice: 0 }]); }
  function updateItem(idx, patch) { setItems(items.map((it, i) => i === idx ? { ...it, ...patch } : it)); }
  function removeItem(idx) { setItems(items.filter((_, i) => i !== idx)); }

  const total = items.reduce((a, it) => a + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0), 0);

  function validate() {
    const e = {};
    if (!projectId) e.projectId = "Selecciona proyecto";
    if (!proveedorId) e.proveedorId = "Selecciona proveedor";
    if (!date) e.date = "Selecciona fecha";
    if (items.length === 0 || items.every(it => !it.description.trim())) e.items = "Agrega al menos un ítem";
    return e;
  }

  function submit(ev) {
    ev.preventDefault();
    setAttempted(true);
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length) return;
    onAdd({
      projectId, proveedorId, date, description: description.trim(),
      items: items.filter(it => it.description.trim()),
      total,
      status: "Pendiente",
    });
    setDescription(""); setItems([{ description: "", quantity: 1, unitPrice: 0 }]);
    setAttempted(false); setErrors({});
  }

  const fs = (f) => attempted && errors[f] ? { borderColor: "#ef4444" } : {};

  return (
    <form onSubmit={submit}>
      <div className="formGrid">
        <label>Proyecto
          <select value={projectId} onChange={e => setProjectId(e.target.value)} style={fs("projectId")}>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {attempted && errors.projectId && <span className="fieldError">{errors.projectId}</span>}
        </label>
        <label>Proveedor
          <select value={proveedorId} onChange={e => setProveedorId(e.target.value)} style={fs("proveedorId")}>
            {proveedores.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {attempted && errors.proveedorId && <span className="fieldError">{errors.proveedorId}</span>}
        </label>
        <label>Fecha
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={fs("date")} />
        </label>
        <label>Descripción general
          <input value={description} onChange={e => setDescription(e.target.value)} placeholder="ej: Compra materiales partida X" />
        </label>
      </div>

      <div className="hr" />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span className="h2" style={{ margin: 0 }}>Ítems de la orden</span>
        <button type="button" className="primary" onClick={addItem}>+ Ítem</button>
      </div>
      {attempted && errors.items && <div className="fieldError" style={{ marginBottom: 6 }}>{errors.items}</div>}

      <table>
        <thead><tr><th>Descripción</th><th>Cant.</th><th>P. Unitario</th><th>Subtotal</th><th></th></tr></thead>
        <tbody>
          {items.map((it, idx) => (
            <tr key={idx}>
              <td><input value={it.description} onChange={e => updateItem(idx, { description: e.target.value })} placeholder="Material o servicio" /></td>
              <td><input type="number" value={it.quantity} onChange={e => updateItem(idx, { quantity: Number(e.target.value) || 0 })} style={{ width: 70 }} /></td>
              <td><input value={it.unitPrice} onChange={e => updateItem(idx, { unitPrice: parseMoney(e.target.value) })} style={{ width: 110 }} /></td>
              <td>${clp((Number(it.quantity) || 0) * (Number(it.unitPrice) || 0))}</td>
              <td>{items.length > 1 && <button type="button" className="danger" onClick={() => removeItem(idx)}>×</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ textAlign: "right", fontWeight: 700, marginTop: 6 }}>Total: ${clp(total)}</div>

      <button className="primary" type="submit" style={{ marginTop: 10 }}>Crear Orden de Compra</button>
    </form>
  );
}

/* ─── Cotización Form ─── */
function CotizacionForm({ proveedores, onAdd }) {
  const [proveedorId, setProveedorId] = useState(proveedores[0]?.id || "");
  const [date, setDate] = useState(nowISO());
  const [itemDesc, setItemDesc] = useState("");
  const [amount, setAmount] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [note, setNote] = useState("");

  function submit(ev) {
    ev.preventDefault();
    if (!itemDesc.trim() || !parseMoney(amount)) return;
    onAdd({
      proveedorId, date, itemDescription: itemDesc.trim(),
      amount: parseMoney(amount), validUntil, note: note.trim(),
    });
    setItemDesc(""); setAmount(""); setNote(""); setValidUntil("");
  }

  return (
    <form onSubmit={submit}>
      <div className="formGrid">
        <label>Proveedor
          <select value={proveedorId} onChange={e => setProveedorId(e.target.value)}>
            {proveedores.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label>Fecha cotización
          <input type="date" value={date} onChange={e => setDate(e.target.value)} />
        </label>
        <label>Ítem / Descripción *
          <input value={itemDesc} onChange={e => setItemDesc(e.target.value)} placeholder="ej: Cemento portland 42.5" />
        </label>
        <label>Monto total *
          <input value={amount} onChange={e => setAmount(e.target.value)} placeholder="ej: 350000" />
        </label>
        <label>Válida hasta
          <input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} />
        </label>
        <label>Nota
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="Condiciones, tiempo entrega..." />
        </label>
      </div>
      <button className="primary" type="submit" style={{ marginTop: 10 }}>+ Agregar cotización</button>
    </form>
  );
}

/* ─── Main Tab ─── */
export default function ProveedoresTab({
  state, proveedores, addProveedor, updateProveedor, delProveedor,
  ordenes, addOrden, updateOrden, delOrden,
  cotizaciones, addCotizacion, delCotizacion,
  cashTransactions,
}) {
  const [editId, setEditId] = useState(null);
  const [search, setSearch] = useState("");
  const [provPage, setProvPage] = useState(1);
  const [ordPage, setOrdPage] = useState(1);
  const [cotView, setCotView] = useState("");

  const editProv = proveedores.find(p => p.id === editId) || null;

  const existingNames = useMemo(() => proveedores.map(p => (p.name || "").toLowerCase()), [proveedores]);
  const provName = (id) => proveedores.find(p => p.id === id)?.name || "—";
  const projName = (id) => state.projects.find(p => p.id === id)?.name || "—";

  // Filtered proveedores
  const filteredProv = useMemo(() => {
    if (!search) return proveedores;
    const q = search.toLowerCase();
    return proveedores.filter(p =>
      (p.name || "").toLowerCase().includes(q) ||
      (p.rut || "").toLowerCase().includes(q) ||
      (p.giro || "").toLowerCase().includes(q) ||
      (p.contact || "").toLowerCase().includes(q)
    );
  }, [proveedores, search]);

  const provPager = usePagination(filteredProv, provPage, 10);

  // Spend by proveedor (from expenses with vendor matching proveedor name)
  const spendByProv = useMemo(() => {
    const map = new Map();
    state.expenses.forEach(e => {
      const v = (e.vendor || "").trim().toLowerCase();
      if (!v) return;
      const match = proveedores.find(p => (p.name || "").toLowerCase() === v);
      if (match) map.set(match.id, (map.get(match.id) || 0) + (Number(e.amount) || 0));
    });
    return map;
  }, [state.expenses, proveedores]);

  // Sorted ordenes
  const sortedOrdenes = useMemo(() => [...ordenes].sort((a, b) => (b.date || "").localeCompare(a.date || "")), [ordenes]);
  const ordPager = usePagination(sortedOrdenes, ordPage, 8);

  // Cotizaciones grouped by item
  const cotItems = useMemo(() => {
    const map = new Map();
    cotizaciones.forEach(c => {
      const key = (c.itemDescription || "").toLowerCase();
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(c);
    });
    return [...map.entries()].map(([item, quotes]) => ({
      item: quotes[0].itemDescription,
      quotes: quotes.sort((a, b) => (Number(a.amount) || 0) - (Number(b.amount) || 0)),
    }));
  }, [cotizaciones]);

  return (
    <div style={{ marginTop: 12 }}>
      <div className="grid">
        {/* Formulario nuevo proveedor */}
        <Section title="Nuevo proveedor">
          <ProveedorForm onAdd={addProveedor} existingNames={existingNames} />
        </Section>

        {/* Ranking de proveedores */}
        <Section title="Top proveedores por gasto">
          {(() => {
            const ranked = proveedores
              .map(p => ({ ...p, spent: spendByProv.get(p.id) || 0 }))
              .filter(p => p.spent > 0)
              .sort((a, b) => b.spent - a.spent)
              .slice(0, 10);
            if (ranked.length === 0) return <div className="muted">Sin datos de gasto por proveedor. Usa el campo "Proveedor" en egresos.</div>;
            return (
              <table>
                <thead><tr><th>#</th><th>Proveedor</th><th>Gasto total</th></tr></thead>
                <tbody>
                  {ranked.map((p, i) => (
                    <tr key={p.id}>
                      <td><b>{i + 1}</b></td>
                      <td>{p.name}</td>
                      <td><b>${clp(p.spent)}</b></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            );
          })()}
        </Section>

        {/* Directorio */}
        <Section title="Directorio de proveedores">
          <div className="searchBar">
            <input
              type="text"
              placeholder="🔍 Buscar proveedor..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="searchInput"
            />
          </div>
          <table>
            <thead><tr><th>Nombre</th><th>RUT</th><th>Giro</th><th>Contacto</th><th>Teléfono</th><th>Gasto</th></tr></thead>
            <tbody>
              {provPager.pageItems.map(p => (
                <tr key={p.id} onClick={() => setEditId(p.id)} style={{ cursor: "pointer" }}>
                  <td><b>{p.name}</b></td>
                  <td className="small">{p.rut || "—"}</td>
                  <td className="small">{p.giro || "—"}</td>
                  <td className="small">{p.contact || "—"}{p.email ? <div>{p.email}</div> : null}</td>
                  <td className="small">{p.phone || "—"}</td>
                  <td><b>${clp(spendByProv.get(p.id) || 0)}</b></td>
                </tr>
              ))}
              {provPager.total === 0 && <tr><td colSpan={6} className="small">{search ? "Sin resultados." : "Sin proveedores."}</td></tr>}
            </tbody>
          </table>
          <PaginationFooter pager={provPager} onPrev={() => setProvPage(p => Math.max(1, p - 1))} onNext={() => setProvPage(p => p + 1)} />
        </Section>

        {/* Órdenes de compra */}
        <Section title="Nueva orden de compra">
          {proveedores.length === 0 ? (
            <div className="muted">Primero agrega un proveedor.</div>
          ) : (
            <OrdenCompraForm projects={state.projects} proveedores={proveedores} onAdd={addOrden} />
          )}
        </Section>

        <Section title="Órdenes de compra">
          <table>
            <thead><tr><th>N°</th><th>Fecha</th><th>Proyecto</th><th>Proveedor</th><th>Total</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              {ordPager.pageItems.map((o, idx) => (
                <tr key={o.id}>
                  <td><b>OC-{String(ordenes.indexOf(o) + 1).padStart(3, "0")}</b></td>
                  <td>{o.date}</td>
                  <td>{projName(o.projectId)}</td>
                  <td>{provName(o.proveedorId)}</td>
                  <td><b>${clp(o.total)}</b></td>
                  <td>
                    <select
                      value={o.status}
                      onChange={e => updateOrden(o.id, { status: e.target.value })}
                      className={o.status === "Completada" ? "" : o.status === "Pendiente" ? "" : ""}
                    >
                      {["Pendiente", "Aprobada", "En camino", "Recibida", "Completada", "Cancelada"].map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </td>
                  <td><button className="danger" onClick={() => delOrden(o.id)}>×</button></td>
                </tr>
              ))}
              {ordPager.total === 0 && <tr><td colSpan={7} className="small">Sin órdenes.</td></tr>}
            </tbody>
          </table>
          <PaginationFooter pager={ordPager} onPrev={() => setOrdPage(p => Math.max(1, p - 1))} onNext={() => setOrdPage(p => p + 1)} />
        </Section>

        {/* Cotizaciones */}
        <Section title="Nueva cotización">
          {proveedores.length === 0 ? (
            <div className="muted">Primero agrega un proveedor.</div>
          ) : (
            <CotizacionForm proveedores={proveedores} onAdd={addCotizacion} />
          )}
        </Section>

        <Section title="Comparador de cotizaciones">
          <div className="muted" style={{ marginBottom: 8 }}>
            Agrega cotizaciones del mismo ítem de diferentes proveedores para compararlas.
          </div>
          {cotItems.length === 0 ? (
            <div className="small">Sin cotizaciones aún.</div>
          ) : (
            <div>
              <div className="pillRow" style={{ marginBottom: 10 }}>
                {cotItems.map(ci => (
                  <button
                    key={ci.item}
                    className={"pill " + (cotView === ci.item ? "active" : "")}
                    onClick={() => setCotView(cotView === ci.item ? "" : ci.item)}
                  >
                    {ci.item} ({ci.quotes.length})
                  </button>
                ))}
              </div>
              {cotItems.filter(ci => !cotView || ci.item === cotView).map(ci => (
                <div key={ci.item} style={{ marginBottom: 16 }}>
                  <div className="h2">{ci.item}</div>
                  <table>
                    <thead><tr><th>Proveedor</th><th>Monto</th><th>Fecha</th><th>Válida hasta</th><th>Nota</th><th>Mejor</th><th></th></tr></thead>
                    <tbody>
                      {ci.quotes.map((q, qi) => (
                        <tr key={q.id}>
                          <td>{provName(q.proveedorId)}</td>
                          <td><b>${clp(q.amount)}</b></td>
                          <td className="small">{q.date}</td>
                          <td className="small">{q.validUntil || "—"}</td>
                          <td className="small">{q.note || "—"}</td>
                          <td>{qi === 0 ? <span className="badge ok">Mejor precio</span> : <span className="badge">{`+$${clp(q.amount - ci.quotes[0].amount)}`}</span>}</td>
                          <td><button className="danger" onClick={() => delCotizacion(q.id)}>×</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>

      <ProveedorEditModal
        open={!!editId}
        proveedor={editProv}
        onClose={() => setEditId(null)}
        onSave={updateProveedor}
        onDelete={delProveedor}
      />
    </div>
  );
}
