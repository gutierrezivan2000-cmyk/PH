/**
 * Un administrador que no es propietario no puede cambiar su PROPIO plan, suscripción ni add-ons (la API responde 403). La
 * pantalla no debe ofrecer entonces los controles que terminan en ese error: los reemplaza una nota. Los propietarios, y
 * cualquier administrador sobre la cuenta de OTRA persona, siguen viendo los controles.
 *
 * Se pinta el primer render en el servidor (sin DOM): es lo que ve la persona antes de interactuar.
 */
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }), usePathname: () => "/" }));

import { MENSAJE_AUTOCONCESION } from "@/lib/admin/autoconcesion";
import { AccionesDeUsuario } from "./usuarios/[id]/AccionesDeUsuario";
import { AddonToggles } from "./suscripciones/[id]/AddonToggles";
import { AdminNotes } from "./suscripciones/[id]/AdminNotes";
import { SubscriptionActions } from "./suscripciones/[id]/SubscriptionActions";
import { CeldasDeAddons } from "./addons/AddonsClient";

/** El texto del mensaje tal como sale en el HTML (el servidor escapa lo que haga falta). */
const NOTA = MENSAJE_AUTOCONCESION;
const html = (el: ReturnType<typeof createElement>) => renderToStaticMarkup(el);

describe("ficha de un usuario: «Dar acceso» sobre la propia cuenta", () => {
  const acciones = (p: { userId?: string; adminId: string | null; esPropietario: boolean; role?: string; banned?: boolean }) =>
    html(createElement(AccionesDeUsuario, { userId: "u1", role: "user", banned: false, ...p }));

  it("un administrador que NO es propietario, sobre su propia cuenta: sin botón y con la nota", () => {
    const h = acciones({ adminId: "u1", esPropietario: false, role: "admin" });
    expect(h).not.toContain("Dar acceso");
    expect(h).toContain(NOTA);
    expect(h).toContain('data-nota="autoconcesion"');
    // Tampoco los de rol ni bloqueo, que ya no se ofrecían sobre uno mismo.
    expect(h).not.toContain("Banear usuario");
    expect(h).not.toContain("Promover a admin");
  });

  it("un propietario sobre su propia cuenta: sí ve «Dar acceso» y no la nota", () => {
    const h = acciones({ adminId: "u1", esPropietario: true, role: "admin" });
    expect(h).toContain("Dar acceso");
    expect(h).not.toContain(NOTA);
    expect(h).toContain("No puedes cambiar tu propio rol");
  });

  it("un administrador que no es propietario sobre la cuenta de otra persona: ve «Dar acceso» y «Banear», sin nota ni rol", () => {
    const h = acciones({ adminId: "adm", esPropietario: false });
    expect(h).toContain("Dar acceso");
    expect(h).toContain("Banear usuario");
    expect(h).not.toContain(NOTA);
    expect(h).not.toContain("Promover a admin");
  });

  it("un propietario sobre otra persona: ve también el cambio de rol", () => {
    const h = acciones({ adminId: "adm", esPropietario: true });
    expect(h).toContain("Dar acceso");
    expect(h).toContain("Promover a admin");
    expect(h).not.toContain(NOTA);
  });

  it("sin sesión resuelta no se oculta nada (la API sigue negando lo que corresponda)", () => {
    expect(acciones({ adminId: null, esPropietario: false })).toContain("Dar acceso");
  });
});

