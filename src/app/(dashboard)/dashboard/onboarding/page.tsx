"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { upload as blobUpload } from "@vercel/blob/client";
import {
  AGENTES,
  Aviso,
  Boton,
  Campo,
  Colofon,
  Entrada,
  Estado,
  FilaArchivo,
  GrupoCampos,
  ListaArchivos,
  Marca,
  NavPasos,
  Pagina,
  Panel,
  Pasos,
  Resumen,
  Selector,
  Sigilo,
  ZonaSubida,
  nombreCorto,
  pesoLegible,
} from "@/components/kit";
import { AGENTS, COMING_SOON_AGENT_IDS, INCLUDED_AGENT_IDS } from "@/lib/agents";

/* ════════════════════════════════════════════════════════════════════
   Estilos locales del primer uso (SPEC §g «Onboarding»).
   - Sin índice lateral ni dock: el armazón del dashboard los pinta en todas
     las rutas, así que aquí se ocultan SOLO mientras esta pantalla está
     montada (`:root:has([data-onb])`, el mismo patrón acotado de los tokens).
     Pendiente del kit: que el layout no los monte en /dashboard/onboarding.
   - Retícula 7 + 5: formulario a la izquierda, ayuda a la derecha.
   ════════════════════════════════════════════════════════════════════ */
const CSS_ONB = `
:root:has([data-onb]) .k-app { grid-template-columns: minmax(0, 1fr); }
:root:has([data-onb]) .k-col-indice,
:root:has([data-onb]) .k-principal > .k-dock { display: none; }

.onb-cab { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: var(--cab-h); padding: 0 var(--pad); border-bottom: 2px solid var(--rule); }
.onb-cab .marca { display: flex; align-items: center; gap: 12px; min-width: 0; }
.onb-cab .der { display: flex; align-items: center; gap: 18px; min-width: 0; }
.onb-cab .der > span { font-size: 14px; color: var(--ink-3); white-space: nowrap; }

.onb .k-pieza { padding-top: 40px; }
.onb .k-pasos { margin-bottom: 52px; }
.onb-hero { grid-column: 1 / 10; min-width: 0; margin-bottom: 40px; }
.onb-kicker { margin: 0; font-size: 15px; font-weight: 500; line-height: 1.35; color: var(--ink-2); }
.onb-kicker b { color: var(--ink); font-weight: 700; }
.onb-hero .k-h1 { margin-top: 12px; text-wrap: balance; }
/* El titular recibe el foco por programa al cambiar de paso (lo anuncia el lector);
   no es un control, así que sin anillo. Más específico que el foco global del armazón. */
:root:has([data-shell="app"]) .onb-hero h1[tabindex="-1"]:focus-visible { outline: 0; }
.onb-lead { margin: 18px 0 0; max-width: 58ch; font-size: 17px; line-height: 1.5; color: var(--ink-2); text-wrap: pretty; }

.onb-form { grid-column: 1 / 8; min-width: 0; }
.onb-ayuda { grid-column: 8 / 13; min-width: 0; }
.onb-ayuda .k-panel + .k-panel { margin-top: 32px; }
.onb-ayuda p { margin: 0 0 12px; font-size: 15px; line-height: 1.45; color: var(--ink-2); text-wrap: pretty; }
.onb-ayuda p b { color: var(--ink); font-weight: 700; }
.onb-ayuda .correo { font-family: var(--f-mono); font-size: 14px; color: var(--ink); overflow-wrap: anywhere; }
.onb-lista { list-style: none; margin: 0; padding: 0; }
.onb-lista li { display: flex; justify-content: space-between; align-items: center; gap: 12px; min-height: 44px; border-bottom: 1px solid var(--line); font-size: 15px; }

.onb-2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: var(--g); }
.onb-nota { margin: 0; align-self: center; max-width: 34ch; font-size: 14px; line-height: 1.35; color: var(--ink-3); }
.onb-omitir { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; margin: 18px 0 0; font-size: 14px; color: var(--ink-3); }
.onb-doc + .onb-doc { margin-top: 8px; }
.onb-doc .k-archivos { margin-top: 0; }
.onb-avisos { display: grid; gap: 12px; margin-top: 28px; }

.onb-filas { list-style: none; margin: 0; padding: 0; border-top: 2px solid var(--rule); }
.onb-fila { display: grid; grid-template-columns: 40px minmax(0, 1fr); column-gap: 12px; padding: 18px 0 20px; border-bottom: 1px solid var(--line); }
.onb-fila .ref { padding-top: 9px; font: 400 13px/1 var(--f-mono); color: var(--ink-3); }
.onb-fila .cab { display: flex; align-items: baseline; gap: 12px; min-width: 0; }
.onb-fila h2 { margin: 0; font-size: 28px; font-weight: 800; font-stretch: 85%; letter-spacing: -.02em; line-height: 1; white-space: nowrap; }
.onb-fila .dots { flex: 1; min-width: 16px; border-bottom: 2px dotted rgb(var(--veil-rgb) / .28); transform: translateY(-4px); }
.onb-fila .dato { display: inline-flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; color: var(--ink-2); white-space: nowrap; }
.onb-fila p { grid-column: 2; margin: 10px 0 0; max-width: 62ch; font-size: 16px; line-height: 1.45; color: var(--ink-2); text-wrap: pretty; }
.onb-fila p b { color: var(--ink); font-weight: 700; }

@media (max-width: 860px) {
  .onb-cab .der > span { display: none; }
  .onb .k-pieza { padding-top: 24px; }
  .onb .k-pasos { margin-bottom: 32px; }
  .onb-hero { margin-bottom: 28px; }
  .onb-lead { font-size: 16px; }
  .onb-ayuda { margin-top: 40px; }
  .onb-nota { max-width: none; }
  .onb-fila { grid-template-columns: 28px minmax(0, 1fr); column-gap: 8px; }
  .onb-fila h2 { font-size: 24px; }
  .onb-fila p { grid-column: 1 / -1; }
}
@media (max-width: 560px) {
  .onb-2 { grid-template-columns: minmax(0, 1fr); }
  .onb-fila .dots { display: none; }
  .onb-fila .cab { flex-wrap: wrap; row-gap: 6px; }
  .onb-fila .dato { flex-basis: 100%; }
}
`;

