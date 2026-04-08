/**
 * Mock AI responses for demo mode.
 * Returns realistic Spanish content for informe and acta.
 */

export function getMockInforme(propertyName: string, month: number, year: number): string {
  const months = [
    "Enero","Febrero","Marzo","Abril","Mayo","Junio",
    "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
  ];
  const m = months[month - 1];

  return `# Informe de Gestion Mensual
## ${propertyName}
### Periodo: ${m} ${year}

---

## 1. Resumen Ejecutivo

Durante el mes de ${m} de ${year}, la administracion de **${propertyName}** reporta un desempeno satisfactorio en todas las areas de gestion. Se destaca el cumplimiento del 94% de las actividades programadas, la reduccion de la cartera morosa en un 8% respecto al mes anterior, y la culminacion exitosa del mantenimiento preventivo de la red hidraulica del bloque B.

El indice de satisfaccion de los residentes se mantiene en 4.2/5.0 segun la encuesta mensual aplicada a 67 propietarios.

---

## 2. Gestion Administrativa

### 2.1 Comunicaciones
- Se enviaron 12 circulares informativas a propietarios y residentes.
- Se atendieron 34 PQRS (Peticiones, Quejas, Reclamos y Sugerencias), con un tiempo de respuesta promedio de 2.3 dias habiles.
- Se realizaron 2 reuniones del Consejo de Administracion los dias 8 y 22 de ${m}.

### 2.2 Documentacion
- Actualizacion del manual de convivencia (version 3.2).
- Renovacion de polizas de seguros de areas comunes.
- Registro de 3 nuevos arrendatarios en el libro de moradores.

### 2.3 Novedades de Personal
- El personal de aseo y porteria cumplio el 100% de sus turnos asignados.
- Se realizo capacitacion en atencion al cliente para los 4 porteros del conjunto.

---

## 3. Gestion Financiera

### 3.1 Ingresos del Mes
| Concepto | Valor |
|----------|-------|
| Cuotas de administracion | $48.600.000 |
| Parqueaderos visitantes | $1.240.000 |
| Salon comunal | $380.000 |
| Multas y sanciones | $210.000 |
| **Total Ingresos** | **$50.430.000** |

### 3.2 Egresos del Mes
| Concepto | Valor |
|----------|-------|
| Nomina y seguridad social | $18.200.000 |
| Servicios publicos areas comunes | $6.800.000 |
| Mantenimiento y reparaciones | $4.350.000 |
| Vigilancia | $9.100.000 |
| Gastos administrativos | $2.100.000 |
| **Total Egresos** | **$40.550.000** |

**Superavit del mes: $9.880.000**

### 3.3 Estado de Cartera
- Cartera total vigente: $12.300.000 (8 propietarios en mora)
- Cartera en cobro juridico: $3.200.000 (2 unidades)
- Recaudo del mes: 94.6% sobre el presupuesto

### 3.4 Fondo de Imprevistos
Saldo acumulado al cierre del mes: **$28.750.000**

---

## 4. Gestion de Mantenimiento

### 4.1 Mantenimiento Preventivo Realizado
- Revision y limpieza de tanques de agua potable (bloque A y B).
- Mantenimiento de 6 ascensores (empresa certificada Ascensores TEC).
- Poda y fertilizacion de zonas verdes (8.000 m2).
- Revision del sistema electrico de parqueaderos.
- Fumigacion general de areas comunes.

### 4.2 Correctivos Atendidos
- Reparacion de fuga en tuberia principal bloque C, apto 302 (2 dias de atencion).
- Cambio de motor de la piscina.
- Reparacion de 3 luminarias en el salon comunal.
- Ajuste de puertas en areas comunes (4 unidades).

### 4.3 Obras en Curso
- Impermeabilizacion de cubierta bloque A: avance 65%, finalizacion estimada en ${months[month % 12]} ${month === 12 ? year + 1 : year}.

---

## 5. Gestion de Seguridad

### 5.1 Novedades del Mes
- Total de ingresos registrados: 4.823
- Total de visitantes: 1.247
- Incidentes reportados: 2 (perdida de elemento menor en zona comun y riña verbal entre residentes, ambos resueltos)

### 5.2 Protocolos Implementados
- Actualizacion del sistema de camaras (se instalaron 4 nuevas camaras en parqueaderos).
- Revision del protocolo de acceso para domicilios y mensajeria.

---

## 6. Gestion de Convivencia

### 6.1 PQRS Recibidas por Categoria
| Categoria | Cantidad | Resueltas |
|-----------|----------|-----------|
| Ruido y convivencia | 12 | 10 |
| Mantenimiento | 8 | 8 |
| Financiera | 6 | 6 |
| Mascotas | 4 | 4 |
| Otros | 4 | 3 |
| **Total** | **34** | **31** |

### 6.2 Compromisos Pendientes
- 3 PQRS en proceso de atencion, con respuesta proyectada en los proximos 5 dias habiles.

---

## 7. Indicadores de Gestion

| Indicador | Meta | Resultado | Cumplimiento |
|-----------|------|-----------|--------------|
| Recaudo administracion | 95% | 94.6% | 99.6% |
| PQRS resueltas < 3 dias | 90% | 91.2% | 101.3% |
| Actividades preventivas | 100% | 100% | 100% |
| Satisfaccion residentes | 4.0/5 | 4.2/5 | 105% |
| Incidentes de seguridad | < 5 | 2 | 100% |

---

## 8. Plan de Accion - Proximo Mes

1. Culminar impermeabilizacion de cubierta bloque A.
2. Iniciar proceso juridico a 2 deudores con mora superior a 90 dias.
3. Realizar asamblea general ordinaria (convocatoria enviada).
4. Mantenimiento preventivo de la subestacion electrica.
5. Instalacion de 10 nuevas luminarias LED en vias internas.
6. Capacitacion a residentes en uso adecuado de zonas comunes.

---

## 9. Conclusiones y Recomendaciones

La gestion del mes de ${m} muestra resultados positivos en las principales areas de administracion. Se recomienda:

- **Incrementar las acciones de cobro** a los deudores para reducir la cartera morosa por debajo del 5% del presupuesto.
- **Priorizar el proyecto de iluminacion LED** como medida de ahorro energetico a mediano plazo (proyeccion de ahorro: 18% en factura electrica).
- **Programar la asamblea ordinaria** con suficiente anticipacion para garantizar el quorum reglamentario.

*Informe elaborado por: Administracion ${propertyName}*
*Fecha de elaboracion: ${new Date().toLocaleDateString("es-CO", { year: "numeric", month: "long", day: "numeric" })}*`;
}

