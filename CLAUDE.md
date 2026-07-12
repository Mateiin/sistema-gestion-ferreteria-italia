# CLAUDE.md — Sistema de gestión para la ferretería

Este archivo le da contexto a Claude para trabajar en este proyecto. Leelo al
inicio de cada sesión. Manténganlo actualizado: un CLAUDE.md viejo manda a
construir sobre supuestos que ya no valen.

> Última actualización: Ventas (Ficha) Fase 1 implementada y probada de punta a
> punta — clientes, ficha con líneas, invariante de una ficha abierta por
> cliente reforzada con índice único parcial en la base. Facturación cerrada.
> Próximo: Fase 2 (emitir la ficha + enganchar cuentas corrientes) y caja.

---

## Contexto

Sistema de gestión para la ferretería del suegro de Mateo (estudiante de Ing. en
Sistemas). Doble propósito: **herramienta real** que el negocio va a usar, y
**pieza de portfolio/CV**. Las decisiones se toman con las dos cosas en mente.

El titular (la empresa, "Refrigeración Dimundo S.A.S.") es **Responsable
Inscripto** y factura A y B.

---

## Alcance: son DOS sistemas separados

Corren en dos computadoras distintas y **por ahora no se comunican entre sí**.

### Sistema A — Depósito (en la casa)
- ABM simple de productos: **nombre, código, cantidad, proveedor**.
- Listado alfabético + buscador. Todavía no arrancado.

### Sistema B — Local (`sistema-local/`)
1. **Caja**: montos que entran y salen, solo importes. Todavía no arrancado.
2. **Ventas / Ficha + Cuentas corrientes (fiado)**: Fase 1 (clientes + ficha +
   líneas) **implementada**. Emisión y cuentas corrientes reales (Fase 2)
   **pendientes** — ver sección "Ventas (Ficha)".
3. **Facturación electrónica (ARCA)**: **COMPLETA y probada en homologación.**

> **Regla de consistencia:** el **código de producto** debe ser consistente entre
> ambos sistemas desde el arranque, para el día que haya que cruzar stock.

---

## Stack técnico

- **Backend:** NestJS + TypeORM · **DB:** PostgreSQL · **Frontend:** Angular
  (standalone) — no arrancado · **Infra:** Docker Compose (local/offline).
- **Lenguaje:** TypeScript · Node.js >= 18. El proyecto usa `tsx` para scripts.

---

## Decisiones ya tomadas

- Sin catálogo online. Búsqueda por nombre.
- **SDK de ARCA: `@arcasdk/core` (ex `afip.ts`), pinneado exacto a `2.0.0`**
  (sin `^`). Self-contained: habla directo con ARCA, sin intermediarios ni token.
  - **Decisión de seguridad (no reabrir sin motivo):** se descartó
    `@ramiidv/arca-sdk` por riesgo de cadena de suministro y `@afipsdk/afip.js`
    por enrutar a terceros. De `@arcasdk/core` se auditó el tarball antes de
    instalar y se pinneó la versión.
- **Puertos y adaptadores** para ARCA: el sistema depende de `ArcaProvider`, no
  del SDK. Cambiar de librería = reescribir solo el adapter.
- **Multi-tenant desde el diseño** (concepto de `Emisor` configurable).
- **Siempre empezar en homologación.**
- Backups no negociables (sección aparte).
- El "en negro" es responsabilidad del titular. El sistema es registro fiel; NO
  se programan trucos para ocultar ni doble contabilidad.

---

## Facturación (ARCA) — `sistema-local/src/facturacion/` — COMPLETA

**Estado: emite A y B, anula con NC y genera PDF con QR. Todo probado de punta a
punta en homologación.**

### Arquitectura
- `interfaces/arca-provider.interface.ts` — PORT (intención de dominio).
- `providers/arca-sdk.provider.ts` — ADAPTER con `@arcasdk/core`
  (`electronicBillingService`: getLastVoucher / createNextVoucher).
- `gestor/facturacion.gestor.ts` / `FacturacionGestor` — orquesta emisión y anulación.
- `dto/crear-factura.dto.ts` — ítems con alícuota propia + unidad de medida;
  receptor; condición de venta.
- `modelo/comprobante.entity.ts` — persiste comprobante + CAE + detalle.
- `config/emisor.ts` — datos del emisor desde `.env` (cert/key por PATH).
- `pdf/comprobante-pdf.provider.ts` — PDF con `pdfmake` + QR con `qrcode`.

### Cómo se emite
WSAA (autenticación con certificado) → Ticket de Acceso → WSFEv1 → CAE. El SDK
maneja el WSAA y el cacheo del ticket.

