# CLAUDE.md — Sistema de gestión para la ferretería

Este archivo le da contexto a Claude para trabajar en este proyecto. Leelo al
inicio de cada sesión. Manténganlo actualizado: un CLAUDE.md viejo manda a
construir sobre supuestos que ya no valen.

> Última actualización: facturación electrónica con circuito completo probado
> en homologación — emisión (A/B), Nota de Crédito, PDF con QR oficial (RG
> 4892), cálculo de neto/IVA corregido según tipo de comprobante, y unidad de
> medida por ítem + condición de venta del comprobante (preparado para que
> cuentas corrientes enganche el cargo por venta fiada, sin implementar
> todavía). Módulo reorganizado en MMSC + GRASP. Migraciones de TypeORM
> versionadas activas.

---

## Contexto

Sistema de gestión para la ferretería del suegro de Mateo (estudiante de Ing. en
Sistemas). Doble propósito: **herramienta real** que el negocio va a usar, y
**pieza de portfolio/CV**. Las decisiones se toman con las dos cosas en mente:
que funcione en el mostrador de verdad, y que el código esté prolijo y defendible
en una entrevista.

El titular del negocio (la empresa, "Refrigeración Dimundo") es **Responsable
Inscripto** y factura A y B.

---

## Alcance: son DOS sistemas separados

Corren en dos computadoras distintas y **por ahora no se comunican entre sí**.

### Sistema A — Depósito (en la casa)
- ABM simple de productos. Campos: **nombre, código, cantidad, proveedor**.
- Listado ordenado alfabéticamente + buscador por nombre.
- Corre en la PC del depósito.

### Sistema B — Local
1. **Caja**: registra los montos que entran y salen. Solo importes, sin detalle.
2. **Cuentas corrientes (fiado)**: clientes, cargos y pagos, saldo. Lo más
   importante para el suegro.
3. **Facturación electrónica (ARCA)**: emisión de facturas A y B. **YA
   FUNCIONA en homologación** (ver sección de facturación).
- Corre en la PC del local (`sistema-local/`).

> **Regla de consistencia entre sistemas:** aunque hoy no se hablan, el **código
> de producto** debe ser consistente entre ambos desde el arranque, para el día
> que haya que cruzar stock del depósito con el local.

---

## Stack técnico

- **Backend:** NestJS + TypeORM
- **Base de datos:** PostgreSQL
- **Frontend:** Angular (standalone components) — todavía no arrancado
- **Infra:** Docker + Docker Compose (todo local en cada PC, funciona offline)
- **Lenguaje:** TypeScript · Node.js >= 18 (requisito del SDK de ARCA)

---

## Decisiones ya tomadas

- **Sin catálogo online / e-commerce.** Búsqueda por nombre.
- **Facturación electrónica ARCA SÍ está en alcance** (RI → Factura A y B).
- **SDK de ARCA: `@arcasdk/core` (ex `afip.ts`), pinneado exacto a `2.0.0`**
  (sin `^`). Es self-contained: habla directo con ARCA, sin intermediarios ni
  token de terceros ni límite de facturas.
  - **Por qué ese y no otro (decisión de seguridad, no reabrir sin motivo):** se
    descartó `@ramiidv/arca-sdk` por señales de riesgo de cadena de suministro
    (paquete de semanas, mantenedor único, renames y parches el mismo día). Se
    descartó `@afipsdk/afip.js` porque enruta por servidores de terceros. De
    `@arcasdk/core` se auditó el tarball (sin scripts de instalación, sin
    `eval`/`child_process`, URLs solo a hosts oficiales de ARCA) antes de
    instalarlo, y se pinneó la versión exacta.
- **Patrón puertos y adaptadores** para ARCA: el sistema depende de la interfaz
  `ArcaProvider`, no del SDK. Cambiar de librería = reescribir SOLO el adapter.
- **Multi-tenant desde el diseño** (concepto de `Emisor` configurable) por si el
  sistema se vende a otros comercios.