export function getMockActa(propertyName: string, month: number, year: number): string {
  const months = [
    "Enero","Febrero","Marzo","Abril","Mayo","Junio",
    "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
  ];
  const m = months[month - 1];
  const day = 28;

  return `# ACTA DE REUNION DEL CONSEJO DE ADMINISTRACION
## N° ${String(month).padStart(2, "0")}-${year}

---

**Propiedad Horizontal:** ${propertyName}
**Tipo de Reunion:** Ordinaria del Consejo de Administracion
**Fecha:** ${day} de ${m} de ${year}
**Hora de Inicio:** 7:00 p.m.
**Hora de Cierre:** 9:15 p.m.
**Lugar:** Salon Comunal, ${propertyName}

---

## ASISTENTES

**Miembros del Consejo de Administracion:**
- Carlos Andres Ramirez Perez — Presidente del Consejo (coef. 2.45%)
- Maria Fernanda Lopez Gil — Vocal Principal (coef. 2.10%)
- Jorge Enrique Suarez Mora — Vocal Principal (coef. 1.98%)
- Ana Lucia Vargas Torres — Vocal Suplente (coef. 1.87%)
- Roberto Carlos Mendez — Vocal Suplente (coef. 2.02%)

**Administracion:**
- Luz Marina Pedraza — Administradora del Conjunto
- Juan Felipe Arenas — Contador (invitado)

**Total coeficiente representado:** 10.42%
*(Quorum deliberatorio y decisorio: CUMPLIDO segun articulo 45 del Reglamento de Propiedad Horizontal)*

---

## ORDEN DEL DIA

1. Verificacion del quorum y apertura de la sesion.
2. Lectura y aprobacion del orden del dia.
3. Lectura y aprobacion del acta anterior (N° ${String(month - 1 > 0 ? month - 1 : 12).padStart(2, "0")}-${month - 1 > 0 ? year : year - 1}).
4. Informe de administracion - ${m} ${year}.
5. Informe financiero y estado de cartera.
6. Aprobacion de gastos extraordinarios.
7. Seguimiento a obras y mantenimientos.
8. Proposiciones y varios.

---

## DESARROLLO

### PUNTO 1 — Verificacion del Quorum y Apertura

La administradora Luz Marina Pedraza verifica la asistencia de los miembros del Consejo y constata que se cuenta con quorum suficiente para deliberar y decidir. A las 7:08 p.m. se declara formalmente abierta la sesion.

### PUNTO 2 — Lectura y Aprobacion del Orden del Dia

Se da lectura al orden del dia propuesto. El consejero Jorge Enrique Suarez propone incluir como punto adicional en "Proposiciones y varios" el tema de la solicitud de permiso para reforma en el apartamento 504. La asamblea acepta la inclusion.

**Votacion:** 5 a favor, 0 en contra, 0 abstenciones.
**APROBADO POR UNANIMIDAD.**

### PUNTO 3 — Lectura y Aprobacion del Acta Anterior

La administradora da lectura al Acta N° ${String(month - 1 > 0 ? month - 1 : 12).padStart(2, "0")}-${month - 1 > 0 ? year : year - 1}. La consejera Maria Fernanda Lopez solicita correccion en el punto 6 respecto al monto del fondo de imprevistos. Se realiza la correccion y se somete a votacion.

**Votacion:** 5 a favor, 0 en contra, 0 abstenciones.
**APROBADA CON CORRECCIONES.**

### PUNTO 4 — Informe de Administracion

La administradora presenta el informe de gestion del mes de ${m} de ${year}, destacando:

- Recaudo del 94.6% de cuotas de administracion.
- Atencion de 34 PQRS con 91% de resolucion en terminos.
- Culminacion del mantenimiento preventivo de los 6 ascensores.
- Avance del 65% en la impermeabilizacion del bloque A.

El consejero Carlos Ramirez consulta sobre los 2 incidentes de seguridad reportados. La administradora explica que fueron atendidos oportunamente y no ameritaron intervencion de autoridades.

**El Consejo toma nota del informe.**

### PUNTO 5 — Informe Financiero y Estado de Cartera

El contador Juan Felipe Arenas presenta el estado financiero del mes:

- **Ingresos:** $50.430.000
- **Egresos:** $40.550.000
- **Superavit mensual:** $9.880.000
- **Cartera morosa:** $12.300.000 (8 propietarios)
- **Fondo de imprevistos:** $28.750.000

La consejera Ana Lucia Vargas pregunta sobre las 2 unidades en cobro juridico. La administradora informa que el proceso esta a cargo del abogado externo Dr. Hernando Castro y se espera respuesta del juzgado en las proximas semanas.

**El Consejo aprueba el informe financiero.**

### PUNTO 6 — Aprobacion de Gastos Extraordinarios

La administradora presenta para aprobacion los siguientes gastos extraordinarios:

**a) Instalacion de 10 luminarias LED en vias internas — $4.200.000**

Justificacion: reduccion del consumo electrico y mejora de la seguridad en las zonas de parqueo.

*Cotizaciones presentadas:*
- Empresa ElectroPH Ltda.: $4.200.000
- Iluminacion Moderna SAS: $4.800.000
- LightTech Colombia: $5.100.000

Se recomienda adjudicar a ElectroPH Ltda. por ser la propuesta mas economica con garantia de 2 anos.

**Votacion:** 5 a favor, 0 en contra, 0 abstenciones.
**APROBADO. Se autoriza a la administracion contratar con ElectroPH Ltda. por $4.200.000 con cargo al rubro de mantenimiento.**

**b) Reparacion de motor de la piscina — $2.800.000** *(ya ejecutado como urgencia)*

La administradora informa que el motor presento falla total y fue necesario realizar la reparacion de urgencia para mantener el funcionamiento de la piscina. El gasto fue cubierto con el fondo de imprevistos.

**Votacion ratificando el gasto:** 5 a favor, 0 en contra, 0 abstenciones.
**RATIFICADO.**

### PUNTO 7 — Seguimiento a Obras y Mantenimientos

La administradora presenta el estado de la obra de impermeabilizacion del bloque A:

- **Avance:** 65%
- **Presupuesto ejecutado:** $18.500.000 de $28.000.000 total
- **Fecha estimada de entrega:** ${months[month % 12]} ${month === 12 ? year + 1 : year}
- **Empresa contratista:** Impermeabilizaciones del Norte SAS

El consejero Roberto Mendez solicita visita tecnica conjunta para verificar la calidad de los trabajos. La administracion acoge la solicitud y programa la visita para el proximo sabado.

**El Consejo toma nota y acepta la solicitud de visita tecnica.**

### PUNTO 8 — Proposiciones y Varios

**8.1 Solicitud de permiso de reforma — Apartamento 504**

El propietario del apartamento 504, senor Andres Camelo, solicita permiso para ampliar la cocina integrando el cuarto de ropas, conforme al plano adjunto radicado en administracion el 20 de ${m}.

La administradora verifica que la solicitud cumple con los requisitos del Reglamento de Propiedad Horizontal (articulo 17) y que la obra no afecta estructura ni zonas comunes.

**Votacion:** 5 a favor, 0 en contra, 0 abstenciones.
**APROBADO, con las siguientes condiciones:**
1. Horario de obras: lunes a viernes 8:00 a.m. - 5:00 p.m.
2. Deposito de garantia: $500.000 reembolsable al finalizar.
3. Plazo maximo de ejecucion: 45 dias calendario.

**8.2 Convocatoria Asamblea General Ordinaria**

La administradora informa que se dara inicio al proceso de convocatoria para la Asamblea General Ordinaria anual, a realizarse en el mes de ${months[month % 12]} ${month === 12 ? year + 1 : year}. Se autoriza a la administracion enviar la convocatoria con 20 dias de anticipacion, conforme a la Ley 675 de 2001.

---

## CIERRE

No habiendo mas asuntos que tratar, el Presidente del Consejo declara cerrada la sesion a las 9:15 p.m.

La presente acta sera sometida a aprobacion en la proxima reunion del Consejo de Administracion.

---

**FIRMAS:**

| Cargo | Nombre | Firma |
|-------|--------|-------|
| Presidente del Consejo | Carlos Andres Ramirez Perez | __________________ |
| Secretaria de la Reunion | Luz Marina Pedraza | __________________ |

---

*Acta N° ${String(month).padStart(2, "0")}-${year} — ${propertyName}*
*Elaborada segun lo dispuesto en la Ley 675 de 2001 y el Reglamento de Propiedad Horizontal vigente.*`;
}

// Simulated delay to make the demo feel realistic
export function simulateProcessingDelay(ms = 4000): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
