import React from "react";
import { COLOR_PALETTE } from "../utils";

export function Section({ title, right, children }) {
  return (
    <div className="card">
      <div className="sectionHeader">
        <div className="h2">{title}</div>
        <div>{right}</div>
      </div>
      {children}
    </div>
  );
}

export function Modal({ open, title, onClose, children }) {
  if (!open) return null;
  return (
    <div className="modalOverlay" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modalHeader">
          <div className="modalTitle">{title}</div>
          <button onClick={onClose}>Cerrar</button>
        </div>
        <div style={{ marginTop: 10 }}>{children}</div>
      </div>
    </div>
  );
}

export function ColorPicker({ value, onChange }) {
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

export function PaginationFooter({ pager, onPrev, onNext }) {
  if (!pager || pager.total === 0) return null;
  const rangeLabel = `${pager.startIndex + 1}–${pager.endIndex} de ${pager.total}`;
  const showControls = pager.total > pager.pageSize;
  return (
    <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginTop: 8, flexWrap: "wrap", gap: 8 }}>
      <span className="small">{rangeLabel}</span>
      {showControls && (
        <div className="row" style={{ gap: 8 }}>
          <button className="ghost" type="button" onClick={onPrev} disabled={pager.currentPage <= 1}>← Anterior</button>
          <button className="ghost" type="button" onClick={onNext} disabled={pager.currentPage >= pager.totalPages}>Siguiente →</button>
        </div>
      )}
    </div>
  );
}
