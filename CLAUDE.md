# CLAUDE.md — Sistema de gestión para la ferretería

Este archivo le da contexto a Claude para trabajar en este proyecto. Leelo al
inicio de cada sesión. Manténganlo actualizado: un CLAUDE.md viejo manda a
construir sobre supuestos que ya no valen.

> Última actualización: actualizaciones por **zip chico + delta por hash**
> (`installer/crear-actualizacion.ps1` arma `ActualizacionFerreteria.zip`,
> ~1MB con solo dist/public/plantillas; en la PC del local se aplica
> arrastrando el zip sobre `aplicar-actualizacion.bat`, que copia solo los
> archivos que difieren por SHA-256 — instalador completo solo para
> instalaciones nuevas o cuando cambian deps). Probado de punta a punta en
> dev. Antes: logo real del emisor integrado en los PDF
> (factura/NC/presupuesto, `fit: [110, 45]` en `formato-arca.ts` — ancho Y
> alto máximos, mantiene proporción, con fallback a texto verificado de
> nuevo) y embebido en el instalador (`installer/assets/logo-ferreteria.png`,
> no es secreto, se copia solo a `certs\` — a diferencia de los
> certificados de ARCA, que siguen siendo manual). Instalador recompilado
> con el logo adentro (399,6MB, guard de compilación y chequeo de tamaño
> intactos). Antes: script de verificación de solo lectura para ARCA
> PRODUCCIÓN (`scripts/verificar-produccion.ts`, `npm run verificar:prod`,
> solo `ultimoComprobante()`, config separada en `.env.produccion` —
> imposible emitir por accidente) — certificado y CUIT de producción reales
> ya verificados contra ARCA (autenticó y devolvió 0 comprobantes emitidos
> en A y B); se encontró y corrigió en el camino un bug de TLS legacy de
> los servidores de ARCA (`dh key too small`, fix: `useHttpsAgent: true` en
> `@arcasdk/core`, afecta homologación y producción por igual). El salto de
> verdad a `ARCA_AMBIENTE=produccion` en el `.env` real sigue sin hacerse,
> a propósito — ver "Despliegue" → Fase 3. Próximo: probar el instalador y el
> aplicador de actualizaciones en una PC real, hacer el salto a producción
> cuando el titular confirme, y sistema del depósito.

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
1. **Caja**: registro diario de ventas (monto + medio de pago) con cierre/
   arqueo por día. **Backend y frontend implementados.** Ver sección "Caja".
2. **Ventas / Ficha + Cuentas corrientes (fiado)**: **COMPLETA** (Fase 1 + Fase
   2) — clientes, ficha con líneas, presupuesto, facturar la ficha y cuenta
   corriente real. Ver sección "Ventas (Ficha)".
3. **Facturación electrónica (ARCA)**: **COMPLETA y probada en homologación.**
4. **Frontend (Angular)**: Fase 1 **implementada** — circuito núcleo (clientes,
   ficha, facturar, cuenta corriente) más Caja (carga, cierre, registros).
   Depósito queda afuera hasta que exista ese módulo de backend. Ver sección
   "Frontend".

> **Regla de consistencia:** el **código de producto** debe ser consistente entre
> ambos sistemas desde el arranque, para el día que haya que cruzar stock.

---

## Stack técnico

- **Backend:** NestJS + TypeORM · **DB:** PostgreSQL · **Frontend:** Angular
  22 (standalone, sin NgModules) en `sistema-local/frontend/` — Fase 1 lista.
  **Infra: NATIVA en Windows, sin Docker** (no existe ni va a existir un
  docker-compose en este proyecto — Postgres corre como servicio nativo de
  Windows, el backend como servicio/tarea programada. Ver "Despliegue").
- **Lenguaje:** TypeScript · Node.js >= 18. El proyecto usa `tsx` para scripts.
- **API bajo `/api`**: en producción un solo proceso sirve todo (backend +
  build de Angular) en un solo puerto — ver "Despliegue" → Fase 1.

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
sale en blanco. Logo del emisor vía `EMISOR_LOGO_PATH` (.png/.jpg) — el logo
real ya está integrado (`certs/logo-ferreteria.png` en dev,
`installer/assets/logo-ferreteria.png` embebido en el instalador, ver
"Despliegue" → Fase 2), renderizado con `fit: [110, 45]` de pdfmake (ancho Y
alto máximos, mantiene proporción — un logo grande no puede romper el
encabezado); si el archivo falta o no se puede leer, cae sin romper nada al
texto de la razón social (verificado con el archivo real, no solo en
teoría). Detalle completo en `facturacion/README.md`.

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
- Migraciones de Caja: `AddCajaSimple` (tabla `movimientos_caja`) y
  `AddCierresCaja` (tabla `cierres_caja` + columna `cierreId` nullable en
  `movimientos_caja`, mismo criterio sin FK real).

---

## Caja — `sistema-local/backend/src/caja/` — COMPLETA (carga + cierre)

Registro diario de ventas cargado a mano por el titular (solo monto,
descripción opcional y medio de pago), con un cierre/arqueo simple por
encima. MMSC + GRASP, misma forma que el resto: `modelo/` (`MovimientoCaja`,
`CierreCaja`), `gestor/` (`CajaGestor`), `controlador/` (`CajaController`),
`dto/`, `modulo/caja.module.ts`.

- `MovimientoCaja` (Information Expert): `fecha` (día local, no UTC — ver el
  comentario de `fechaHoy()` en la entidad, importa que las cargas después de
  las 21hs no se vayan al día siguiente), `monto`, `descripcion?`,
  `medioPago` (`EFECTIVO`/`TRANSFERENCIA`/`TARJETA`/`OTRO`), `cierreId`
  (nullable). `calcularTotal`/`calcularPorMedioPago` son estáticos, el Gestor
  no suma nada él mismo.
- `POST /caja/movimientos`, `GET /caja/dia` (default hoy, **solo movimientos
  sin cerrar** — ver más abajo), `DELETE /caja/movimientos/:id`,
  `GET /caja/resumen?desde=&hasta=` (total por día en un rango; el frontend
  todavía no lo consume).

### Cierre de caja (arqueo)
- `CierreCaja`: snapshot por día (`fecha` **única** — un cierre por día como
  mucho) de `montoTotal` + el desglose por medio de pago
  (`montoEfectivo`/`montoTransferencia`/`montoTarjeta`/`montoOtro`).
  Information Expert de sus propios totales a partir de los `MovimientoCaja`
  que se le pasan (`aplicarTotales`, reusa `MovimientoCaja.calcularTotal`/
  `calcularPorMedioPago`, no reimplementa la suma).
- `POST /caja/cierres { fecha? }` — cierra la caja (default hoy):
  `CajaGestor.cerrarDia` arma el `CierreCaja` a partir de los movimientos
  todavía sin cerrar de esa fecha y, en una transacción, les setea
  `cierreId` al cierre recién creado. 409 (`ConflictException`) si esa fecha
  ya tiene cierre.
- **Cómo "se vacía" la caja al cerrar:** `GET /caja/dia` filtra
  `cierreId IS NULL` — no hay ningún reseteo especial, el cierre simplemente
  archiva los movimientos del día bajo su id y dejan de aparecer en la caja
  del día en curso. Movimientos de días previos a esta feature (sin
  `cierreId`) siguen viéndose igual que antes.
- `GET /caja/cierres` — listado (pantalla "Registros"), ordenado por fecha
  descendente. `GET /caja/cierres/:id` — detalle con sus movimientos
  (pantalla de edición).
- **Editar un cierre ya cerrado** (agregar o sacar un pago/retiro olvidado):
  reusa los mismos endpoints de siempre en vez de duplicar rutas.
  `RegistrarMovimientoCajaDto` acepta un `cierreId` opcional — si viene, el
  movimiento se ata a ese cierre (no a la caja del día en curso) y su
  `fecha` pasa a ser la del cierre, no la de hoy; después de guardar,
  `CajaGestor` recalcula y persiste los totales del cierre
  (`recalcularCierre`, misma lógica en alta y en baja).
  `DELETE /caja/movimientos/:id` funciona igual para un movimiento de un
  cierre cerrado: borra y recalcula. No hay endpoint para borrar un
  `CierreCaja` (es un registro de arqueo, no se descarta por API).

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

## Frontend — `sistema-local/frontend/` — Fase 1 implementada + Caja

Angular 22, standalone (sin NgModules, sin zoneless todavía), componentes con
`signal` + Reactive Forms. Fase 1 = el circuito núcleo (clientes, ficha,
facturar, cuenta corriente), más el módulo de Caja (carga, cierre,
registros). **Nada de depósito** — ese módulo de backend no existe todavía.

### Estructura
- `core/models/` — interfaces TS espejo de las entidades del backend
  (`Cliente`, `Venta`/`LineaVenta`, `Comprobante`, `MovimientoCtaCte`,
  `MovimientoCaja`/`CierreCaja`). Ojo: los `numeric`/`bigint` de Postgres
  llegan como **string** en el JSON (TypeORM no los convierte solo), así que
  esos campos están tipados `number | string` a propósito — no asumir que
  son número.
- `core/services/` — `ClientesService`, `VentasService`, `FacturacionService`,
  `CajaService`: wrappers finos de `HttpClient`, un método por endpoint,
  rutas relativas (`/clientes`, `/ventas/...`, `/caja/...`).
- `core/interceptors/api-url.interceptor.ts` — el único lugar que conoce
  `environment.apiBaseUrl`: antepone la base a cualquier request que empiece
  con `/`. Cambiar de ambiente es cambiar solo `environment.ts`.
- `layout/shell/` — nav a Ventas / Clientes / Cuentas por cobrar / Caja.
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
- `features/caja/caja/` — pantalla principal: alta de movimientos + tabla del
  día (solo movimientos sin cerrar, ver "Caja" → "Cierre de caja"), selector
  de fecha para ver días anteriores, y botones "Registros" (a
  `/caja/registros`) y "Cerrar caja" (modal de confirmación con los totales
  del día antes de confirmar — mismo patrón de modal que "Facturar" en
  `ventas-ficha`).
- `features/caja/registros-caja/` — `GET /caja/cierres`: tabla con fecha,
  total y desglose por medio de pago de cada cierre, botón "Editar" por fila.
- `features/caja/cierre-detalle/` — edición de un cierre ya cerrado
  (`/caja/registros/:id`): agregar un movimiento olvidado (mismo form que la
  pantalla principal, pero se manda con `cierreId`) o borrar uno existente;
  los totales que se muestran vienen recalculados del backend, no se
  calculan en el front.
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

## Despliegue

Sin Docker, nunca lo hubo de verdad (el `.gitignore`/comentarios viejos que
decían "Docker Compose" estaban desactualizados — corregido). Todo nativo en
Windows: Postgres como servicio del sistema operativo, el backend como
servicio/tarea programada. Tres fases:

### Fase 1 — Empaquetado (hecho)
Un solo proceso, un solo puerto sirve todo:
- **`/api`**: `main.ts` tiene `app.setGlobalPrefix('api')` — todas las rutas
  de todos los controladores quedan bajo `/api/...`. Necesario para que no
  choquen con los archivos estáticos del frontend ni con las rutas propias
  del router de Angular (deep links) en la raíz.
- **`ServeStaticModule`** (`@nestjs/serve-static`, en `AppModule`) sirve el
  build de Angular desde `sistema-local/backend/public/` — **se registra
  solo si esa carpeta existe** (`existsSync` antes de armar el array de
  `imports`). En dev (`npm run start:dev`) esa carpeta no existe, así que el
  módulo directamente no se registra: cero riesgo de romper el flujo de
  `ng serve` en 4200 por una carpeta faltante. `exclude: ['/api/{*splat}']`
  hace que el fallback a `index.html` (para los deep links de Angular) no le
  pise las respuestas a la API — un `/api/lo-que-sea` inexistente sigue
  dando 404 real, no `index.html`.
- **`public/` vive AL LADO de `dist/`, no adentro**: `nest-cli.json` tiene
  `deleteOutDir: true`, así que `nest build` borra `dist/` en cada
  compilación. Si el frontend viviera ahí adentro, cada build de backend se
  lo llevaría puesto.
- **Environments del frontend**: `environment.ts` (producción, el que usa
  `ng build` por default) apunta a `apiBaseUrl: '/api'` — relativo, mismo
  origen, sin CORS, sin hardcodear host/puerto.
  `environment.development.ts` (el que usa `ng serve`) sigue apuntando a
  `http://localhost:3000/api` — el flujo de desarrollo actual (frontend en
  4200, backend en 3000, con `app.enableCors()`) no cambió.
