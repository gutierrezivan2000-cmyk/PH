/**
 * Los cuatro agentes complementarios (Metra, Nomethes, Hermes, Logistes) siguen «Próximamente» para el público, pero durante el
 * piloto los usan quienes pueden usar el módulo al que pertenece cada uno (los admins y la lista de testers), sin necesidad de
 * tener el complemento comprado.
 */
import type { AgentId } from "@/lib/agents";
import type { ComingSoonKey } from "@/lib/feature-flags";

export const MODULO_DEL_AGENTE: Partial<Record<AgentId, ComingSoonKey>> = {
  metra: "cartera",
  nomethes: "asambleas",
  hermes: "comunicados",
  logistes: "pqrs",
};

export function agentePausadoAbierto(agentId: AgentId, visibles: Record<ComingSoonKey, boolean>): boolean {
  const m = MODULO_DEL_AGENTE[agentId];
  return Boolean(m && visibles[m]);
}
