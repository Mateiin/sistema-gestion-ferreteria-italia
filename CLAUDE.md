# CLAUDE.md — Sistema de gestión para la ferretería

Este archivo le da contexto a Claude para trabajar en este proyecto. Leelo al
inicio de cada sesión. Manténganlo actualizado: un CLAUDE.md viejo manda a
construir sobre supuestos que ya no valen.

> Última actualización: rediseño del PDF de factura/NC y presupuesto para
> seguir el molde oficial de ARCA (encabezado, franja del receptor, tabla de
> ítems de 9 columnas, totales con IVA discriminado en A). Logo del emisor
> opcional vía `EMISOR_LOGO_PATH`. Ver "Facturación (ARCA)" → "PDF: molde
> oficial de ARCA". Próximo: sistema del depósito.

---

## Contexto

Sistema de gestión para la ferretería del suegro de Mateo (estudiante de Ing. en
Sistemas). Doble propósito: **herramienta real** que el negocio va a usar, y
**pieza de portfolio/CV**. Las decisiones se toman con las dos cosas en mente.

El titular (la empresa, "Refrigeración Dimundo S.A.S.") es **Responsable
Inscripto** y factura A y B.

Siempre que pushees a github, hacelo desde mi cuenta, que no quede registro tuyo en el repo de github

Habla siempre en español

---

## Alcance: son DOS sistemas separados

Corren en dos computadoras distintas y **por ahora no se comunican entre sí**.

### Sistema A — Depósito (en la casa)
- ABM simple de productos: **nombre, código, cantidad, proveedor**.
- Listado alfabético + buscador. Todavía no arrancado.

### Sistema B — Local (`sistema-local/`)
1. **Caja**: montos que entran y salen, solo importes. Todavía no arrancado.
2. **Ventas / Ficha + Cuentas corrientes (fiado)**: **COMPLETA** (Fase 1 + Fase
   2) — clientes, ficha con líneas, presupuesto, facturar la ficha y cuenta
   corriente real. Ver sección "Ventas (Ficha)".
3. **Facturación electrónica (ARCA)**: **COMPLETA y probada en homologación.**
4. **Frontend (Angular)**: Fase 1 **implementada** — circuito núcleo (clientes,
   ficha, facturar, cuenta corriente). Caja y depósito quedan afuera hasta que
   existan esos módulos de backend. Ver sección "Frontend".

> **Regla de consistencia:** el **código de producto** debe ser consistente entre
> ambos sistemas desde el arranque, para el día que haya que cruzar stock.

---

## Stack técnico

- **Backend:** NestJS + TypeORM · **DB:** PostgreSQL · **Frontend:** Angular
  22 (standalone, sin NgModules) en `sistema-local/frontend/` — Fase 1 lista.
  **Infra:** Docker Compose (local/offline).
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

## Facturación (ARCA) — `sistema-local/backend/src/facturacion/` — COMPLETA

**Estado: emite A y B, anula con NC y genera PDF con QR, con el layout del
molde oficial de ARCA. Todo probado de punta a punta en homologación.**

### PDF: molde oficial de ARCA
`pdf/formato-arca.ts` arma los bloques del formulario oficial (encabezado con
la letra en un recuadro, franja del receptor, tabla de ítems de 9 columnas —
Código/Producto/Cantidad/U. medida/Precio Unit./% Bonif/Subtotal/Alícuota
IVA/Subtotal c/IVA — y bloque de totales) y lo reusan `pdf/comprobante-pdf.provider.ts`
(factura/NC, con QR y CAE) y `ventas/pdf/presupuesto-pdf.provider.ts`
(presupuesto, sin QR/CAE). Factura A: precio unitario y subtotal en NETO, IVA
discriminado por alícuota en totales. Factura B: precio unitario y subtotal
con IVA incluido (el dato guardado sigue siendo siempre NETO — es solo una
decisión de qué se imprime), totales sin discriminar. No hay "código de
producto" en este dominio todavía (ver "Sistema A — Depósito"), esa columna
sale en blanco. Logo del emisor opcional vía `EMISOR_LOGO_PATH` (.png/.jpg):
si falta, cae al texto de la razón social sin romper la generación. Detalle
completo en `facturacion/README.md`.

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