- **`npm run build:prod`** (`sistema-local/backend/package.json`): corre
  `ng build --configuration production` en el frontend, copia el resultado
  a `backend/public/` (`scripts/copiar-frontend.ts` — `rmSync` + `cpSync`,
  no reusa nada del backend en runtime) y después `nest build`. Deja
  `backend/dist/main.js` listo para `node dist/main.js`, con `public/` al
  lado.

### Fase 2 — Instalación en la PC del local (hecho, para probar)
**Camino principal: correr `FerreteriaSetup.exe`** (Inno Setup,
`sistema-local/installer/ferreteria.iss`) — un solo doble clic hace todo lo
que antes era 7 pasos manuales. El paso a paso manual sigue documentado
como anexo de respaldo en `sistema-local/docs/INSTALACION.md`, por si el
instalador falla en algún punto puntual.

**Por qué instalador nativo (Inno Setup) y no Electron/Tauri**: esto no es
una app de escritorio con UI propia — es un backend NestJS sirviendo HTML
que ya se abre bien en cualquier navegador (ver Fase 1). Empaquetar eso en
Electron/Tauri agrega ~100-200MB y una cadena de build entera por algo
puramente cosmético (una ventana sin barra de navegador). Se resuelve con
`msedge.exe --app=<url>` (ver más abajo) y un instalador clásico se banca
todo lo demás (Postgres, servicio, tarea programada) sin ese costo.

