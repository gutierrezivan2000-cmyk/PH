export const dynamic = "force-dynamic";

import { eliteGate } from "@/components/empresa/EmpresaGate";
import { EmpresaShell } from "@/components/empresa/EmpresaShell";
import { BatchGenerator } from "@/components/empresa/BatchGenerator";
import { Boton, CabeceraPieza, Pagina, Pieza } from "@/components/kit";

export default async function EmpresaGenerarPage() {
  const elite = await eliteGate();

  return (
    <EmpresaShell elite={elite}>
      <Pagina>
        <Pieza className="emp-con-miga">
          <style href="k-empresa-miga" precedence="default">
            {`.emp-con-miga { padding-top: 20px; } .emp-miga { margin: 0 0 16px -8px; }`}
          </style>
          <Boton variante="fantasma" tam={40} flecha="vuelve" href="/empresa" className="emp-miga">
            Volver al resumen
          </Boton>
          <CabeceraPieza
            nn="02"
            titulo="Generar en lote"
            subtitulo="Produce los informes y actas del mes de todas las propiedades con datos cargados, en una sola acción."
          />

          <BatchGenerator />
        </Pieza>
      </Pagina>
    </EmpresaShell>
  );
}