- **Siempre empezar en homologación**, nunca desarrollar contra producción.
- **Arquitectura de aplicación: MMSC + GRASP** (ver sección aparte más abajo).
- **Backups no negociables** (ver sección aparte).
- El "en negro" es decisión y responsabilidad del titular. El sistema es un
  **registro fiel**: registra movimientos, y emitir factura es una acción
  separada y opcional. **No** se programan trucos para ocultar ni doble
  contabilidad.

---

## Modelo de datos

### Sistema A — Depósito
- **Producto**: id, nombre, codigo, cantidad, proveedor.
  - `cantidad` en **decimal** por si aparece fraccionado (metro/kilo).

### Sistema B — Local
- **Cliente**: id, nombre, telefono, saldo (saldo derivado de los movimientos).
- **CtaCteMov**: id, cliente_id, tipo (cargo/pago), monto, fecha, descripcion,
  comprobante_id (opcional, si el cargo se facturó).
- **Comprobante** (factura emitida con CAE): ver módulo de facturación.
- **SesionCaja**: id, apertura, cierre, monto_inicial, monto_final.
- **MovCaja**: id, sesion_id, tipo (ingreso/egreso), monto, fecha. Solo montos.

> **PENDIENTE DE CONFIRMAR:** el modelo rico inicial (Producto con `Presentacion`
> y `unidad_base` decimal, `Venta`, `LineaVenta`, `Rubro`, `MovimientoStock`) fue
> diseñado para un punto de venta completo. El suegro pidió algo más chico. **No
> implementar ese modelo rico hasta confirmar** que el local necesita registrar
> ventas a nivel producto y descontar stock.

**Convenciones del modelo:**
- Plata: `numeric`/`decimal`, **nunca float**.
- El `saldo` del cliente se recalcula desde `CtaCteMov`, no es fuente de verdad.

---

## Arquitectura de aplicación: MMSC + GRASP

Todo módulo nuevo (depósito, caja, cuentas corrientes, facturación) sigue esta
misma forma de organizar las carpetas y de repartir responsabilidades. Son
**carpetas físicas** dentro de cada módulo, no solo un criterio de nombres:

```
<modulo>/
├── modelo/<algo>.entity.ts        MODELO
├── modulo/<modulo>.module.ts      MÓDULO
├── gestor/<modulo>.gestor.ts      SERVICIO / GESTOR
├── controlador/<modulo>.controller.ts   CONTROLADOR
├── dto/                           entrada de la API (no es parte de MMSC)
├── interfaces/ + providers/       puertos y adaptadores (no es parte de MMSC)
├── pdf/ (u otra carpeta de infra)  otro adapter más, mismo eje que providers/
└── config/                        configuración (no es parte de MMSC)
```

- **Modelo** (`modelo/*.entity.ts`): la entidad de TypeORM, pero **no es una
  bolsa de columnas**. Ahí vive la lógica de negocio: cálculos, invariantes,
  "¿se puede hacer esto?", y los *factories* que saben construirse a sí mismos
  (`Comprobante.crearAutorizado(...)`, `Comprobante.calcularDesglose(...)`).
  GRASP: **Information Expert** (quien tiene los datos hace la cuenta) y
  **Creator**.
- **Módulo** (`modulo/*.module.ts`): cablea Controlador + Gestor + Modelo +
  adapters externos (providers de NestJS). No tiene lógica.
- **Servicio / Gestor** (`gestor/*.gestor.ts`): es el **GRASP Controller** — el
  punto de entrada de un caso de uso. **Solo instancia/obtiene el Modelo y le
  delega**: no calcula IVA, no valida reglas de negocio, no arma DTOs de
  infraestructura a mano. Su trabajo es coordinar la secuencia: pedirle al
  Modelo que calcule o valide, llamar al puerto externo si hace falta (I/O),
  pedirle al Modelo que registre el resultado, y persistir. Si un Gestor tiene
  un `if` de regla de negocio o hace una cuenta con `+`/`*`/`%`, esa lógica se
  fue al lugar equivocado.