**Qué hace el instalador, en orden** (todo en `[Code]` de `ferreteria.iss`,
Pascal Script de Inno Setup):
1. Detecta Postgres vía `RegKeyExists(HKLM, 'SOFTWARE\PostgreSQL\Installations')`.
   Si no está, lo instala desatendido (`--mode unattended`, EDB installer).
   Si ya está, pide la contraseña del superusuario por wizard (no se
   guarda, se usa una sola vez). `EncontrarCarpetaBinPostgres` ubica
   `psql.exe`/`pg_dump.exe` recorriendo el registro — no depende de conocer
   la versión de Postgres de antemano, funciona igual en los dos casos.
2. Crea usuario (`ferreteria_app`) y base (`ferreteria_local`) PROPIOS de
   la app con una contraseña **generada en el momento**
   (`GenerarPasswordAleatoria`) — nunca una fija en el `.exe`. Mismo gotcha
   documentado en el anexo manual: `CREATE EXTENSION "uuid-ossp"` la hace
   el superusuario, `ferreteria_app` no tiene permiso.
3. Copia la app a `C:\Ferreteria` (ruta fija — `DisableDirPage=yes`, evita
   dolores de cabeza de permisos/espacios de Program Files para un
   servicio que necesita escribir `.env`/`backups/`), con **Node.js
   embebido** (ver Fase 1 / TAREA 1 más abajo).