describe("detalle de la suscripción: cancelar, reactivar, add-ons y notas sobre la propia", () => {
  it("acciones: en solo lectura no hay botones de cancelar ni reactivar, y sí la nota", () => {
    for (const status of ["active", "canceled"]) {
      const h = html(createElement(SubscriptionActions, { subscriptionId: "s1", status, soloLectura: true }));
      expect(h).not.toContain("Cancelar suscripción");
      expect(h).not.toContain("Reactivar");
      expect(h).not.toContain("<button");
      expect(h).toContain(NOTA);
    }
  });

  it("acciones: normales, una activa se puede cancelar y una cancelada reactivar", () => {
    expect(html(createElement(SubscriptionActions, { subscriptionId: "s1", status: "active" }))).toContain("Cancelar suscripción");
    const cancelada = html(createElement(SubscriptionActions, { subscriptionId: "s1", status: "canceled" }));
    expect(cancelada).toContain("Reactivar");
    expect(cancelada).not.toContain(NOTA);
  });

  it("add-ons: en solo lectura no hay interruptores, se ve el estado de cada uno y la nota", () => {
    const h = html(createElement(AddonToggles, { subscriptionId: "s1", initialAddons: ["metra"], planId: "pro", soloLectura: true }));
    expect(h).not.toContain("Activar/desactivar");
    expect(h).not.toContain("<button");
    expect(h).toContain(NOTA);
    expect(h.match(/data-estado="activo"/g)).toHaveLength(1);
    expect(h.match(/data-estado="inactivo"/g)).toHaveLength(3);
  });

  it("add-ons: normales, hay un interruptor por add-on y ninguna nota", () => {
    const h = html(createElement(AddonToggles, { subscriptionId: "s1", initialAddons: [], planId: "pro" }));
    expect(h.match(/Activar\/desactivar/g)).toHaveLength(4);
    expect(h).not.toContain(NOTA);
  });

  it("add-ons: el MRR sale de la fuente única (lib/plan) y el plan Business ya no cuenta como $0", () => {
    const mrr = (planId: string, addons: string[] = []) =>
      html(createElement(AddonToggles, { subscriptionId: "s1", initialAddons: addons, planId })).replace(/<!-- -->/g, "");
    expect(mrr("business")).toContain("Plan Business");
    expect(mrr("business")).toContain("$73");
    expect(mrr("pro", ["metra", "hermes"])).toContain("$34"); // 24 + 2 × 5
    expect(mrr("elite")).toContain("$183");
  });

  it("notas: en solo lectura no hay campo ni botón para guardar; se muestra el texto y la nota", () => {
    const h = html(createElement(AdminNotes, { subscriptionId: "s1", initialNotes: "Cliente de prueba", soloLectura: true }));
    expect(h).not.toContain("<textarea");
    expect(h).not.toContain("Guardar nota");
    expect(h).toContain("Cliente de prueba");
    expect(h).toContain(NOTA);
  });

  it("notas: en solo lectura sin texto dice «Sin notas.»; normales, hay campo y botón", () => {
    expect(html(createElement(AdminNotes, { subscriptionId: "s1", initialNotes: null, soloLectura: true }))).toContain("Sin notas.");
    const h = html(createElement(AdminNotes, { subscriptionId: "s1", initialNotes: "Hola" }));
    expect(h).toContain("<textarea");
    expect(h).toContain("Guardar nota");
    expect(h).not.toContain(NOTA);
  });
});

describe("pantalla de add-ons: la fila de la propia cuenta", () => {
  const celdas = (bloqueada: boolean) =>
    html(
      createElement(CeldasDeAddons, {
        user: { id: "u1", addonAgents: ["metra"] },
        bloqueada,
        toggling: {},
        deshabilitar: false,
        onToggle: () => {},
      }),
    );

  it("bloqueada: sin interruptores y con la nota breve (el mensaje completo va en el title)", () => {
    const h = celdas(true);
    expect(h).not.toContain('role="switch"');
    expect(h).toContain('data-nota="autoconcesion"');
    expect(h).toContain("solo un propietario");
    expect(h).toContain("grid-column:span 4");
  });

  it("no bloqueada: cuatro interruptores, el de Metra encendido", () => {
    const h = celdas(false);
    expect(h.match(/role="switch"/g)).toHaveLength(4);
    expect(h.match(/aria-checked="true"/g)).toHaveLength(1);
    expect(h).not.toContain("autoconcesion");
  });
});