### IVA: `precioUnitario` siempre es NETO (confirmado con el titular)
`Comprobante.calcularImportesLinea(cantidad, precioUnitario, ivaPorcentaje)`:
- `precioUnitario` es siempre **NETO** (sin IVA), sea Factura A o B. Se SUMA
  el IVA en los dos casos — ya NO rama por tipo de comprobante. Así es como
  el suegro carga el precio en la ficha en la práctica (confirmado
  2026-07-13; reemplaza el supuesto anterior de "B viene con IVA incluido",
  que resultó incorrecto).
- **Redondeo**: se acumula sin redondear y se redondea UNA vez por alícuota
  agrupada (no por línea). Redondear por línea da diferencias de centavos que
  ARCA rechaza.
- Front: la pantalla de carga de la ficha (`ventas-ficha`) muestra el label
  fijo "Precio NETO (sin IVA)" — ver sección "Frontend".

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
TARJETA_CREDITO, CUENTA_CORRIENTE, CHEQUE, TRANSFERENCIA_BANCARIA, OTRA). Cuando
es `CUENTA_CORRIENTE`, la factura es fiada. `FacturacionGestor.emitirFactura`
YA NO conoce cuentas corrientes (se sacó el viejo `TODO(ctacte)`): el cargo lo
crea `VentasGestor.facturarFicha`, DESPUÉS de recibir el `Comprobante` ya
persistido — la dirección de dependencia es ventas → facturación, nunca al
revés (facturación es un módulo reusable, no debe saber quién la llama ni por
qué). Ver "Ventas (Ficha)" para el detalle completo del enganche.

### Receptor: razón social y domicilio (para el PDF, no para ARCA)
`ReceptorDto` (y `Comprobante`) ahora también guardan `razonSocial` y
`domicilio` del receptor — igual que `unidadMedida`/`condicionVenta`, WSFEv1
no los pide, son solo para el PDF impreso. Opcionales en el DTO (para no
romper llamadas directas a `/facturacion/facturas` que no los manden), pero
`VentasGestor.armarDtoFactura` los completa siempre desde el `Cliente` de la
ficha. Se heredan a la Nota de Crédito igual que `detalle`.

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
- Migraciones de Ventas Fase 2: `AddReceptorRazonSocialDomicilio` (2 columnas
  nullable en `comprobantes`) y `AddCuentaCorriente` (tabla
  `movimientos_cta_cte` + índice por `clienteId`, sin FK a `clientes` — mismo
  criterio que `comprobanteId`, referencia sin constraint).

---

## Ventas (Ficha) — `sistema-local/backend/src/ventas/` — COMPLETA (Fase 1 + Fase 2)

Este es el flujo real de trabajo del negocio, confirmado con el suegro. Es el
"modelo rico" que se había puesto en pausa: **vuelve y es el corazón del local.**
Fase 1 (clientes + ficha + líneas) y Fase 2 (presupuesto, facturar la ficha,
cuenta corriente real) están construidas y probadas de punta a punta.

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
- Probado de punta a punta: cliente → abrir ficha → 2 líneas → total correcto;
  reabrir la misma ficha no crea otra; `GET /ventas/abiertas` lista las
  fichas abiertas con cliente y total.

### Fase 2 (hecho): presupuesto, facturar la ficha y cuenta corriente
- `POST /ventas/:id/presupuesto` — PDF NO fiscal (sin CAE, sin QR), rotulado
  "Documento no válido como factura". Lo arma `PresupuestoPdfProvider`
  (`ventas/pdf/`, adapter aparte del de facturación, arma desde `Venta` +
  `Cliente`, no desde `Comprobante`) reusando `pdfmake` con el mismo criterio
  de seguridad (`setUrlAccessPolicy(() => false)`). No cambia el estado de la
  ficha ni ningún saldo — se puede pedir las veces que haga falta.