- **Controlador** (`controlador/*.controller.ts`): HTTP puro (NestJS). Valida
  el DTO de entrada (`class-validator`) y llama al Gestor. Sin lógica.

**Cómo convive con puertos y adaptadores:** el patrón de puertos y adaptadores
(`interfaces/*.interface.ts` + `providers/*.provider.ts`) sigue existiendo para
servicios **externos** (ARCA, y a futuro cualquier integración de terceros), y
vive en carpetas propias al mismo nivel que las 4 de MMSC (junto con `dto/` y
`config/`). Es un eje distinto de MMSC: MMSC organiza la aplicación hacia
adentro; puertos y adaptadores aíslan lo que habla con el mundo exterior. El
adapter es infraestructura pura — **traduce, no calcula**: los montos y las
validaciones de negocio los produce el Modelo antes de llamarlo.

Ejemplo ya aplicado en `facturacion/` (ver sección siguiente): `Comprobante`
(Modelo) calcula el desglose de IVA y decide si se puede anular;
`FacturacionGestor` (Gestor) solo llama a esos métodos, después al
`ArcaProvider` (puerto/adapter), y guarda; `arca-sdk.provider.ts` (adapter) no
hace ninguna cuenta, solo arma el payload que espera el SDK con los números que
ya le pasaron.

---

## Módulo de facturación (ARCA) — `sistema-local/src/facturacion/`

**Estado: circuito completo probado de punta a punta en homologación (WSAA →
WSFEv1 → CAE), con Factura A y B, Nota de Crédito y PDF con QR oficial. El
cálculo de neto/IVA ya distingue correctamente entre A (precio neto) y B
(precio con IVA incluido) — ver "Estado actual y pendientes" para el detalle
y los CAE de prueba.**

### Arquitectura (MMSC + GRASP — ver sección general más arriba)
- `interfaces/arca-provider.interface.ts` — **PORT**. Expresa intención de
  dominio: emitir un comprobante **ya calculado** (montos y desglose por
  alícuota resueltos por el Modelo) para este receptor. De esto depende el
  Gestor; no conoce el SDK.
- `modelo/comprobante.entity.ts` — **MODELO**. Persiste el comprobante + CAE
  + el desglose de IVA por alícuota (`ivaDesglose`, necesario para poder
  anularlo después con una NC) + `condicionIvaReceptor` (solo Factura A) +
  `detalle` (snapshot de ítems para el PDF, cada uno con su `unidadMedida`) +
  `fecha` (CbteFch, para el PDF y el QR) + `condicionVenta` (cómo se cobró).
  Ni `detalle`/`unidadMedida` ni `condicionVenta` se mandan a ARCA: WSFEv1 no
  recibe líneas de detalle ni condición de venta, son solo para nuestro
  registro y el PDF. Ahí vive la lógica: `calcularImportesLinea` (neto/IVA de
  una línea
  según si el tipo trae el precio neto —A— o con IVA incluido —B/C—),
  `calcularDesglose`/`totalizar` (agrupan ítems por alícuota, redondeando una
  sola vez por grupo), `armarDetalle` (snapshot por ítem, sin agrupar),
  `condicionIvaRequerida`, `crearAutorizado` (Creator), y
  `prepararNotaCredito`/`registrarNotaCredito` (validan si se puede anular y
  arman/registran la NC, incluido el `detalle` que se hereda a la NC). Tira
  `ComprobanteYaAnuladoError` / `SinDesgloseIvaError` si no se puede anular; el
  Gestor traduce esos errores a HTTP. También tiene `construirUrlQr` (arma la
  URL del QR oficial RG 4892, pura, sin I/O), `letra()`, `tipoDocumentoTexto()`
  y `nombreArchivoPdf()`.