/** Nombres de los pasos (SPEC §g «Onboarding»): 1 Tu perfil · 2 Primera propiedad · 3 Documentos · 4 Cómo funciona. */
const NOMBRES_PASOS = ["Tu perfil", "Primera propiedad", "Documentos", "Cómo funciona"];

export default function OnboardingPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Step 1: Profile
  const [name, setName] = useState(session?.user?.name ?? "");
  const [cargo, setCargo] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");

  // Step 2: First property
  const [propName, setPropName] = useState("");
  const [propAddress, setPropAddress] = useState("");
  const [propCity, setPropCity] = useState("");
  const [propUnits, setPropUnits] = useState("");

  // Step 3: Property documents
  const [manualFile, setManualFile] = useState<File | null>(null);
  const [reglamentoFile, setReglamentoFile] = useState<File | null>(null);
  const [uploadingDocs, setUploadingDocs] = useState(false);

  const [error, setError] = useState("");
  const [docWarning, setDocWarning] = useState("");
  const [skipped, setSkipped] = useState(false);
  const [savedPropertyId, setSavedPropertyId] = useState<string | null>(null);

  const TOTAL_STEPS = 4;

  const handleFinish = async () => {
    setLoading(true);
    setError("");
    try {
      const profileRes = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, cargo, company, phone, city, onboarded: true }),
      });

      if (!profileRes.ok) {
        const data = await profileRes.json();
        setError(data.error || "Error al guardar el perfil. Intenta de nuevo.");
        setLoading(false);
        return;
      }

      if (!skipped && propName.trim()) {
        let propertyId = savedPropertyId;

        if (!propertyId) {
          const propRes = await fetch("/api/properties", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: propName,
              address: propAddress,
              city: propCity,
              units: propUnits,
            }),
          }).catch(() => null);

          if (!propRes || !propRes.ok) {
            console.error("[ONBOARDING] Property save failed");
            setError("No pudimos guardar tu propiedad. Revisa tu conexión e intenta de nuevo.");
            setLoading(false);
            return;
          }

          const propData = await propRes.json();
          propertyId = propData.id as string;
          setSavedPropertyId(propertyId);
        }

        if (!docWarning) {
          const docsToUpload = [
            { file: manualFile, type: "manual_convivencia" },
            { file: reglamentoFile, type: "reglamento_interno" },
          ];

          const failedDocs: string[] = [];
          for (const doc of docsToUpload) {
            if (!doc.file) continue;
            try {
              const safeName = doc.file.name.replace(/[^\w.\-]+/g, "_");
              const result = await blobUpload(`property-docs/${propertyId}/${Date.now()}-${safeName}`, doc.file, {
                access: "private",
                handleUploadUrl: "/api/upload/token",
                contentType: doc.file.type || "application/octet-stream",
              });
              const docRes = await fetch(`/api/properties/${propertyId}/documents`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  type: doc.type,
                  name: doc.file.name,
                  url: result.url,
                  size: doc.file.size,
                  mimeType: doc.file.type,
                }),
              });
              if (!docRes.ok) throw new Error("Document registration failed");
            } catch (err) {
              console.error("[ONBOARDING] Doc upload failed:", err);
              failedDocs.push(doc.file.name);
            }
          }

          if (failedDocs.length > 0) {
            setDocWarning(`La propiedad se guardó, pero falló la subida de ${failedDocs.join(", ")}. Podrás subirlo después desde Propiedades.`);
            setLoading(false);
            return;
          }
        }
      }

      window.location.href = "/dashboard";
    } catch {
      setError("Error de conexión. Intenta de nuevo.");
      setLoading(false);
    }
  };

  // [valor que se guarda, etiqueta visible]: los valores guardados no cambian
  // (los usa Configuración); solo la etiqueta lleva tildes.
  const cargos: Array<[string, string]> = [
    ["Administrador(a) de P.H.", "Administrador(a) de P.H."],
    ["Gerente de Administracion", "Gerente de administración"],
    ["Contador(a)", "Contador(a)"],
    ["Revisor(a) Fiscal", "Revisor(a) fiscal"],
    ["Asistente Administrativo", "Asistente administrativo"],
    ["Otro", "Otro"],
  ];
  const etiquetaCargo = cargos.find(([v]) => v === cargo)?.[1] ?? cargo;

  /* ── foco al titular al cambiar de paso (lectores de pantalla y teclado) ── */
  const titularRef = useRef<HTMLHeadingElement>(null);
  const pasoPrevio = useRef(step);
  useEffect(() => {
    if (pasoPrevio.current === step) return;
    pasoPrevio.current = step;
    window.scrollTo({ top: 0 });
    titularRef.current?.focus({ preventScroll: true });
  }, [step]);

  /* ── derivados de lo que ya hay en el estado (nada inventado) ── */
  const perfilListo = Boolean(name.trim() && cargo);
  const propiedad = propName.trim();
  const docsElegidos = [manualFile, reglamentoFile].filter((f): f is File => Boolean(f));
  const nDocs = docsElegidos.length;
  const textoDocs = nDocs === 0 ? "Ninguno" : nDocs === 1 ? "1 archivo" : `${nDocs} archivos`;
  // Omitir la copropiedad salta el paso 3 (no hay a qué asociar los documentos).
  const irAtrasDesdeCuatro = () => setStep(skipped ? 2 : 3);

  // Hechos: el valor elegido. Actual: qué se pide en él. Futuros: nada, o «Opcional».
  const pasos = [
    {
      nombre: NOMBRES_PASOS[0],
      valor: step > 1 ? name.trim() : "Nombre y cargo",
      alVolver: () => setStep(1),
    },
    {
      nombre: NOMBRES_PASOS[1],
      valor: step > 2
        ? (skipped || !propiedad ? "Omitida" : nombreCorto(propiedad))
        : step === 2 ? "Nombre, dirección y unidades" : undefined,
      alVolver: () => setStep(2),
    },
    {
      nombre: NOMBRES_PASOS[2],
      valor: step > 3 ? (skipped ? "Omitido" : textoDocs) : step === 3 ? "Manual y reglamento · opcional" : "Opcional",
      alVolver: skipped ? undefined : () => setStep(3),
    },
    { nombre: NOMBRES_PASOS[3], valor: step === 4 ? "Resumen y entrada" : undefined },
  ];

  const titulares = [
    "Cuéntanos quién eres.",
    "Tu primera copropiedad.",
    "Sube el manual y el reglamento.",
    "Así trabaja SOPH.IA.",
  ];

  const entradas = [
    { titulo: <>Te damos la bienvenida a SOPH.IA.</>, resto: <>Configura tu cuenta en {TOTAL_STEPS} pasos.</> },
    { titulo: <>Paso 2 de {TOTAL_STEPS}.</>, resto: <>Tu perfil está completo.</> },
    { titulo: <>Paso 3 de {TOTAL_STEPS}.</>, resto: <>{propiedad ? nombreCorto(propiedad) : "Tu copropiedad"} · documentos opcionales</> },
    { titulo: <>Paso 4 de {TOTAL_STEPS}.</>, resto: <>Revisa y entra.</> },
  ][step - 1];

  const leads = [
    "Personaliza tu experiencia en SOPH.IA con tu información profesional.",
    "Agrega el conjunto o edificio que administras. Podrás agregar más después, desde Propiedades.",
    `Sube el manual de convivencia y el reglamento interno${propiedad ? ` de ${propiedad}` : ""}. La IA los usará como contexto para generar informes más precisos.`,
    "Al pulsar «Ir al inicio» guardamos tu cuenta. Estas son las tres entradas del índice que más vas a usar.",
  ];

  // docWarning llega como una frase compuesta: la primera oración va en negrita (SPEC §f.14).
  const partirAviso = (t: string) => {
    const i = t.indexOf(". ");
    return i === -1 ? { titulo: t, texto: undefined } : { titulo: t.slice(0, i + 1), texto: t.slice(i + 2) };
  };

  // Agentes activos y en preparación, de la misma lista que usa la app (src/lib/agents.ts).
  const activos = INCLUDED_AGENT_IDS;
  const enPreparacion = COMING_SOON_AGENT_IDS.length;

  return (
    <div className="onb" data-onb="">
      <style href="k-onboarding-local" precedence="default">
        {CSS_ONB}
      </style>

      {/* Barra superior propia: sin índice lateral, la marca arriba a la izquierda. */}
      <header className="onb-cab">
        <span className="marca">
          <Marca />
        </span>
        <div className="der">
          <span>Configuración inicial</span>
          <Boton variante="fantasma" tam={40} onClick={() => signOut({ callbackUrl: "/" })}>
            Cerrar sesión
          </Boton>
        </div>
      </header>

      <div>
        <Pagina>
          <section className="k-pieza" aria-labelledby="onb-titular">
            <Pasos actual={step} pasos={pasos} etiquetaAccesible="Pasos de la configuración inicial" />

            <div className="k-r12">
              <div className="onb-hero">
                <p className="onb-kicker">
                  <b>{entradas.titulo}</b> {entradas.resto}
                </p>
                <h1 id="onb-titular" className="k-h1" ref={titularRef} tabIndex={-1}>
                  {titulares[step - 1]}
                </h1>
                <p className="onb-lead">{leads[step - 1]}</p>
              </div>

              {/* ── PASO 1: perfil ─────────────────────────────────────── */}
              {step === 1 && (
                <>
                  <div className="onb-form">
                    <GrupoCampos titulo="Tus datos">
                      <Campo id="onb-nombre" etiqueta="Nombre completo">
                        <Entrada
                          id="onb-nombre"
                          type="text"
                          autoComplete="name"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="Tu nombre"
                        />
                      </Campo>
                      <Campo id="onb-cargo" etiqueta="Cargo">
                        <Selector id="onb-cargo" value={cargo} onChange={(e) => setCargo(e.target.value)}>
                          <option value="">Selecciona tu cargo</option>
                          {cargos.map(([valor, etiqueta]) => (
                            <option key={valor} value={valor}>{etiqueta}</option>
                          ))}
                        </Selector>
                      </Campo>
                    </GrupoCampos>

                    <GrupoCampos titulo="Tu empresa y contacto" nota="Opcional: puedes completarlo después.">
                      <Campo id="onb-empresa" etiqueta="Empresa o razón social" opcional>
                        <Entrada
                          id="onb-empresa"
                          type="text"
                          autoComplete="organization"
                          value={company}
                          onChange={(e) => setCompany(e.target.value)}
                          placeholder="Nombre de tu empresa"
                        />
                      </Campo>
                      <div className="onb-2">
                        <Campo id="onb-telefono" etiqueta="Teléfono" opcional>
                          <Entrada
                            id="onb-telefono"
                            type="text"
                            inputMode="tel"
                            autoComplete="tel"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            placeholder="+57 300 123 4567"
                          />
                        </Campo>
                        <Campo id="onb-ciudad" etiqueta="Ciudad" opcional>
                          <Entrada
                            id="onb-ciudad"
                            type="text"
                            autoComplete="address-level2"
                            value={city}
                            onChange={(e) => setCity(e.target.value)}
                            placeholder="Bogotá"
                          />
                        </Campo>
                      </div>
                    </GrupoCampos>

                    <NavPasos>
                      <p className="onb-nota" id="onb-falta-perfil">
                        {perfilListo ? "Tus datos quedan guardados al terminar el paso 4." : "Escribe tu nombre y elige tu cargo para continuar."}
                      </p>
                      <Boton
                        tam={56}
                        flecha="avanza"
                        onClick={() => setStep(2)}
                        disabled={!name.trim() || !cargo}
                        aria-describedby="onb-falta-perfil"
                      >
                        Continuar a {NOMBRES_PASOS[1].toLowerCase()}
                      </Boton>
                    </NavPasos>
                  </div>

                  <aside className="onb-ayuda" aria-label="Ayuda del paso 1">
                    <Panel titulo="Para qué sirve" nivel={2}>
                      <p>
                        El nombre de tu empresa encabeza los informes y actas que generes, y firma los correos que
                        SOPH.IA envía a tus residentes. Si lo dejas vacío, los correos llevan tu nombre.
                      </p>
                      <p>Puedes cambiar tu perfil cuando quieras desde Configuración.</p>
                    </Panel>
                    {session?.user?.email && (
                      <Panel titulo="Tu cuenta" nivel={2}>
                        <p>
                          Entraste como <span className="correo">{session.user.email}</span>
                        </p>
                      </Panel>
                    )}
                  </aside>
                </>
              )}

              {/* ── PASO 2: primera copropiedad ────────────────────────── */}
              {step === 2 && (
                <>
                  <div className="onb-form">
                    <GrupoCampos titulo="Datos de la copropiedad">
                      <Campo id="onb-prop-nombre" etiqueta="Nombre del conjunto o edificio">
                        <Entrada
                          id="onb-prop-nombre"
                          type="text"
                          value={propName}
                          onChange={(e) => setPropName(e.target.value)}
                          placeholder="Ej.: Conjunto Residencial Los Pinos"
                        />
                      </Campo>
                      <Campo id="onb-prop-direccion" etiqueta="Dirección" opcional>
                        <Entrada
                          id="onb-prop-direccion"
                          type="text"
                          autoComplete="street-address"
                          value={propAddress}
                          onChange={(e) => setPropAddress(e.target.value)}
                          placeholder="Ej.: Carrera 45 # 23-67"
                        />
                      </Campo>
                      <div className="onb-2">
                        <Campo id="onb-prop-ciudad" etiqueta="Ciudad" opcional>
                          <Entrada
                            id="onb-prop-ciudad"
                            type="text"
                            value={propCity}
                            onChange={(e) => setPropCity(e.target.value)}
                            placeholder="Bogotá"
                          />
                        </Campo>
                        <Campo id="onb-prop-unidades" etiqueta="Número de unidades" opcional>
                          <Entrada
                            id="onb-prop-unidades"
                            type="number"
                            inputMode="numeric"
                            value={propUnits}
                            onChange={(e) => setPropUnits(e.target.value)}
                            placeholder="120"
                          />
                        </Campo>
                      </div>
                    </GrupoCampos>

                    <NavPasos>
                      <Boton variante="secundario" flecha="vuelve" onClick={() => setStep(1)}>
                        {NOMBRES_PASOS[0]}
                      </Boton>
                      <Boton
                        tam={56}
                        flecha="avanza"
                        onClick={() => { setSkipped(false); setStep(3); }}
                        disabled={!propName.trim()}
                        aria-describedby={!propName.trim() ? "onb-falta-prop" : undefined}
                      >
                        Continuar a documentos
                      </Boton>
                    </NavPasos>

                    <p className="onb-omitir">
                      <span id="onb-falta-prop">
                        {propName.trim()
                          ? "¿Prefieres hacerlo más tarde?"
                          : "Escribe el nombre de la copropiedad para continuar, o hazlo más tarde."}
                      </span>
                      <Boton
                        variante="fantasma"
                        onClick={() => {
                          setSkipped(true);
                          setPropName("");
                          setPropAddress("");
                          setPropCity("");
                          setPropUnits("");
                          setManualFile(null);
                          setReglamentoFile(null);
                          setStep(4);
                        }}
                      >
                        Omitir por ahora
                      </Boton>
                    </p>
                  </div>

                  <aside className="onb-ayuda" aria-label="Ayuda del paso 2">
                    <Panel titulo="Por qué la pedimos" nivel={2}>
                      <p>
                        Con tu copropiedad, SOPH.IA arma los informes de cada mes, y Themis y Chronos responden con su
                        contexto: nombre, dirección, ciudad y número de unidades.
                      </p>
                      <p>¿Administras varias? Agrega aquí una; las demás, después desde Propiedades.</p>
                    </Panel>
                  </aside>
                </>
              )}

              {/* ── PASO 3: documentos de la copropiedad ───────────────── */}
              {step === 3 && (
                <>
                  <div className="onb-form">
                    <GrupoCampos titulo="Manual de convivencia" nota="PDF o Word">
                      <div className="onb-doc">
                        {manualFile ? (
                          <ListaArchivos etiquetaAccesible="Manual de convivencia elegido">
                            <FilaArchivo
                              nombre={manualFile.name}
                              detalle={<>{pesoLegible(manualFile.size)} · se sube al terminar</>}
                              estado="espera"
                              alQuitar={() => setManualFile(null)}
                              etiquetaQuitar={`Quitar ${manualFile.name}`}
                            />
                          </ListaArchivos>
                        ) : (
                          <ZonaSubida
                            compacta
                            titulo="Suelta aquí el manual"
                            texto="o haz clic para elegirlo."
                            accept=".pdf,.docx,.doc"
                            etiquetaAccesible="Elegir el manual de convivencia (PDF o Word)"
                            alElegir={(archivos) => { if (archivos[0]) setManualFile(archivos[0]); }}
                          />
                        )}
                      </div>
                    </GrupoCampos>

                    <GrupoCampos titulo="Reglamento interno" nota="PDF o Word">
                      <div className="onb-doc">
                        {reglamentoFile ? (
                          <ListaArchivos etiquetaAccesible="Reglamento interno elegido">
                            <FilaArchivo
                              nombre={reglamentoFile.name}
                              detalle={<>{pesoLegible(reglamentoFile.size)} · se sube al terminar</>}
                              estado="espera"
                              alQuitar={() => setReglamentoFile(null)}
                              etiquetaQuitar={`Quitar ${reglamentoFile.name}`}
                            />
                          </ListaArchivos>
                        ) : (
                          <ZonaSubida
                            compacta
                            titulo="Suelta aquí el reglamento"
                            texto="o haz clic para elegirlo."
                            accept=".pdf,.docx,.doc"
                            etiquetaAccesible="Elegir el reglamento interno (PDF o Word)"
                            alElegir={(archivos) => { if (archivos[0]) setReglamentoFile(archivos[0]); }}
                          />
                        )}
                      </div>
                    </GrupoCampos>

                    <NavPasos>
                      <Boton variante="secundario" flecha="vuelve" onClick={() => setStep(2)}>
                        {NOMBRES_PASOS[1]}
                      </Boton>
                      <Boton tam={56} flecha="avanza" onClick={() => setStep(4)}>
                        {nDocs === 0 ? "Continuar sin documentos" : "Continuar a cómo funciona"}
                      </Boton>
                    </NavPasos>
                  </div>

                  <aside className="onb-ayuda" aria-label="Ayuda del paso 3">
                    <Panel titulo="Qué subir" nota={`${nDocs} de 2 elegidos`} nivel={2}>
                      <ul className="onb-lista">
                        <li>
                          Manual de convivencia
                          {manualFile ? <Estado tipo="ok" tamLetra={14}>Elegido</Estado> : <Estado tipo="sin" tamLetra={14}>Sin archivo</Estado>}
                        </li>
                        <li>
                          Reglamento interno
                          {reglamentoFile ? <Estado tipo="ok" tamLetra={14}>Elegido</Estado> : <Estado tipo="sin" tamLetra={14}>Sin archivo</Estado>}
                        </li>
                      </ul>
                    </Panel>
                    <Panel titulo="Para qué sirven" nivel={2}>
                      <p>
                        Con ellos, el portal de residentes activa el asistente del reglamento, que responde las dudas de
                        tus residentes.
                      </p>
                      <p><b>Son opcionales:</b> puedes subirlos después desde Propiedades.</p>
                    </Panel>
                  </aside>
                </>
              )}

              {/* ── PASO 4: cómo funciona + resumen + terminar ─────────── */}
              {step === 4 && (
                <>
                  <div className="onb-form">
                    <ol className="onb-filas" aria-label="Las entradas del índice que más vas a usar">
                      <li className="onb-fila">
                        <span className="ref" aria-hidden="true">02</span>
                        <div className="cab">
                          <h2>Generar</h2>
                          <span className="dots" aria-hidden="true" />
                          <span className="dato">Informes y actas</span>
                        </div>
                        <p>
                          Sube los insumos del mes —actas, estados financieros, grabaciones de juntas, fotos— y la IA
                          redacta el <b>informe de gestión</b>, el <b>acta</b> y la <b>presentación</b> con estructura
                          legal colombiana (Ley 675). Pides correcciones en lenguaje natural y descargas en PDF y PPTX.
                        </p>
                      </li>
                      <li className="onb-fila">
                        <span className="ref" aria-hidden="true">03</span>
                        <div className="cab">
                          <h2>Bitácora</h2>
                          <span className="dots" aria-hidden="true" />
                          <span className="dato">Vencimientos</span>
                        </div>
                        <p>
                          Asambleas, pólizas, mantenimientos y obligaciones de SG-SST de cada copropiedad, con su fecha
                          de vencimiento: lo vencido, primero.
                        </p>
                      </li>
                      <li className="onb-fila">
                        <span className="ref" aria-hidden="true">04</span>
                        <div className="cab">
                          <h2>Asistente IA</h2>
                          <span className="dots" aria-hidden="true" />
                          <span className="dato">
                            {activos.map((id) => (
                              <Sigilo key={id} agente={id} ancho={14} />
                            ))}
                            {activos.length} {activos.length === 1 ? "agente activo" : "agentes activos"}
                          </span>
                        </div>
                        <p>
                          {activos.map((id, i) => (
                            <span key={id}>
                              {i > 0 && (i === activos.length - 1 ? " y " : ", ")}
                              <b>{AGENTS[id].name}</b> ({AGENTES[id].oficio.toLowerCase()})
                            </span>
                          ))}{" "}
                          {activos.length === 1 ? "responde" : "responden"} tus dudas en un chat.
                          {enPreparacion > 0 && <> Hay {enPreparacion} agentes más en preparación.</>}
                        </p>
                      </li>
                    </ol>

                    {(error || docWarning) && (
                      <div className="onb-avisos">
                        {error && <Aviso tipo="error" enLinea {...partirAviso(error)} />}
                        {docWarning && (
                          <Aviso tipo="error" enLinea {...partirAviso(docWarning)} />
                        )}
                      </div>
                    )}

                    <NavPasos>
                      <Boton variante="secundario" flecha="vuelve" onClick={irAtrasDesdeCuatro}>
                        {skipped ? NOMBRES_PASOS[1] : NOMBRES_PASOS[2]}
                      </Boton>
                      <Boton
                        tam={56}
                        flecha="avanza"
                        onClick={handleFinish}
                        cargando={loading}
                        textoCargando="Guardando…"
                      >
                        Ir al inicio
                      </Boton>
                    </NavPasos>
                  </div>

                  <aside className="onb-ayuda" aria-label="Resumen de tu configuración">
                    <Panel titulo="Resumen" nota="lo que guardaremos" nivel={2}>
                      <Resumen
                        etiquetaAccesible="Lo que guardaremos"
                        filas={[
                          { etiqueta: "Tu perfil", valor: <>{name.trim()}{etiquetaCargo && <> · {etiquetaCargo}</>}</> },
                          ...(company.trim() ? [{ etiqueta: "Empresa", valor: company.trim() }] : []),
                          ...(phone.trim() || city.trim()
                            ? [{ etiqueta: "Contacto", valor: [phone.trim(), city.trim()].filter(Boolean).join(" · ") }]
                            : []),
                          {
                            etiqueta: "Copropiedad",
                            valor: skipped || !propiedad
                              ? <span style={{ color: "var(--ink-3)", fontWeight: 400 }}>Omitida por ahora</span>
                              : (
                                <>
                                  {propiedad}
                                  {(propCity.trim() || propUnits.trim()) && (
                                    <span style={{ display: "block", fontWeight: 400, fontSize: 14, color: "var(--ink-3)" }}>
                                      {[propCity.trim(), propUnits.trim() && `${propUnits.trim()} unidades`].filter(Boolean).join(" · ")}
                                    </span>
                                  )}
                                </>
                              ),
                          },
                          {
                            etiqueta: "Documentos",
                            valor: skipped || nDocs === 0
                              ? <span style={{ color: "var(--ink-3)", fontWeight: 400 }}>Ninguno por ahora</span>
                              : docsElegidos.map((f) => <span key={f.name} style={{ display: "block" }}>{f.name}</span>),
                          },
                        ]}
                      />
                    </Panel>
                  </aside>
                </>
              )}
            </div>
          </section>

          <Colofon izquierda="SOPH.IA · propiedad horizontal · Ley 675 de 2001" />
        </Pagina>
      </div>
    </div>
  );
}
