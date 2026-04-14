"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

const faqs = [
  {
    q: "¿Que es SOPH.IA y como funciona?",
    a: "SOPH.IA es una plataforma de inteligencia artificial disenada para administradores de propiedad horizontal. Subes tu informacion mensual (documentos, fotos, audios) y la IA genera automaticamente el informe de gestion, el acta legal y la presentacion profesional en minutos.",
  },
  {
    q: "¿Necesito conocimientos tecnicos para usarla?",
    a: "No. SOPH.IA esta disenada para ser tan facil como adjuntar un archivo a un correo electronico. Solo subes tus documentos, seleccionas la propiedad y el periodo, y la IA hace el resto.",
  },
  {
    q: "¿Los documentos cumplen con la legislacion colombiana?",
    a: "Si. Las actas y los informes estan estructurados conforme a la Ley 675 de 2001 y sus decretos reglamentarios. La IA esta entrenada especificamente con la normatividad de propiedad horizontal colombiana y latinoamericana.",
  },
  {
    q: "¿Que formatos de archivo puedo subir?",
    a: "Puedes subir PDF, Word (DOCX), Excel (XLSX, XLS, CSV), imagenes (JPG, PNG), archivos de texto y audio (MP3, WAV, M4A). SOPH.IA procesa cualquier formato comun que utilices en tu gestion diaria.",
  },
  {
    q: "¿Puedo personalizar los documentos generados?",
    a: "Si. Puedes agregar notas, instrucciones especificas e informacion adicional antes de generar. Ademas, puedes regenerar los documentos las veces que necesites dentro de los limites de tu plan.",
  },
  {
    q: "¿Como funciona la prueba gratuita?",
    a: "Tienes 7 dias de acceso completo sin necesidad de tarjeta de credito. Puedes generar documentos reales y descargarlos. Si decides no continuar, simplemente no hagas nada — no se realizara ningun cobro.",
  },
  {
    q: "¿Puedo cancelar mi suscripcion en cualquier momento?",
    a: "Si. No hay contratos ni permanencias. Puedes cancelar tu suscripcion cuando quieras directamente desde la plataforma. Tu acceso continuara activo hasta el final del periodo pagado.",
  },
  {
    q: "¿Que metodos de pago aceptan?",
    a: "Aceptamos tarjetas de credito, tarjetas debito, PSE, Nequi, Daviplata y otros medios de pago a traves de ePayco, la pasarela de pago lider en Colombia.",
  },
  {
    q: "¿Mis datos estan protegidos?",
    a: "Si. Utilizamos encriptacion de grado bancario para proteger tu informacion. Tus documentos se procesan de forma segura y nunca compartimos datos con terceros. Cumplimos con la Ley 1581 de proteccion de datos personales.",
  },
  {
    q: "¿Ofrecen soporte?",
    a: "Si. Ofrecemos soporte por WhatsApp en horario extendido. Los usuarios del Plan Elite cuentan con soporte prioritario y capacitacion personalizada.",
  },
];

export function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section id="faq" className="py-24">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <p className="text-sm font-semibold text-primary uppercase tracking-wider mb-3">FAQ</p>
          <h2 className="text-3xl sm:text-4xl font-bold">Preguntas frecuentes</h2>
          <p className="text-muted-foreground mt-4">
            Todo lo que necesitas saber antes de empezar.
          </p>
        </div>

        <div className="space-y-3">
          {faqs.map((faq, i) => {
            const isOpen = openIndex === i;
            return (
              <div
                key={i}
                className="bg-white border border-border/40 rounded-2xl overflow-hidden transition-all duration-200 hover:border-border"
              >
                <button
                  onClick={() => setOpenIndex(isOpen ? null : i)}
                  className="w-full flex items-center justify-between px-6 py-4 text-left"
                >
                  <span className="text-sm font-semibold pr-4">{faq.q}</span>
                  <ChevronDown
                    className={`h-4 w-4 text-muted-foreground flex-shrink-0 transition-transform duration-200 ${
                      isOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>
                {isOpen && (
                  <div className="px-6 pb-4">
                    <p className="text-sm text-muted-foreground leading-relaxed">{faq.a}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