- `providers/arca-sdk.provider.ts` — **ADAPTER** con `@arcasdk/core`. Traductor
  puro: no calcula montos ni IVA, solo arma el payload de
  `Arca.electronicBillingService.createNextVoucher` con los números que ya le
  pasó el Modelo, y detecta rechazo de ARCA (`cae` vacío) levantando error con
  las observaciones. `solicitarNotaCredito` reusa el mismo armado (método
  privado `emitirComprobante`) pasando el `CbteTipo` de NC (3=NC-A, 8=NC-B) y
  `CbtesAsoc` con la referencia al comprobante original. También devuelve la
  `fecha` (CbteFch) que efectivamente se envió a ARCA, para que el Modelo la
  persista tal cual.
- `pdf/comprobante-pdf.provider.ts` — **ADAPTER** con `pdfmake` + `qrcode`.
  Igual que el de ARCA: traductor puro, no calcula nada de negocio (recibe el
  `Comprobante` y el `Emisor` ya resueltos). Arma el QR con
  `Comprobante.construirUrlQr`, lo embebe como imagen (dataURL PNG vía
  `qrcode`), y arma la tabla de ítems desde `detalle` — si un comprobante viejo
  no tiene `detalle` (emitido antes de esa columna), cae a mostrar el desglose
  por alícuota disponible con una nota, en vez de romper. Usa las fuentes
  estándar de pdfmake (Helvetica, sin TTF embebidos). `pdf/pdfmake.d.ts` es un
  shim de tipos mínimo (pdfmake no publica tipos para la API de servidor).
- `gestor/facturacion.gestor.ts` — **GESTOR** (GRASP Controller). Solo instancia y
  delega: le pide al Modelo que calcule/valide, llama al `ArcaProvider` o al
  `ComprobantePdfProvider`, le pasa el resultado al Modelo para que registre su
  propio estado, y persiste. No calcula IVA ni arma el PDF él mismo. Tiene un
  `// TODO(ctacte)` en `emitirFactura`: cuando `condicionVenta ===
  CUENTA_CORRIENTE`, ahí es donde el módulo de cuentas corrientes (todavía no
  existe) va a disparar el cargo en la cuenta del cliente.
- `dto/crear-factura.dto.ts` — cada ítem lleva su **propia alícuota**
  (`ivaPorcentaje`, default 21) y su **unidad de medida** (`unidadMedida`,
  código ARCA, default 7 = "unidades"). Valores de alícuota permitidos: **21 y
  10,5** (el suegro pidió poder elegir entre esos dos; en el front va como
  selector por línea). `condicionVenta` (enum `CondicionVenta`, obligatorio)
  es cómo se cobró el comprobante.
- `config/emisor.ts` — datos del emisor desde `.env`. Lee cert/key de archivo
  (`ARCA_CERT_PATH` / `ARCA_KEY_PATH`), no del contenido inline. También lee
  `EMISOR_DOMICILIO_COMERCIAL` / `EMISOR_INGRESOS_BRUTOS` /
  `EMISOR_INICIO_ACTIVIDADES` (opcionales para no romper el arranque si faltan,
  pero **obligatorios en el PDF impreso** — ver pendientes).
- `modulo/facturacion.module.ts` — **MÓDULO**. Cablea `crearArcaSdkProvider` y
  `ComprobantePdfProvider`.
- `controlador/facturacion.controller.ts` — **CONTROLADOR**. Endpoints HTTP,
  incluido `GET facturas/:id/pdf` (devuelve el PDF con `StreamableFile`).

### Cómo funciona ARCA (resumen)
El sistema se autentica en el **WSAA** con un certificado digital → obtiene un
Ticket de Acceso → llama al **WSFEv1** para pedir el **CAE**. Sin CAE, la factura
no tiene validez fiscal. El SDK maneja el WSAA y el cacheo del ticket.

### Homologación vs. Producción — ¡OJO, esto confunde!
Son ambientes separados, con certificados **distintos** y, clave, con **CUITs
distintos** en esta etapa:

| | Certificado | CUIT (cert = "representado" en WSASS = `EMISOR_CUIT`) | Punto de venta |
|---|---|---|---|
| **Homologación** (testing actual) | generado en WSASS con el **CUIT personal de Mateo** | el **CUIT personal de Mateo** | 1 |
| **Producción** (a futuro) | el `.crt` traído de ARCA | el **CUIT de la empresa** | el punto de venta "RECE para web services" creado en ARCA |

