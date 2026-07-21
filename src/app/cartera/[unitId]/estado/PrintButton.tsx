"use client";

export function PrintButton() {
  return (
    <div className="no-print" style={{ textAlign: "center", padding: "20px 0" }}>
      <button
        onClick={() => window.print()}
        style={{
          background: "#7c5cff",
          color: "#fff",
          border: "none",
          borderRadius: 999,
          padding: "12px 32px",
          fontSize: 14,
          fontWeight: 600,
          cursor: "pointer",
          boxShadow: "0 8px 24px -8px rgba(124,92,255,0.50)",
        }}
      >
        Imprimir / Guardar como PDF
      </button>
      <p style={{ color: "#9ca3af", fontSize: 12, marginTop: 10 }}>
        En el diálogo de impresión elige &quot;Guardar como PDF&quot; para descargarlo.
      </p>
    </div>
  );
}