### IVA: el cálculo DEPENDE del tipo de comprobante (crítico)
`Comprobante.calcularImportesLinea(tipoFactura, cantidad, precioUnitario, ivaPorcentaje)`:
- **Factura A**: `precioUnitario` es NETO. Se SUMA el IVA. El IVA se discrimina.
- **Factura B (y C)**: `precioUnitario` viene CON IVA INCLUIDO. El neto se
  EXTRAE: `neto = precio / (1 + iva/100)`. El IVA va contenido.
- **Redondeo**: se acumula sin redondear y se redondea UNA vez por alícuota
  agrupada (no por línea). Redondear por línea da diferencias de centavos que
  ARCA rechaza. Verificado: 3 ítems misma alícuota → 10165.29 agrupando vs
  10165.28 por línea.
- Front (pendiente): la pantalla de carga debe dejar EXPLÍCITO si el precio va con
  o sin IVA según el tipo, o el operador se equivoca (nos pasó a nosotros).

### Qué se envía a ARCA y qué no
WSFEv1 **no recibe líneas de detalle**: solo totales por alícuota. Por lo tanto,
`descripcion`, `cantidad`, `unidadMedida` y `condicionVenta` son **registro local
+ PDF**, NO viajan a ARCA. Viven en el jsonb `detalle` del Comprobante. La factura
que ARCA autoriza y el PDF comercial no son idénticos: ARCA valida totales + CAE,
el detalle lo agregamos nosotros.

### Nota de crédito
Anula (una factura con CAE no se borra). CbteTipo 3 (NC-A) / 8 (NC-B), con
`CbtesAsoc` al original. `anularFactura(id)` reconstruye la NC desde lo
persistido, marca el original como anulado y hereda `detalle` y `condicionVenta`.
Requiere `ivaDesglose` y `condicionIvaReceptor` guardados (los comprobantes
previos a esos campos se detectan y avisan, no rompen).

### Condición de venta — gancho con el fiado
Enum `CondicionVenta` (mismos 7 valores que ARCA: CONTADO, TARJETA_DEBITO,
TARJETA_CREDITO, CUENTA_CORRIENTE, CHEQUE, TRANSFERENCIA_BANCARIA, OTRA). Cuando es
`CUENTA_CORRIENTE`, la factura es fiada. Hay un `// TODO(ctacte)` en
`FacturacionGestor.emitirFactura` donde el futuro módulo de cuentas corrientes
debe disparar el cargo al cliente. **No implementado aún, a propósito.**

### Homologación vs. Producción — ¡OJO, confunde!
Ambientes separados, certificados distintos y **CUITs distintos** en esta etapa:

| | Certificado | CUIT (cert = "representado" = `EMISOR_CUIT`) | Pto. venta |
|---|---|---|---|
| **Homologación** (hoy) | generado en WSASS con el **CUIT personal de Mateo** | **CUIT personal de Mateo** | 1 |
| **Producción** (futuro) | el `.crt` de ARCA | **CUIT de la empresa** | el "RECE web services" creado en ARCA |

Los tres valores (cert, representado, `EMISOR_CUIT`) deben ser el MISMO CUIT. Error
600 "No apareció CUIT en lista de relaciones" = quedó el CUIT de la empresa en el
`.env` mientras se prueba con el cert personal. **En homologación NO se asocia el
CUIT de la empresa en el portal.** Cert de homologación solo sirve en
homologación (mezclar da "computador no autorizado").

### Códigos ARCA
- Comprobante: 1=Fact A, 6=Fact B, 11=Fact C, 3=NC A, 8=NC B.
- DocTipo: 80=CUIT, 96=DNI, 99=Consumidor Final (DocNro 0).
- IVA (Id): 5=21%, 4=10.5%, 6=27%, 3=0%.

### Seguridad del certificado
- La `.key` nunca se versiona. `certs/` y `.env` en `.gitignore`.
- CUIT reales NO se hardcodean en el repo ni en este doc (van en `.env`).
- Pto. de venta del sistema (producción) distinto del de facturación manual.
- Egress del contenedor de facturación restringida a dominios de ARCA.

---

## Base de datos — migraciones

- Migraciones de TypeORM **activas** (`data-source.ts`, scripts
  `migration:generate/run/revert/create` con `tsx`). `synchronize: false`.
  `migrationsRun: true` al arrancar.
- Todo cambio de esquema: `migration:generate` → revisar → commit →
  `migration:run` en cada base. **Prohibido `synchronize` y ALTER manual.**
- Nota: los cambios dentro del jsonb `detalle` NO requieren migración (no tiene
  esquema fijo en Postgres).
- El sistema del depósito, cuando arranque, necesitará su propia infra de
  migraciones (es otra base en otra PC).

---

## Ventas (Ficha) — `sistema-local/src/ventas/` — Fase 1 implementada