4. Genera `{app}\.env` sustituyendo tokens (`{{DB_PASSWORD}}`, etc., ver
   `installer/plantillas/env.template`) con la contraseña generada + los
   datos del emisor pedidos por wizard (`PaginaEmisor`). ARCA queda en
   homologación por default, sin preguntarlo — el salto a producción es la
   Fase 3, aparte. `EMISOR_LOGO_PATH` queda seteado por default (no es un
   dato del wizard): apunta al logo que el instalador ya copió en el paso
   siguiente.
5. Copia el **logo del emisor** (`installer/assets/logo-ferreteria.png`,
   embebido en el `.exe` — no es un secreto, a diferencia de los
   certificados de ARCA, ver más abajo) a `{app}\certs\logo-ferreteria.png`.
   Opcional (`skipifsourcedoesntexist`): si faltara, el `.env` generado en
   el paso 4 sigue apuntando ahí igual, y el sistema simplemente cae al
   texto de la razón social en los PDF (ver "Facturación (ARCA)" → PDF).
6. Registra el backend como servicio de Windows vía **NSSM**
   (`vendor/nssm.exe`, embebido): arranque automático + reinicio si se cae.
7. Crea la tarea programada del backup (PowerShell, diaria 19:00 + al
   inicio del sistema si la PC estaba apagada — `registrar-tarea-backup.ps1`,
   con fallback a `schtasks` si PowerShell falla).
8. Crea el acceso directo del escritorio → ver "Acceso directo sin barra de
   navegador" abajo.
9. El desinstalador (`CurUninstallStepChanged`) saca el servicio (`nssm
   remove`) y la tarea programada, y los archivos que instaló Inno. **A
   propósito NUNCA toca la base de datos ni `{app}\backups`** — los datos
   del negocio no se borran por un desinstalador.

