"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Header } from "@/components/dashboard/Header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Clock, Loader2 } from "lucide-react";

function ResponseContent() {
  const searchParams = useSearchParams();
  const refPayco = searchParams.get("ref_payco");
  const [status, setStatus] = useState<"loading" | "approved" | "rejected" | "pending" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!refPayco) {
      setStatus("error");
      setMessage("No se recibio referencia de pago.");
      return;
    }

    fetch(`https://secure.epayco.co/validation/v1/reference/${refPayco}`)
      .then((res) => res.json())
      .then((result) => {
        if (!result.success) {
          setStatus("error");
          setMessage("No se pudo verificar la transaccion.");
          return;
        }
        const cod = String(result.data.x_cod_response);
        if (cod === "1") {
          setStatus("approved");
          setMessage("Tu suscripcion ha sido activada exitosamente.");
        } else if (cod === "3") {
          setStatus("pending");
          setMessage("Tu pago esta siendo procesado. Te notificaremos cuando se confirme.");
        } else {
          setStatus("rejected");
          setMessage(result.data.x_response_reason_text || "El pago fue rechazado.");
        }
      })
      .catch(() => {
        setStatus("error");
        setMessage("Error al verificar el pago. Contacta soporte.");
      });
  }, [refPayco]);

  const icons = {
    loading: <Loader2 className="h-16 w-16 text-primary animate-spin" />,
    approved: <CheckCircle2 className="h-16 w-16 text-emerald-500" />,
    rejected: <XCircle className="h-16 w-16 text-red-500" />,
    pending: <Clock className="h-16 w-16 text-amber-500" />,
    error: <XCircle className="h-16 w-16 text-red-500" />,
  };

  const titles = {
    loading: "Verificando pago...",
    approved: "Pago aprobado",
    rejected: "Pago rechazado",
    pending: "Pago pendiente",
    error: "Error",
  };

  return (
    <Card>
      <CardContent className="p-8 text-center space-y-4">
        <div className="flex justify-center">{icons[status]}</div>
        <h2 className="text-2xl font-bold">{titles[status]}</h2>
        <p className="text-muted-foreground">{message}</p>
        {refPayco && status !== "loading" && (
          <p className="text-xs text-muted-foreground">
            Referencia: {refPayco}
          </p>
        )}
        <div className="pt-4">
          <a href="/dashboard">
            <Button className="rounded-2xl">Ir al Dashboard</Button>
          </a>
        </div>
      </CardContent>
    </Card>
  );
}

export default function EpaycoResponsePage() {
  return (
    <div>
      <Header title="Resultado del Pago" />
      <div className="p-8 max-w-lg mx-auto">
        <Suspense
          fallback={
            <Card>
              <CardContent className="p-8 text-center">
                <Loader2 className="h-16 w-16 text-primary animate-spin mx-auto" />
                <p className="mt-4 text-muted-foreground">Verificando pago...</p>
              </CardContent>
            </Card>
          }
        >
          <ResponseContent />
        </Suspense>
      </div>
    </div>
  );
}