- `POST /ventas/:id/facturar { condicionVenta }` (CONTADO o CUENTA_CORRIENTE)
  — valida `Venta.validarPuedeFacturar()` (ABIERTA + al menos una línea,
  `FichaNoAbiertaError`/`FichaSinLineasError` → 400), deriva el tipo de
  factura del **cliente** (`Cliente.tipoFacturaCorrespondiente()`:
  RESPONSABLE_INSCRIPTO → A, el resto → B — el emisor es RI, por eso no hay
  Factura C acá), arma el `CrearFacturaDto` (receptor + líneas + condición de
  venta) y llama a `FacturacionGestor.emitirFactura` (reuso directo, ver
  `FacturacionModule.exports`).
  **Orden crítico por el efecto externo:** primero ARCA (CAE, ya persistido
  por el módulo de facturación); recién CON el CAE en mano, una transacción
  de DB (`DataSource.transaction`) marca `Venta.marcarEmitida(comprobanteId)`
  y — solo si `CUENTA_CORRIENTE` — crea el `MovimientoCtaCte` CARGO. Si ARCA
  falla, la ficha queda intacta (ABIERTA). Si falla la transacción de DB con
  el CAE ya emitido, **no se intenta deshacer el CAE** (no se puede): se
  loguea fuerte (`Logger.error` con el CAE y el id del comprobante) para
  intervención manual — el `Comprobante` ya está guardado y es recuperable
  vinculándolo a mano.
  `// TODO(caja)` en el mismo método: cuando exista el módulo de caja, ahí se
  registra el ingreso de una factura CONTADO.
- **Cuenta corriente real** (`modelo/movimiento-cta-cte.entity.ts` +
  `gestor/cuenta-corriente.gestor.ts`): `MovimientoCtaCte` (CARGO/PAGO) es el
  Information Expert/Creator (`crearCargo`, `crearPago`, `calcularSaldo` —
  suma CARGO menos PAGO, nunca una columna cacheada). El CARGO lo crea
  `VentasGestor.facturarFicha` (necesita ser atómico con la ficha, ver
  arriba); todo lo demás vive en `CuentaCorrienteGestor`:
  `POST /clientes/:id/pagos { monto, descripcion? }` (pago, imputación
  GLOBAL — ver "Simplificación" más abajo), `GET /clientes/:id/cuenta`
  (saldo + historial), `GET /clientes/con-saldo` (quién me debe — declarado
  ANTES de `GET /clientes/:id` en el controller a propósito, mismo motivo que
  `GET /ventas/abiertas` en Fase 1: si no, `:id` se come la ruta literal).
- Probado de punta a punta contra ARCA homologación: cliente Consumidor
  Final → ficha con 2 líneas → presupuesto (ficha sigue ABIERTA) → facturar
  CONTADO → Factura B con CAE, ficha EMITIDA, sin cargo en cta cte. Cliente
  Responsable Inscripto (con domicilio) → ficha → facturar CUENTA_CORRIENTE →
  Factura A con CAE (neto/IVA discriminado, `razonSocialReceptor`/
  `domicilioReceptor` en el PDF), CARGO por el total. Pago parcial →
  `GET /clientes/:id/cuenta` muestra CARGO y PAGO con el saldo neto correcto;
  `GET /clientes/con-saldo` lo lista. Agregar línea o volver a facturar una
  ficha ya EMITIDA → 400; facturar una ficha ABIERTA sin líneas → 400.

### La "ficha" = una venta que vive en el tiempo
- Se entra a **Ventas**, se elige el cliente y se abre su **ficha** (los datos del
  cliente se autocompletan desde su registro).
- **Una ficha por cliente, abierta durante el mes.** Se le van agregando líneas de
  mercadería (producto + precio) cada vez que el cliente se lleva algo. No se
  cierra hasta que se emite. Ej. real: la cooperativa de agua pasa 2-3 veces por
  día; se le carga cada ítem a la misma ficha.
- Es una `Venta` con `LineaVenta` y **estados** (abierta → emitida).

### Formas de emisión (hecho — se elige al final y se puede cambiar)
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
- El `condicionVenta` que ya existía en el módulo de facturación era
  exactamente esta bisagra; ahora `VentasGestor.facturarFicha` la consume:
  CUENTA_CORRIENTE crea el `MovimientoCtaCte` CARGO (ver Fase 2 arriba).

### Simplificación que permite el flujo del suegro (aplicada)
Como él salda todo al facturar en contado, el caso de **pagos parciales imputados
contra facturas viejas** es SECUNDARIO (solo aplica a la factura en cuenta
corriente, que dice no usar). Por eso `CuentaCorrienteGestor.registrarPago` hace
imputación **GLOBAL** (baja el saldo del cliente, no contra una factura
puntual) — a propósito, no es un olvido. Si empieza a usar la factura CC en
serio, ahí se afina la imputación puntual (ver "Pendiente de confirmar").

### Pendiente de confirmar (del lado de los pagos, menor)
- Cuando cobra una factura en cuenta corriente y le pagan una parte: ¿imputa
  contra la factura puntual o baja el saldo global? (Baja prioridad: no lo usa hoy.)
