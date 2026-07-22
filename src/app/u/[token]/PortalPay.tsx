"use client";

import { useState } from "react";

declare global {
  interface Window {
    ePayco?: {
      checkout: {
        configure: (opts: { key: string; test: boolean }) => {
          open: (data: Record<string, string>) => void;
        };
      };
    };
  }
}

function loadCheckout(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.ePayco) return resolve();
    const existing = document.querySelector<HTMLScriptElement>('script[data-epayco="1"]');
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("load")));
      return;
    }
    const s = document.createElement("script");
    s.src = "https://checkout.epayco.co/checkout.js";
    s.async = true;
    s.dataset.epayco = "1";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("load"));
    document.body.appendChild(s);
  });
}

export function PortalPay({ token, balanceText }: { token: string; balanceText: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function pay() {
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/portal/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo iniciar el pago.");
        return;
      }
      await loadCheckout();
      if (!window.ePayco) {
        setError("No se pudo cargar la pasarela de pago. Intenta de nuevo.");
        return;
      }
      const handler = window.ePayco.checkout.configure({ key: data.publicKey, test: !!data.test });
      handler.open({
        name: data.name,
        description: data.description,
        invoice: data.ref,
        currency: data.currency || "cop",
        amount: String(data.amount),
        tax_base: "0",
        tax: "0",
        country: "co",
        lang: "es",
        external: "false",
        confirmation: data.confirmationUrl,
        response: data.responseUrl,
      });
    } catch {
      setError("No se pudo iniciar el pago. Intenta de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        onClick={pay}
        disabled={busy}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          background: "#1f2937",
          color: "#fff",
          borderRadius: 14,
          padding: "14px 20px",
          border: "none",
          fontWeight: 700,
          fontSize: 15,
          cursor: busy ? "default" : "pointer",
          opacity: busy ? 0.7 : 1,
          boxShadow: "0 4px 16px -4px rgba(0,0,0,0.3)",
        }}
      >
        {busy ? "Abriendo pasarela…" : `Pagar ${balanceText} en línea`}
      </button>
      {error && <p style={{ fontSize: 12.5, color: "#b91c1c", margin: "8px 0 0", textAlign: "center" }}>{error}</p>}
      <p style={{ fontSize: 10.5, color: "#9ca3af", margin: "8px 0 0", textAlign: "center" }}>
        Pago seguro procesado por ePayco directamente a la administración. El saldo se actualiza al confirmarse.
      </p>
    </div>
  );
}