**Runtime de Node embebido (TAREA 1 del empaquetado)**: se evaluó `pkg`
primero — probado en serio, no solo descartado de oído: compilar
`dist/main.js` con `pkg` (`node18-win-x64`) da un `.exe` que arranca pero
tira `Cannot find module 'ansis'` al toque (`require` dinámico que la
resolución estática de `pkg` no detecta — exactamente el problema conocido
de `pkg`/`nexe` con NestJS/TypeORM). Se descartó con evidencia real, no
solo por fama. La solución que se usa: shippear el runtime portable de
Node.js (`node.exe` + su propio `npm`/`node_modules`) DENTRO del
instalador, en `{app}\node\`, y arrancar con
`"{app}\node\node.exe" "{app}\dist\main.js"` (ver
`installer/plantillas/iniciar-backend.bat` — variante INSTALADA, distinta
de la que usa el anexo manual, que asume Node ya en el `PATH` del sistema).
Cero instalación de Node aparte en la PC del local.

**Acceso directo sin barra de navegador** (`installer/abrir-ferreteria.vbs`,
TAREA 3): el acceso directo del escritorio no abre la URL directo — corre
un `.vbs` con `wscript.exe` (asociación explícita en el `[Icons]` del
`.iss`, nunca `cscript.exe`, así **nunca muestra una consola**). Ese script:
reintenta con `WinHttpRequest` hasta 30 segundos esperando que
`localhost:3000` responda (el servicio puede tardar unos segundos si la PC
recién prendió) y recién ahí abre `msedge.exe --app=http://localhost:3000`
(fallback a `chrome.exe` si Edge no está, y al navegador default como
último recurso) — ventana de aplicación, sin barra de direcciones ni
pestañas, con ícono propio (`installer/app.ico`, placeholder genérico "F"
sobre azul hasta que el titular pase el logo real — ver
`docs/INSTALACION.md` → "Reemplazar el ícono").

**Seguridad — qué el instalador NUNCA contiene**: certificados de ARCA
(`.crt`/`.key`) ni el `.env` con secretos reales. La `.key` de producción es
la llave fiscal de la empresa — un `.exe` que la contuviera es un archivo
que se copia, se manda por mail o se pierde en un pendrive. Se colocan a
mano después de instalar, en `C:\Ferreteria\certs\` (carpeta vacía con un
`LEEME.txt`, creada por el instalador). Los binarios de terceros que sí
necesita el instalador (Node runtime, instalador de Postgres, NSSM) van en
`installer/vendor/` — gitignored, no específicos de esta ferretería, se
consiguen una vez por quien compila (ver
`installer/vendor/README.md`). **El logo del emisor es la única excepción a
propósito**: no es fiscal ni secreto (es el mismo que va en la cartelería
del local), así que sí viaja embebido y se versiona en git
(`installer/assets/logo-ferreteria.png`) — ver "Facturación (ARCA)" → PDF y
paso 5 de "Qué hace el instalador" arriba.

**Verificado en esta máquina**: `ferreteria.iss` compila limpio con Inno
Setup 6 (`ISCC.exe`) y genera un `.exe` real — probado de punta a punta
(incluidos dos bugs reales de Pascal Script encontrados y corregidos: un
comentario `{ }` que se cerraba solo al toparse con un `{app}`/`{{TOKEN}}`
adentro — Pascal Script no anida comentarios de llaves, se resolvió pasando
todo `[Code]` a comentarios `//`; y `LoadStringFromFile`/`SaveStringToFile`
que esperan `AnsiString`, no el `String` Unicode del resto del script). **NO
se pudo verificar en esta máquina** (sandbox sin permisos de administrador
ni GUI interactiva): correr el instalador de punta a punta de verdad
(instalación real de Postgres, registro real del servicio NSSM, el wizard
interactivo, UAC), ni el comportamiento real de `abrir-ferreteria.vbs`
abriendo Edge. Falta probarlo en una PC (o VM) Windows real antes de
confiar en esto para la PC del local — ver `docs/INSTALACION.md`.

### Actualizaciones: zip chico + delta por hash (hecho)

Actualizar no debería mover los ~400MB del instalador: casi ninguna
actualización toca `node_modules` (200MB), Node embebido ni Postgres — solo
cambia `dist/` (~0,3MB) y `public/` (~0,4MB). Por eso el camino normal de
actualización es:

- **`installer/crear-actualizacion.ps1`** (PC de desarrollo, no hace falta
  Inno Setup): arma `Output/ActualizacionFerreteria.zip` (~1MB) con la capa
  de código (dist/, public/, plantillas/.bat, scripts/backup.ts) + un
  `MANIFEST.json` con ruta/sha256/tamaño por archivo. Mismo guard que el
  `.iss`: sin `dist/main.js` o `public/index.html` aborta.