- ¿Da recibo al cobrar una CC? (Baja prioridad por lo mismo.)

### `precioUnitario` en la ficha: siempre NETO, confirmado (2026-07-13)
El precio que se carga en una línea de la ficha sigue la MISMA convención que
`Comprobante.calcularImportesLinea` (ver sección Facturación): **siempre
NETO (sin IVA)**, sea la ficha de un cliente Responsable Inscripto (Factura
A) o de cualquier otro (Factura B). Ya no depende del tipo de cliente/factura
— el supuesto anterior ("en B va con IVA incluido") no reflejaba cómo el
suegro carga los precios en la práctica y quedó reemplazado. El frontend
(ver sección "Frontend") muestra el label fijo "Precio NETO (sin IVA)" en la
pantalla de carga.

---

## Frontend — `sistema-local/frontend/` — Fase 1 implementada

Angular 22, standalone (sin NgModules, sin zoneless todavía), componentes con
`signal` + Reactive Forms. Fase 1 = el circuito núcleo (clientes, ficha,
facturar, cuenta corriente). **Nada de caja ni depósito** — esos módulos de
backend no existen todavía.

### Estructura
- `core/models/` — interfaces TS espejo de las entidades del backend
  (`Cliente`, `Venta`/`LineaVenta`, `Comprobante`, `MovimientoCtaCte`). Ojo:
  los `numeric`/`bigint` de Postgres llegan como **string** en el JSON (TypeORM
  no los convierte solo), así que esos campos están tipados `number | string`
  a propósito — no asumir que son número.
- `core/services/` — `ClientesService`, `VentasService`, `FacturacionService`:
  wrappers finos de `HttpClient`, un método por endpoint, rutas relativas
  (`/clientes`, `/ventas/...`).
- `core/interceptors/api-url.interceptor.ts` — el único lugar que conoce
  `environment.apiBaseUrl`: antepone la base a cualquier request que empiece
  con `/`. Cambiar de ambiente es cambiar solo `environment.ts`.
- `layout/shell/` — nav a Ventas / Clientes / Cuentas por cobrar.
- `features/clientes/` — `clientes-lista` (buscador con debounce) y
  `cliente-formulario` (alta y edición, mismo componente, reactive form).
- `features/ventas/ventas-ficha/` — **la pantalla principal**. Dos estados: sin
  `ventaId` en la ruta muestra el buscador de cliente (`POST /ventas/abrir` al
  elegir uno y navega a `/ventas/:id`); con `ventaId` muestra la ficha. El
  label del campo de precio es fijo ("Precio NETO (sin IVA)", ver
  `etiquetaPrecio()`) — ya no depende del tipo de factura del cliente.
  `tipoFacturaDeCliente(cliente)` (mismo mapeo que
  `Cliente.tipoFacturaCorrespondiente()` del backend, duplicado a propósito en
  `core/models/cliente.model.ts` para no acoplar el front a las entidades de
  TypeORM) se sigue usando para mostrar "Factura A/B" en el mensaje de ayuda.
  "Facturar" abre un modal simple (sin librería, `position: fixed` + overlay)
  para elegir Contado/Cuenta corriente.
- `features/ventas/fichas-abiertas/` — `GET /ventas/abiertas`.
- `features/cuentas/` — `cuentas-lista` (`GET /clientes/con-saldo`) y
  `cuenta-detalle` (`GET /clientes/:id/cuenta` + registrar pago).
- `shared/utils/errores.ts` — `extraerMensajeError` lee `err.error.message`
  (string o array de class-validator) para mostrar el error real del backend,
  no uno genérico. Hay una variante `extraerMensajeErrorAsync` para las
  llamadas con `responseType: 'blob'` (los PDF): si el backend rechaza, Angular
  igual entrega el cuerpo como `Blob`, no como JSON, hay que leerlo aparte.
- `shared/utils/pdf.ts` — los PDF de presupuesto/factura se piden por HTTP
  (uno es `POST`) y se abren con `URL.createObjectURL` + `window.open`, no con
  un `<a href>` directo.