Este es el flujo real de trabajo del negocio, confirmado con el suegro. Es el
"modelo rico" que se había puesto en pausa: **vuelve y es el corazón del local.**
La Fase 1 (clientes + ficha + líneas, sin emisión) ya está construida y probada;
la Fase 2 (emitir la ficha y enganchar cuentas corrientes) es lo que sigue.

### Fase 1 (hecho): clientes + ficha + líneas
- MMSC + GRASP, misma forma que `facturacion/`: `modelo/` (`Cliente`, `Venta`,
  `LineaVenta`), `gestor/` (`ClientesGestor`, `VentasGestor`), `controlador/`
  (`ClientesController`, `VentasController`), `dto/`, `modulo/ventas.module.ts`.
- `Venta.total()` es el Information Expert: suma los subtotales
  (`cantidad * precioUnitario`) de sus líneas. El Gestor no calcula nada, solo
  valida que la ficha esté ABIERTA antes de tocar sus líneas.
- Endpoints: `POST /clientes`, `GET /clientes` (`?nombre=` para buscar),
  `GET /clientes/:id`, `PUT /clientes/:id`; `POST /ventas/abrir` (abre o
  devuelve la ficha ABIERTA del cliente), `GET /ventas/abiertas`,
  `GET /ventas/:id`, `POST /ventas/:id/lineas`,
  `DELETE /ventas/:id/lineas/:lineaId`. Agregar/quitar líneas solo si la ficha
  está ABIERTA (400 si no).
- **Invariante "una ficha abierta por cliente"** reforzada en dos capas:
  `VentasGestor.abrirFicha` busca antes de crear, y además hay un índice único
  parcial en la base (`UNIQUE (clienteId) WHERE estado = 'ABIERTA'`, migración
  `AddClientesYVentas`) que la garantiza aunque la capa de aplicación falle.
  Verificado insertando directo por SQL: la base rechaza el duplicado.
- `Venta.comprobanteId` y el estado `EMITIDA` quedan preparados pero sin usar
  todavía: `// TODO(fase2-emision)` en `VentasGestor` marca dónde va a ir
  emitir la ficha como factura (reusando `FacturacionGestor`) o imprimirla
  como presupuesto.