- **`installer/plantillas/aplicar-actualizacion.bat`** (instalado en
  `C:\Ferreteria\`): se arrastra el zip encima (o se pasa como argumento),
  pide UAC, y corre `_instalador\aplicar-actualizacion.ps1`, que frena el
  servicio NSSM, copia SOLO los archivos que difieren de lo instalado
  (compara SHA-256), levanta el servicio y loguea todo en
  `C:\Ferreteria\actualizaciones.log`. Si el paquete actualiza
  `registrar-tarea-backup.ps1`, re-registra la tarea del backup.
  `aplicar-actualizacion.bat` no se incluye en el zip a propósito: el `.bat`
  que está corriendo no puede reemplazarse a sí mismo (cmd lo lee por líneas)
  — si el `.bat` cambia, se entrega con el instalador completo.
- **Cuándo NO alcanza el zip**: si la actualización agrega dependencias
  (`package.json` nuevo que requiera `npm install`), usar `FerreteriaSetup.exe`
  completo, que sí lleva `node_modules`.

Probado en dev de punta a punta (sin servicio): zip 360KB/141 archivos,
aplicación a un directorio de prueba (todo nuevo → re-aplicar saltea 141 →
modificar 2 archivos actualiza solo esos 2) y re-registración de la tarea
cuando cambia el ps1. Falta la prueba real en la PC del local (UAC +
servicio NSSM) junto con el resto del instalador.

### Fase 3 — Salto a ARCA producción (PENDIENTE)
Todavía en homologación a propósito. Falta, en este orden: datos legales
reales del emisor en el `.env` (domicilio, IIBB, inicio de actividades —
los carga Mateo), certificado de PRODUCCIÓN de ARCA (no sirve el de
homologación, da "computador no autorizado"), CUIT de la EMPRESA en
`EMISOR_CUIT` (hoy homologación usa el CUIT personal de Mateo — ver
"Facturación (ARCA)" → "Homologación vs. Producción", no confundir),
`EMISOR_PUNTO_VENTA` real (el "RECE web services" creado en el portal de
ARCA para producción, no el "1" de homologación), y recién ahí
`ARCA_AMBIENTE=produccion`. No se toca nada de esto hasta que el titular
confirme que está listo — ver "Qué NO hacer".

---

## Estrategia de backup (CRÍTICO) — `sistema-local/backend/scripts/backup.ts`

Dato irremplazable: **saldos de cuentas corrientes (fiado)** y las **fichas
ABIERTAS** (lo que el titular necesita para poder facturar el mes a mano si
se pierde el sistema). Stock y precios el suegro los tiene de memoria.

**Implementado y standalone**: no depende de que el backend esté corriendo
(conexión propia a Postgres vía `pg`, sin pasar por los Gestores de la app —
tiene que poder correr aunque la app esté caída). En la PC del local lo corre
la **tarea programada de Windows directamente** (ver "Despliegue" → Fase 2:
`ejecutar-backup.bat` con el Node embebido + `tsx`, sin pasar por el API ni
por `.ps1` — un `.ps1` se traga los errores con exit 0 y la execution policy
de Windows lo puede bloquear; un `.bat` que corre `backup.ts` directo no tiene
ninguna de las dos trampas). La config de destinos se lee de la tabla
`config_backup` (la de la pantalla de Configuración) con **fallback al
`.env`**, así que una instalación nueva anda sin configurar nada a mano. Cada
corrida registra su resultado en `ejecuciones_backup` (la misma tabla que lee
el historial y la alerta del frontend) y sale con exit code != 0 si el dump o
los CSVs fallan, para que la tarea reintente y el fallo no sea silencioso. A
mano sigue andando con `npm run backup` desde `sistema-local/backend/`.
Detalle completo, variables de entorno y **procedimiento de restore** en
`sistema-local/backend/scripts/README-backup.md`.

Genera, con **fecha en el nombre** (nunca sobrescribe):
- `dump_AAAA-MM-DD.sql` — `pg_dump` completo (formato plano, restaura TODO).
  Se verifica exit code + tamaño > 0 + el marcador de finalización que
  escribe `pg_dump` al terminar bien (no solo "no tiró error" — un dump
  truncado a mitad de camino también hay que detectarlo).
- `saldos_AAAA-MM-DD.csv` — clientes con saldo > 0: razón social, teléfono, saldo.
- `fichas_abiertas_AAAA-MM-DD.csv` — una fila por línea de cada ficha
  ABIERTA (cliente repetido para que sea legible plano), con el total de la
  ficha.
- `clientes_AAAA-MM-DD.csv` — razón social, doc tipo/nro, condición IVA,
  domicilio, teléfono, email.
- `caja_AAAA-MM-DD.csv` — movimientos de caja del día sin cerrar + el
  historial de cierres.

Montos en punto decimal simple (no es-AR): una coma decimal chocaría con la
coma que separa columnas del CSV.

**Destinos**: `BACKUP_DIR_LOCAL` (obligatoria, se escribe ahí primero) +
`BACKUP_DIR_PENDRIVE`/`BACKUP_DIR_DRIVE` (opcionales — Drive es una carpeta
local común que sincroniza el cliente de escritorio, NO la API de Drive). Un
destino que falla (pendrive no conectado, etc.) loguea un WARNING y no aborta
los demás.

**Retención**: 30 días por destino, y solo se borra en un destino donde el
backup de HOY se haya escrito bien (si hoy falló ahí, no se borra nada — un
fallo repetido no puede dejar sin ninguna copia). Todo queda registrado en
`BACKUP_DIR_LOCAL/backup.log`.

> Un backup que nunca se restauró no es un backup: el restore hay que
> probarlo al menos una vez antes de producción (procedimiento paso a paso en
> el README de arriba).

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
- [x] **Módulo de caja** (`sistema-local/backend/src/caja/` +
      `sistema-local/frontend/src/app/features/caja/`): carga diaria de
      movimientos (monto + medio de pago) y cierre/arqueo por día
      (`CierreCaja`, un cierre por día, 409 si ya existe). Al cerrar, la caja
      del día se archiva bajo el cierre y la pantalla principal queda vacía
      para lo que sigue (`GET /caja/dia` filtra `cierreId IS NULL`).
      "Registros" lista los cierres (fecha + total + desglose por medio de
      pago); "Editar" en un cierre permite agregar o sacar un movimiento
      olvidado, recalculando y persistiendo los totales. Probado de punta a
      punta (curl): alta → cierre → doble cierre rechazado (409) → editar
      (alta y baja sobre el cierre) → totales recalculados correctos.
      Detalle completo en "Caja".
- [x] **Backup standalone** (`sistema-local/backend/scripts/backup.ts`,
      `npm run backup`): dump completo verificado + 4 CSV (saldos, fichas
      abiertas, clientes, caja) con fecha en el nombre, a
      BACKUP_DIR_LOCAL/PENDRIVE/DRIVE (los dos últimos opcionales,
      tolerantes a fallo), retención de 30 días por destino (solo si el
      backup de hoy salió bien ahí) y log en `backup.log`. Restore
      documentado en `scripts/README-backup.md`. Programación horaria
      (cron/tarea programada) pendiente del despliegue. Detalle completo en
      "Estrategia de backup".
- [x] **Despliegue Fase 1 (empaquetado) + Fase 2 (instalación)**: `/api`
      global (`main.ts`), `ServeStaticModule` condicional sirviendo
      `backend/public/` (`AppModule`), environments de prod/dev separados,
      `npm run build:prod`. Instalación nativa en Windows documentada en
      `sistema-local/docs/INSTALACION.md` (Postgres servicio, NSSM/Task
      Scheduler, backup por tarea programada). Verificado de punta a punta:
      build, `node dist/main.js`, navegador real (Playwright) sin errores de
      consola, todas las llamadas por `/api`, crear cliente → abrir ficha →
      PDF de presupuesto. Auditoría de seguridad: 2 huecos reales
      encontrados y corregidos en `.gitignore` (`.env.production.example`
      quedaba ignorado por el patrón `.env.*`; `backend/public/` — el build
      copiado del frontend — no estaba ignorado y aparecía como untracked).
      Sin CUIT real ni secretos hardcodeados en el repo. Detalle completo en
      "Despliegue". **Fase 3 (ARCA producción) sigue pendiente, a propósito.**
- [x] **Instalador `.exe` de la Fase 2** (`sistema-local/installer/`, Inno
      Setup — `ferreteria.iss`): Postgres detectado/instalado desatendido,
      usuario y contraseña de DB generados en el momento (nunca fijos),
      Node.js embebido (`pkg` probado y descartado con evidencia real —
      rompe con `require` dinámicos de NestJS), servicio NSSM, tarea
      programada de backup, acceso directo sin barra de navegador
      (`abrir-ferreteria.vbs`, espera al servicio, `msedge --app`).
      Certificados de ARCA fuera del instalador a propósito (paso manual,
      documentado). `docs/INSTALACION.md` reorganizado: instalador como
      camino principal, pasos manuales como anexo de respaldo. Compilado y
      verificado con `ISCC.exe` en esta máquina (2 bugs reales de Pascal
      Script encontrados y corregidos). **No probado de punta a punta en
      una PC Windows real** (sandbox sin admin/GUI) — pendiente antes de
      confiar en esto para la PC del local. Detalle completo en
      "Despliegue" → Fase 2.
- [x] **Actualizaciones por zip chico + delta por hash**
      (`installer/crear-actualizacion.ps1` + `plantillas/aplicar-actualizacion.bat`/`.ps1`):
      paquete de ~1MB con la capa de código (dist/public/plantillas, sin
      node_modules) aplicado por diferencia de SHA-256 contra lo instalado —
      no hace falta mover los ~400MB del instalador para actualizar. El
      instalador se actualizó para dejar el aplicador instalado. Probado en
      dev de punta a punta (zip 360KB/141 archivos, delta saltea sin cambios,
      re-registra la tarea de backup). Falta la prueba real en la PC del
      local (UAC + servicio NSSM). Detalle completo en "Despliegue" →
      "Actualizaciones" y `docs/INSTALACION.md` → "Cómo se actualiza".
- [x] **Verificación de solo lectura para ARCA producción**
      (`scripts/verificar-produccion.ts`, `npm run verificar:prod`): config
      separada en `.env.produccion` (nunca el `.env` de desarrollo),
      exclusiva para `ARCA_AMBIENTE=produccion`, llama únicamente a
      `ultimoComprobante()` — ningún camino de código que emita. Corrida
      real contra el certificado y CUIT de producción: autenticó por WSAA y
      WSFEv1 devolvió 0 comprobantes emitidos (A y B, nunca facturado desde
      ese punto de venta). En el camino se encontró y corrigió un bug real
      de conexión (no de certificado): los servidores de ARCA siguen
      usando parámetros Diffie-Hellman que el OpenSSL moderno de Node
      rechaza (`dh key too small`) — fix es `useHttpsAgent: true` en la
      config de `@arcasdk/core` (`arca-sdk.provider.ts`), documentado por el
      propio paquete, afecta homologación y producción por igual (reprobado
      en homologación de punta a punta después del cambio: consulta +
      emisión + Nota de Crédito, todo con CAE real). El salto real a
      `ARCA_AMBIENTE=produccion` en el `.env` de la PC del local sigue
      pendiente, a propósito. Detalle completo en "Despliegue" → Fase 3.
- [x] **Logo real del emisor** en los PDF y en el instalador: integrado en
      `formato-arca.ts` con `fit: [110, 45]` (ancho y alto máximos de
      pdfmake, mantiene proporción), fallback a texto de la razón social
      verificado de nuevo con el archivo real (no solo en teoría). Archivo
      en `certs/logo-ferreteria.png` (dev) e
      `installer/assets/logo-ferreteria.png` (versionado, embebido en el
      instalador — no es secreto, a diferencia de los certificados de
      ARCA). Reducido de 2584×834/2,3MB a 440×142/~110KB antes de
      integrarlo (4× el ancho máximo de display, de sobra para verse
      nítido, sin inflar cada PDF generado). Probado de punta a punta en
      homologación: Factura A y presupuesto reales con CAE, logo bien
      posicionado y proporcionado; y de nuevo sin el archivo (renombrado),
      cae limpio al texto. Instalador recompilado con el logo adentro
      (399,6MB, guard de `#error` y chequeo de tamaño >350MB intactos).
      Detalle completo en "Facturación (ARCA)" → PDF y "Despliegue" → Fase 2
      → "Logo del emisor" (`docs/INSTALACION.md`).
- [ ] **Sistema del depósito** (ABM de productos) — ni backend ni frontend.
- [ ] **Factura C**: sumar CbteTipo 11. Pendiente de confirmar con el titular
      si la necesita (hoy el emisor es RI, así que
      `Cliente.tipoFacturaCorrespondiente()` nunca deriva C).
- [x] Datos legales del emisor en el `.env` (domicilio, IIBB, inicio de
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