### Gotchas ya pisados (para no repetirlos)
- **`tsconfig.json`/`tsconfig.build.json` del backend no tenían `include`**:
  compilaban por default TODO `.ts` bajo `sistema-local/`, así que al crear
  `frontend/` como subcarpeta de `sistema-local/` el build del backend
  explotaba tratando de compilarlo con su `rootDir`. Se solucionó de raíz
  moviendo el backend a `sistema-local/backend/`: ahora `frontend/` es
  hermana, no hija, del árbol que compila el backend, así que el `exclude`
  manual de `frontend` que tenían los dos tsconfig ya no hace falta (se
  sacó de los dos).
- **CORS**: `main.ts` del backend tiene `app.enableCors()` (front y back en
  puertos distintos de la misma PC).
- **`<option [value]="...">` con números rompe el `FormControl`**: un
  `<select>` nativo solo guarda strings, así que `docTipo`, `ivaPorcentaje` y
  `unidadMedida` (todos `number` en el DTO) tienen que usar
  `[ngValue]`, no `[value]`, si no el backend devuelve 400 (`docTipo must be
  an integer number`) apenas el usuario toca el `<select>`.
- **Locale**: sin configurar, el `DecimalPipe` usa `en-US` (`1,300.00`) en vez
  de `es-AR` (`1.300,00`) como el resto del sistema. `app.config.ts` registra
  `@angular/common/locales/es-AR` y provee `LOCALE_ID: 'es-AR'`.

### Probado de punta a punta (Playwright, contra ARCA homologación real)
Cliente Consumidor Final → ficha con 2 líneas → presupuesto (PDF sin CAE,
`201`, `application/pdf`) → facturar Contado → Factura B con CAE real, ficha
EMITIDA, botón para ver el PDF de la factura (`200`, `application/pdf`). Cliente
Responsable Inscripto con domicilio → label de precio en "NETO" → facturar
Cuenta corriente → Factura A con CAE real → aparece en Cuentas por cobrar con
el saldo correcto (neto + IVA) → pago parcial → saldo baja y el historial
muestra CARGO y PAGO. Cero errores de consola en todo el recorrido.

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
- [x] Facturación A/B, `precioUnitario` siempre NETO (confirmado con el
      titular), probada de punta a punta.
- [x] Nota de crédito. PDF con QR. Unidad de medida + condición de venta.
- [x] Infra de migraciones versionadas.
- [x] **Ventas (Ficha) Fase 1**: clientes + ficha + líneas
      (`sistema-local/backend/src/ventas/`), MMSC + GRASP, invariante de ficha única
      por cliente reforzada con índice único parcial (migración
      `AddClientesYVentas`). Probada de punta a punta.
- [x] **Ventas (Ficha) Fase 2**: presupuesto no fiscal, facturar la ficha
      (tipo de comprobante derivado del cliente, CONTADO/CUENTA_CORRIENTE,
      transacción de DB después del CAE) y **cuenta corriente real**
      (`MovimientoCtaCte`, `CuentaCorrienteGestor`: pagos, saldo derivado,
      "quién me debe"). Migraciones `AddReceptorRazonSocialDomicilio` y
      `AddCuentaCorriente`. Probada de punta a punta contra ARCA
      homologación (Factura B contado sin cargo, Factura A cuenta corriente
      con cargo, pago parcial, validaciones de estado). Detalle completo en
      "Ventas (Ficha)" → Fase 2.
- [x] Factura A: razón social y domicilio del receptor (`razonSocialReceptor`/
      `domicilioReceptor` en `Comprobante`, opcionales en `ReceptorDto`,
      completados siempre desde `Cliente` al facturar la ficha).
- [x] **Frontend Fase 1** (`sistema-local/frontend/`, Angular 22 standalone):
      circuito núcleo — clientes (ABM), ficha (buscar/abrir cliente, cargar
      líneas con selector de IVA 21/10,5 y label de precio NETO fijo,
      presupuesto, facturar con modal de condición de venta), y
      cuentas por cobrar (saldo, movimientos, registrar pago). Probado de
      punta a punta con Playwright contra ARCA homologación real, sin errores
      de consola. Detalle completo en "Frontend".

Pendiente:
- [ ] **Módulo de caja** (montos in/out + arqueo) — ni backend ni frontend.
- [ ] **Sistema del depósito** (ABM de productos) — ni backend ni frontend.
- [ ] **Factura C**: sumar CbteTipo 11. Pendiente de confirmar con el titular
      si la necesita (hoy el emisor es RI, así que
      `Cliente.tipoFacturaCorrespondiente()` nunca deriva C).
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