- Probado de punta a punta: cliente → abrir ficha → 2 líneas → total correcto;
  reabrir la misma ficha no crea otra; `GET /ventas/abiertas` lista las
  fichas abiertas con cliente y total (la futura "pestaña de cuentas
  corrientes").

### La "ficha" = una venta que vive en el tiempo
- Se entra a **Ventas**, se elige el cliente y se abre su **ficha** (los datos del
  cliente se autocompletan desde su registro).
- **Una ficha por cliente, abierta durante el mes.** Se le van agregando líneas de
  mercadería (producto + precio) cada vez que el cliente se lleva algo. No se
  cierra hasta que se emite. Ej. real: la cooperativa de agua pasa 2-3 veces por
  día; se le carga cada ítem a la misma ficha.
- Es una `Venta` con `LineaVenta` y **estados** (abierta → emitida).

### Fase 2 (pendiente): formas de emisión (se elige al final y se puede cambiar)
- **Presupuesto**: imprime una copia común, **NO fiscal, NO cierra la ficha, NO
  cambia ningún saldo.** Es solo un papel de lo que hay cargado hasta el momento.
- **Factura**: va a ARCA (CAE), se imprime y queda registrada (usa el módulo de
  facturación ya hecho). Al emitirla se elige la **condición de venta**:
  - **CONTADO**: la factura queda **pagada** al instante. Es como trabaja el
    suegro casi siempre.
  - **CUENTA_CORRIENTE**: el importe va al **debe** del cliente, se cobra después.
- **Remito**: mencionado antes, no fiscal; tratarlo como una forma de impresión
  más si hace falta.

### Dónde vive la deuda (importante, no confundir)
- La deuda vive en la **ficha abierta** (lo que el cliente se llevó y no saldó),
  NO en el presupuesto. El presupuesto es solo una impresión.
- Lo que **salda** es la factura: en CONTADO queda pagada; en CUENTA_CORRIENTE
  pasa al debe.
- El `condicionVenta` que YA existe en el módulo de facturación es exactamente
  esta bisagra. El `// TODO(ctacte)` en `FacturacionGestor.emitirFactura` es donde
  la factura CUENTA_CORRIENTE debe sumar al saldo del cliente.

### Simplificación que permite el flujo del suegro
Como él salda todo al facturar en contado, el caso de **pagos parciales imputados
contra facturas viejas** es SECUNDARIO (solo aplica a la factura en cuenta
corriente, que dice no usar). Construir primero el flujo principal (ficha →
presupuesto → factura contado). Para el saldo de cuenta corriente, empezar con un
**saldo global simple** por cliente y afinar la imputación solo si empieza a usar
la factura CC.

### Pendiente de confirmar (del lado de los pagos, menor)
- Cuando cobra una factura en cuenta corriente y le pagan una parte: ¿imputa
  contra la factura puntual o baja el saldo global? (Baja prioridad: no lo usa hoy.)
- ¿Da recibo al cobrar una CC? (Baja prioridad por lo mismo.)

---

## Estrategia de backup (CRÍTICO)

Dato irremplazable: **saldos de cuentas corrientes (fiado)**. Stock y precios el
suegro los tiene de memoria.

Cada noche, a **pendrive + Google Drive**, con **fecha en el nombre** (nunca
sobrescribir; retener ~30 días):
- `dump_AAAA-MM-DD.sql` — `pg_dump` completo.
- `saldos_AAAA-MM-DD.csv` — nombre, teléfono y saldo de cada deudor, **legible sin
  el sistema**.

Como contenedor/cron en el Compose.

---

## Convenciones de código

- **Español** para dominio y comentarios.
- Dominio separado de infraestructura; servicios externos detrás de un puerto.
- Plata en `decimal`/`numeric`, **nunca float**. Cantidades fraccionables en decimal.
- `class-validator` en DTOs.
- Dependencias que tocan cert/key: versión pinneada exacta y auditada.
- Aplicar patrones GRASP donde corresponda (ej. Information Expert:
  `calcularImportesLinea` vive en la entidad que tiene los datos).
- Tests: mínimo el e2e de facturación en homologación.

---

## Estado actual y pendientes

Hecho:
- [x] Trámite ARCA producción (cert + punto de venta).
- [x] Certificado de homologación (WSASS) + autorización a `wsfe`.
- [x] Facturación A/B con IVA correcto por tipo, probada de punta a punta.
- [x] Nota de crédito. PDF con QR. Unidad de medida + condición de venta.
- [x] Infra de migraciones versionadas.
- [x] **Ventas (Ficha) Fase 1**: clientes + ficha + líneas
      (`sistema-local/src/ventas/`), MMSC + GRASP, invariante de ficha única
      por cliente reforzada con índice único parcial (migración
      `AddClientesYVentas`). Probada de punta a punta. Sin emisión todavía
      (ver "Ventas (Ficha)" → Fase 2).

Pendiente:
- [ ] **Ventas (Ficha) Fase 2**: emitir la ficha como factura (reusando
      `FacturacionGestor`, condición CONTADO/CUENTA_CORRIENTE) o imprimirla
      como presupuesto no fiscal; consumir el `TODO(fase2-emision)` de
      `VentasGestor` y el `TODO(ctacte)` de `FacturacionGestor` para que la
      factura CC sume al saldo del cliente.
- [ ] **Módulo de cuentas corrientes real** (saldo por cliente derivado de los
      movimientos — ver "Ventas (Ficha)").
- [ ] **Módulo de caja** (montos in/out + arqueo).
- [ ] **Sistema del depósito** (ABM de productos).
- [ ] Front en Angular (incluye el selector de IVA 21/10,5 y dejar explícito si el
      precio va con o sin IVA según el tipo).
- [ ] **Factura C**: sumar CbteTipo 11 (la lógica de IVA extraído ya existe en
      `calcularImportesLinea`). Pendiente de confirmar con el titular si la necesita.
- [ ] Factura A: capturar razón social y domicilio del receptor (obligatorios).
- [ ] Datos legales del emisor en el `.env` (domicilio, IIBB, inicio de
      actividades) — los carga Mateo.
- [ ] Antes de producción: `.gitignore` tapando `certs/` y `.env`, egress
      restringida, `.key` de producción respaldada.

### Preguntas abiertas para la próxima charla con el suegro
- ¿Aclarar el tema Factura C? (aparecía en pantallas siendo él RI).
- ¿Cómo imputa los pagos parciales del fiado: contra ventas o saldo global?
- Datos legales reales (domicilio, IIBB, inicio de actividades).

---

## Qué NO hacer

- No facturar contra producción hasta tener todo probado en homologación.
- No asociar el CUIT de la empresa en el portal para pruebas de homologación (el
  error 600 se arregla en el `.env`).
- No versionar `.key` ni `.env`; no hardcodear CUIT reales.
- No usar `float` para montos.
- No cambiar el SDK de ARCA ni despinnear la versión sin re-auditar.
- No implementar el modelo rico de stock/ventas/presentaciones sin confirmarlo.
- No agregar features que el suegro no pidió "porque quedan lindas".
- No asumir que el detalle del comprobante viaja a ARCA: no lo hace (WSFEv1 solo
  totales).