import React, { useState, useEffect } from "react";
import { Modal } from "./shared";
import { DOCUMENT_TYPES, nowISO } from "../utils";

export default function DocumentModal({ open, expense, onClose, onSave, onRemove }) {
  const [type, setType] = useState("sin_respaldo");
  const [number, setNumber] = useState("");
  const [issuedAt, setIssuedAt] = useState(nowISO());
  const [provider, setProvider] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open || !expense) {
      setType("sin_respaldo"); setNumber(""); setIssuedAt(nowISO()); setProvider(""); setNotes("");
      return;
    }
    setType(expense.documentType || "sin_respaldo");
    setNumber(expense.documentNumber || "");
    setIssuedAt(expense.documentIssuedAt || expense.datePaid || nowISO());
    setProvider(expense.documentProvider || expense.vendor || "");
    setNotes(expense.documentNotes || "");
  }, [open, expense]);

  if (!open || !expense) return null;

  const vendorName = (expense.vendor || "").trim();
  const storedProvider = (expense.documentProvider || "").trim();
  const providerIsCustom = storedProvider && storedProvider !== vendorName;
  const hasExistingDoc = (expense.documentType && expense.documentType !== "sin_respaldo")
    || expense.documentNumber || expense.documentIssuedAt || expense.documentNotes || providerIsCustom;

  function submit(e) {
    e.preventDefault();
    const cleanNumber = type === "sin_respaldo" ? "" : number.trim();
    const cleanIssuedAt = type === "sin_respaldo" ? "" : (issuedAt || "");
    const cleanProvider = (provider || vendorName).trim();
    onSave({
      documentType: type, documentNumber: cleanNumber,
      documentIssuedAt: cleanIssuedAt, documentProvider: cleanProvider, documentNotes: notes.trim(),
    });
    onClose();
  }

  return (
    <Modal open={open} title={`Documento de respaldo — ${expense.vendor || expense.category}`} onClose={onClose}>
      <form onSubmit={submit} className="col" style={{ gap: 12 }}>
        <label>Tipo de documento
          <select value={type} onChange={(e) => setType(e.target.value)}>
            {DOCUMENT_TYPES.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
        </label>
        <label>Fecha de emisión
          <input type="date" value={issuedAt} onChange={(e) => setIssuedAt(e.target.value)} />
        </label>
        <label>Número / folio
          <input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="Ej: 12345" />
        </label>
        <label>Proveedor
          <input value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="Razón social o proveedor" />
        </label>
        <label>Notas
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observaciones" />
        </label>
        <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
          {hasExistingDoc && (
            <button type="button" className="ghost" onClick={() => { onRemove(); onClose(); }}>Quitar documento</button>
          )}
          <button type="submit" className="primary">Guardar documento</button>
        </div>
      </form>
    </Modal>
  );
}