**Los tres valores (cert, representado, `EMISOR_CUIT`) tienen que ser el mismo
CUIT.** Un error 600 "No apareció CUIT en lista de relaciones" = ese CUIT no está
autorizado para el certificado que estás usando (típicamente: quedó el CUIT de la
empresa en el `.env` mientras se prueba con el cert personal de homologación).
**En homologación NO se asocia el CUIT de la empresa en el portal de ARCA.**

Un cert de homologación solo sirve en homologación (y viceversa): mezclarlos da
"computador no autorizado".

### Códigos ARCA de referencia
- Comprobante: 1=Factura A, 6=Factura B, 11=Factura C, 3=NC A, 8=NC B.
- DocTipo receptor: 80=CUIT, 96=DNI, 99=Consumidor Final (DocNro 0).
- IVA (Id): 5=21%, 4=10.5%, 6=27%, 3=0%.

### Reglas de seguridad del certificado
- La `.key` (privada) **nunca** se versiona. `certs/` y `.env` van en `.gitignore`.
- Los CUIT reales **no** se hardcodean en este doc ni en el repo: los valores van
  en `.env` (ignorado). Acá se referencian por rol ("CUIT personal" / "de la
  empresa").
- El punto de venta del sistema (producción) es **distinto** del que usa para
  facturar a mano.
- Una factura con CAE no se borra: se anula con Nota de Crédito.
- Egress del contenedor de facturación restringida a los dominios de ARCA.

---

## Estrategia de backup (CRÍTICO)

El dato irremplazable son los **saldos de cuentas corrientes (fiado)**. El stock y
los precios el suegro los tiene de memoria.

Cada noche, a **dos destinos** (pendrive + Google Drive cuando haya internet) y
**dos archivos** con **fecha en el nombre** (nunca sobrescribir; retener ~30 días):
- `dump_AAAA-MM-DD.sql` — `pg_dump` completo para restaurar todo.
- `saldos_AAAA-MM-DD.csv` — nombre, teléfono y saldo de cada deudor, **legible sin
  el sistema**.

Se ejecuta como contenedor/cron en el Compose.

---

## Migraciones de base de datos (`sistema-local/`)

**Estado: migraciones versionadas activas.** `synchronize` está en `false` y
**prohibido** ponerlo en `true` fuera de un experimento local descartable.
**Prohibido también el `ALTER TABLE` manual**: todo cambio de esquema se hace
con `migration:generate`, se commitea el archivo generado, y se aplica con
`migration:run` en cada base (dev, y a futuro producción).

- `src/data-source.ts` — `DataSource` de TypeORM para la CLI. Lee las MISMAS
  variables de entorno que usa la app (`DB_HOST`/`DB_PORT`/`DB_USER`/
  `DB_PASSWORD`/`DB_NAME`). Único export de `DataSource` en el archivo (la CLI
  de TypeORM exige exactamente uno).
- `src/migrations/*.ts` — una migración por cambio de esquema. La primera,
  `InitialSchema`, representa el esquema completo tal como estaba al momento
  de activar migraciones (incluye `ivaDesglose`, `condicionIvaReceptor` y
  `comprobanteOriginalId` de `comprobantes`, que antes se habían agregado a
  mano con `ALTER TABLE`).
- `AppModule` (`src/app.module.ts`) tiene `migrationsRun: true`: la app corre
  las migraciones pendientes sola al arrancar (además de que se pueden correr
  a mano). Verificado: arrancar la app contra una base vacía crea el esquema
  solo con las migraciones, sin `synchronize`.

**Scripts** (`sistema-local/package.json`):
```bash
npm run migration:generate -- src/migrations/NombreDelCambio   # diff entidades vs. base real
npm run migration:create -- src/migrations/NombreDelCambio     # migración vacía, para SQL a mano
npm run migration:run       # aplica las migraciones pendientes
npm run migration:revert    # revierte la última migración aplicada
```

**Flujo para cualquier cambio de esquema:**
1. Cambiar la entidad (columna, índice, tabla nueva).
2. `npm run migration:generate -- src/migrations/DescripcionDelCambio` (necesita
   Postgres corriendo y accesible con las credenciales del `.env`).
3. Revisar el SQL generado (el `up`/`down`) antes de commitear.
4. `npm run migration:run` para aplicarla en la base local.
5. Commitear el archivo de migración junto con el cambio de entidad.

---

## Convenciones de código

- **Español** para nombres de dominio y comentarios.
- **MMSC + GRASP** (ver sección de arquitectura): 4 carpetas por módulo —
  `modelo/`, `modulo/`, `gestor/`, `controlador/` — más `dto/`, `interfaces/`,
  `providers/` y `config/` aparte. Archivo `gestor/*.gestor.ts` (no
  `*.service.ts`), lógica de negocio en `modelo/*.entity.ts`, Gestor solo
  orquesta.
- Separar **dominio** de **infraestructura**. Servicios externos detrás de un puerto.
- Plata en `decimal`/`numeric`. Cantidades fraccionables, en `decimal`.
- Validación con `class-validator` en los DTOs.
- Migraciones de TypeORM **versionadas** (ver sección "Migraciones de base de
  datos"). Nada de `synchronize: true` ni `ALTER TABLE` manual.
- Dependencias sensibles (las que tocan el cert/key): versión pinneada exacta y
  auditada antes de instalar.
- Tests: como mínimo el e2e del flujo de facturación en homologación.

---

## Estado actual y pendientes

Hecho:
- [x] Trámite ARCA de producción: certificado `.crt` + punto de venta creados.
- [x] Certificado de homologación generado en WSASS y autorizado a `wsfe`.
- [x] Facturación probada de punta a punta en homologación (primer CAE OK).
- [x] **Nota de crédito** (anulación): `Comprobante.prepararNotaCredito` /
      `registrarNotaCredito` (Modelo) + `solicitarNotaCredito` en el
      port/adapter (NC-A=3, NC-B=8, misma llamada que una factura con
      `CbtesAsoc` apuntando al comprobante original) + `FacturacionGestor.
      anularFactura` (solo orquesta). Probado de punta a punta en
      homologación (factura CAE 86280549392676 → NC CAE 86280549392689, y de
      nuevo tras el refactor MMSC: CAE 86280550249473 → NC CAE 86280550249486).
      Para poder reconstruir la NC de un comprobante existente, `Comprobante`
      ahora también guarda `ivaDesglose` (importes por alícuota) y
      `condicionIvaReceptor`; comprobantes emitidos ANTES de este cambio no
      tienen esas columnas pobladas y no se pueden anular automáticamente
      (tira `SinDesgloseIvaError`, el Gestor lo traduce a 400).
      Las 3 columnas ya quedaron capturadas en la migración inicial (ver
      sección "Migraciones de base de datos"): **migraciones versionadas
      activas, el `ALTER TABLE` manual queda obsoleto.**
- [x] **Refactor MMSC + GRASP** de `facturacion/`: `facturacion.service.ts` →
      `facturacion.gestor.ts` (`FacturacionGestor`, sin lógica propia); toda la
      cuenta de IVA/totales y las validaciones de anulación se movieron a
      `Comprobante` (Modelo); `arca-sdk.provider.ts` (adapter) quedó como
      traductor puro, sin matemática de negocio. Aplicar esta misma forma a
      los módulos que se agreguen (depósito, caja, ctacte).
- [x] **Migraciones de TypeORM versionadas** (ver sección aparte):
      `src/data-source.ts` + `migration:generate/create/run/revert` en
      `package.json`. Base de desarrollo reseteada a una baseline limpia y
      migración `InitialSchema` generada y corrida contra base vacía
      (verificado: `comprobantes` queda con las 18 columnas esperadas,
      incluidas las 3 nuevas, y `migration:generate --check` no detecta
      diferencias). `migrationsRun: true` en `AppModule`: se probó levantando
      la app contra una base vacía y creó el esquema sola, sin `synchronize`.
- [x] **PDF del comprobante con QR oficial** (RG 4892): `pdf/comprobante-pdf.provider.ts`
      con `pdfmake` + `qrcode`, endpoint `GET /facturacion/facturas/:id/pdf`.
      `Comprobante` ahora persiste `detalle` (snapshot de ítems) y `fecha`
      (CbteFch) — migración `AddDetalleComprobante` corrida. `ResultadoCae`
      devuelve la `fecha` real que ARCA autorizó. Probado de punta a punta en
      homologación: Factura B con dos alícuotas (21% + 10,5%, CAE
      86280550588815), su Nota de Crédito (hereda `detalle`, CAE
      86280550590700) y una Factura A con receptor CUIT (discrimina Neto/IVA
      en los totales, CAE 86280550591421). El QR se verificó decodificando el
      payload de forma independiente: las 12 claves y el dominio
      `afip.gob.ar/fe/qr` coinciden exactamente con la especificación.
      **Pendiente operativo:** el `.env` real todavía no tiene
      `EMISOR_DOMICILIO_COMERCIAL` / `EMISOR_INGRESOS_BRUTOS` /
      `EMISOR_INICIO_ACTIVIDADES` — sin esos datos el PDF queda incompleto
      para imprimir de verdad (hoy muestra "-"). Quedan opcionales en el
      código para no romper el arranque, pero hay que completarlos en el
      `.env` antes de usar el PDF en serio.
      **De paso:** se sacó `"incremental": true` de `tsconfig.json` — con
      `deleteOutDir` de Nest, la caché incremental de `tsc` quedaba
      desincronizada con `dist/` y `npm run build` terminaba "exitoso" con la
      mitad de los archivos sin emitir (pasó dos veces en esta sesión, antes
      de sacarlo).
- [x] **Qué representa `precioUnitario` según el tipo de comprobante**
      (confirmado contra el facturador de ARCA): en **Factura A es NETO** (se
      suma el IVA); en **Factura B (y C) ya viene CON IVA incluido** (se
      extrae el neto: `neto = importe / (1 + ivaPorcentaje/100)`). Antes se
      asumía siempre neto, lo cual daba un total mal calculado en toda
      Factura B. `Comprobante.calcularImportesLinea(tipoFactura, ...)` es el
      Information Expert que rama según el tipo; lo usan `calcularDesglose` y
      `armarDetalle`. **Redondeo:** se agrupa por alícuota SIN redondear
      línea a línea, y se redondea una sola vez el neto/IVA de cada grupo
      (redondear por línea y sumar da resultados que no cuadran con lo que
      calcula ARCA). Verificado con los dos casos reales del facturador de
      ARCA (Factura B: precio 12100 con IVA 21% → neto 10000, IVA 2100, total
      12100; Factura A: precio neto 10000 con IVA 21% → total 12100) — contra
      ARCA de verdad (`npm run probar:fe`, CAE 86280551825882) y vía HTTP
      completo (Gestor + persistencia). Test puro y offline de estos casos en
      `scripts/probar-calculo-iva.ts` (`npm run probar:calculo`).
      **Pendiente para el front (documentado, no implementado):** la pantalla
      de carga tiene que dejar explícito qué precio está pidiendo según el
      tipo elegido — en B/C es el precio final (con IVA), en A es el neto. Es
      la misma confusión en la que cayó el cálculo del backend: si la UI no
      lo aclara, el operador la va a errar.
- [x] **Unidad de medida por ítem y condición de venta del comprobante.**
      `ItemFacturaDto.unidadMedida?: number` (código ARCA, default 7 =
      "unidades" si no se envía) — **no se manda a ARCA**: se confirmó que
      WSFEv1 (el servicio que usamos para A/B/C) no recibe líneas de detalle,
      solo totales agregados por alícuota; `unidadMedida` es puramente para
      nuestro registro y para el PDF (el catálogo Umed sí existe en el SDK,
      pero pertenece al servicio FEX de exportación, que no usamos). Se guarda
      en `DetalleItem.unidadMedida` (dentro del jsonb `detalle`) y se imprime
      en la tabla del PDF.
      `CondicionVenta` (enum: CONTADO, TARJETA_DEBITO, TARJETA_CREDITO,
      CUENTA_CORRIENTE, CHEQUE, TRANSFERENCIA_BANCARIA, OTRA) — obligatoria en
      `CrearFacturaDto`, tampoco se manda a ARCA (mismo motivo: no es un campo
      de WSFEv1, es metadata que el facturador de ARCA también solo imprime).
      Columna `condicionVenta` (varchar, nullable por compatibilidad con los
      comprobantes ya emitidos) en `Comprobante`; se hereda a la Nota de
      Crédito igual que `detalle`. Se imprime en el PDF.
      **Dejado preparado, sin implementar (`// TODO(ctacte)` en
      `FacturacionGestor.emitirFactura`):** cuando `condicionVenta ===
      CUENTA_CORRIENTE`, la venta es fiada y el módulo de cuentas corrientes
      (todavía no existe) va a tener que generar el cargo correspondiente ahí.
      Migración `AddCondicionVenta` generada y corrida — el cambio a
      `unidadMedida` NO generó migración porque vive dentro de un jsonb
      (`detalle`), que no tiene esquema fijo para Postgres/TypeORM.
      Verificado en homologación: Factura B con unidad de medida explícita en
      un ítem (m) y default en otro (unidades), `condicionVenta:
      CUENTA_CORRIENTE`, CAE `86280551827902`; su Nota de Crédito hereda
      `condicionVenta` y `detalle`, CAE `86280551827944`. Los dos aparecen
      correctamente en el PDF.
- [ ] **Factura C**: no implementada. Sumar `CbteTipo` 11 es agregar el código
      al mapeo (`CBTE_TIPO`/`CODIGO_COMPROBANTE` ya tienen el 11 en varios
      lados como referencia, pero falta el circuito completo) y usar la rama
      de IVA extraído que ya existe en `calcularImportesLinea` (Factura C es
      igual que B en ese sentido: precio con IVA incluido, pero además va sin
      discriminar receptor RI). Pendiente confirmar con el titular si lo
      necesita — hoy el negocio solo emite A y B.
- [ ] Confirmar persistencia del comprobante y que la numeración se lleve contra
      lo que dice ARCA (no un contador propio).
- [ ] Selector de IVA (21% / 10,5%) en el front cuando se arme la pantalla Angular.
- [ ] Confirmar condición de IVA del receptor para Factura A.
- [ ] Confirmar si el local necesita ventas/stock a nivel producto o solo caja +
      ctacte + facturación.
- [ ] Antes de ir a producción: `.gitignore` tapando `certs/` y `.env`, egress
      restringida, `.key` de producción respaldada.

---

## Qué NO hacer

- No facturar contra **producción** de ARCA hasta tener todo probado en homologación.
- No asociar el CUIT de la empresa en el portal para pruebas de homologación
  (el error 600 se arregla en el `.env`, no en el portal).
- No versionar `.key` ni `.env`; no hardcodear CUIT reales en el repo.
- No usar `float` para montos.
- No cambiar el SDK de ARCA ni despinnear la versión sin re-auditar (toca la
  llave fiscal).
- No implementar el modelo rico de stock/ventas/presentaciones sin confirmarlo.
- No agregar features que el suegro no pidió "porque quedan lindas".
- No poner `synchronize: true` en ningún entorno más allá de un experimento
  local descartable, y no volver al `ALTER TABLE` manual: el esquema lo
  manejan las migraciones (ver "Migraciones de base de datos").
- No asumir que `precioUnitario` es siempre neto: en Factura A sí, en Factura
  B (y C) ya viene con IVA incluido (ver "Qué representa `precioUnitario`
  según el tipo" en el `README.md` de `facturacion/`). Fue un bug real.