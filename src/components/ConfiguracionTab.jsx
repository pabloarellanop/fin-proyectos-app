import React from "react";
import { Section } from "./shared";
import { ColorPicker } from "./shared";
import { ListEditor } from "./ProjectComponents";
import { contrastColor, formatRut, cleanRut, validarRut } from "../utils";

export default function ConfiguracionTab({ settings, updateSettings }) {
  const rutValue = settings.rutEmpresa || "";
  const rutValid = rutValue ? validarRut(rutValue) : null;

  return (
    <div className="grid" style={{ marginTop: 12 }}>
      <Section title="🏢 Datos de la Empresa">
        <div className="formGrid">
          <label>
            RUT Empresa (para consultas SII)
            <input
              value={rutValue}
              placeholder="Ej: 76.123.456-7"
              onChange={(e) => updateSettings({ rutEmpresa: e.target.value })}
              style={rutValid === false ? { borderColor: '#ef4444' } : rutValid === true ? { borderColor: '#10b981' } : {}}
            />
            {rutValid === false && <span className="fieldError">RUT inválido</span>}
            {rutValid === true && <span style={{ color: '#10b981', fontSize: 11, fontWeight: 600 }}>✓ {formatRut(rutValue)}</span>}
          </label>
        </div>
        <div className="muted" style={{ marginTop: 8 }}>
          Se usa en la pestaña <b>Validación DTE</b> para consultar documentos en el SII.
          La <b>Clave Tributaria</b> se ingresa directamente en esa pestaña y no se almacena.
        </div>
      </Section>

      <Section title="Tipos de pago (hitos) — se usan en Ingresos y Plan de Proyectos">
        <ListEditor
          title="Tipos de pago"
          items={settings.paymentTypes}
          onChange={(items) => updateSettings({ paymentTypes: items })}
          placeholder='ej: "Hito Permiso", "Entrega Anteproyecto"'
        />
      </Section>

      <Section title="Categorías de ingresos (menú desplegable)">
        <ListEditor
          title="Categorías de ingresos"
          items={settings.incomeCategories}
          onChange={(items) => updateSettings({ incomeCategories: items })}
          placeholder='ej: "OBRA: Proyecto X", "Préstamo"'
        />
      </Section>

      <Section title="Categorías de egresos (Oficina)">
        <ListEditor
          title="Egresos Oficina"
          items={settings.expenseCategoriesOffice}
          onChange={(items) => updateSettings({ expenseCategoriesOffice: items })}
          placeholder='ej: "Software", "Telefonía"'
        />
      </Section>

      <Section title="Categorías de egresos (Proyecto)">
        <ListEditor
          title="Egresos Proyecto"
          items={settings.expenseCategoriesProject}
          onChange={(items) => updateSettings({ expenseCategoriesProject: items })}
          placeholder='ej: "Seguridad", "Arriendo bodega"'
        />
      </Section>

      <Section title="Categorías de Tarjeta de Crédito (TC)">
        <ListEditor
          title="Categorías TC"
          items={settings.creditCardCategories}
          onChange={(items) => updateSettings({ creditCardCategories: items })}
          placeholder='ej: "Ferretería", "Logística"'
        />
      </Section>

      <Section title="Colores: Categorías de ingresos">
        <table>
          <thead><tr><th>Categoría</th><th>Color</th></tr></thead>
          <tbody>
            {settings.incomeCategories.map(cat => (
              <tr key={cat}>
                <td>{cat}</td>
                <td>
                  <ColorPicker
                    value={settings.categoryColors?.income?.[cat] || ""}
                    onChange={(color) => updateSettings({
                      categoryColors: {
                        ...(settings.categoryColors || {}),
                        income: { ...(settings.categoryColors?.income || {}), [cat]: color },
                      },
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
            {[...settings.expenseCategoriesOffice, ...settings.expenseCategoriesProject].map(cat => (
              <tr key={cat}>
                <td>{cat}</td>
                <td>
                  <ColorPicker
                    value={settings.categoryColors?.expense?.[cat] || ""}
                    onChange={(color) => updateSettings({
                      categoryColors: {
                        ...(settings.categoryColors || {}),
                        expense: { ...(settings.categoryColors?.expense || {}), [cat]: color },
                      },
                    })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </div>
  );
}
