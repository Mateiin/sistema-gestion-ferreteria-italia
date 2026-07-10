# CLAUDE.md — Sistema de gestión para la ferretería

Este archivo le da contexto a Claude para trabajar en este proyecto. Leelo al
inicio de cada sesión.

---

## Contexto

Sistema de gestión para la ferretería del suegro de Mateo (estudiante de Ing. en
Sistemas). Doble propósito: **herramienta real** que el negocio va a usar, y
**pieza de portfolio/CV**. Las decisiones se toman con las dos cosas en mente:
que funcione en el mostrador de verdad, y que el código esté prolijo y defendible
en una entrevista.

El titular del negocio es **Responsable Inscripto**.

---

## Alcance: son DOS sistemas separados

Corren en dos computadoras distintas y **por ahora no se comunican entre sí**.

### Sistema A — Depósito (en la casa)
El suegro guarda casi toda la mercadería en un depósito en su casa y deja poco
stock en el local. Este sistema administra ese depósito.

- ABM simple de productos.
- Campos por producto: **nombre, código, cantidad, proveedor**.
- Listado ordenado alfabéticamente + buscador por nombre.
- Corre en la PC del depósito.
- Es el sistema simple del proyecto.

### Sistema B — Local
Lo que el suegro pidió explícitamente para el local, y nada más (por ahora):

1. **Caja**: registra los montos que entran y salen. Solo importes, sin detalle
   de qué se vendió ni para qué se sacó plata.
2. **Cuentas corrientes (fiado)**: clientes, cargos y pagos, saldo por cliente.
   Es el módulo más importante para él.
3. **Facturación electrónica (ARCA)**: emisión de facturas A y B. El suegro hoy
   factura a mano en la web de ARCA; quiere que el sistema lo haga desde acá.

- Corre en la PC del local.

> **Regla de consistencia entre sistemas:** aunque hoy no se hablan, el día que
> quiera saber "cuánto tengo en el depósito que no bajé al local" van a tener que
> comunicarse. Por eso el **código de producto** debe ser consistente entre ambos
> desde el arranque. Es gratis hoy, carísimo de emparchar después.

---

## Stack técnico

- **Backend:** NestJS + TypeORM
- **Base de datos:** PostgreSQL
- **Frontend:** Angular (standalone components)
- **Infra:** Docker + Docker Compose (todo local en cada PC, funciona offline)
- **Lenguaje:** TypeScript

---

## Decisiones ya tomadas

- **Sin catálogo online / e-commerce.** El suegro busca los productos por nombre.
- **Facturación electrónica ARCA SÍ está en alcance** (Responsable Inscripto →
  Factura A y B). Este fue un cambio respecto de la idea inicial.
- **Facturación diseñada multi-tenant** (concepto de `Emisor` configurable, no
  datos hardcodeados) por si el sistema se vende a otros comercios más adelante.
- **Patrón puertos y adaptadores** para la integración con ARCA: el sistema
  depende de una interfaz (`ArcaProvider`), no de una librería concreta.
- **Siempre empezar en homologación**, nunca desarrollar contra producción.
- **Backups no negociables** (ver sección aparte).
- El "en negro" es decisión y responsabilidad del titular. El sistema es un
  **registro fiel** de lo que se carga: registra movimientos de cuenta corriente,
  y emitir factura es una acción separada y opcional. **No** se programan trucos
  para ocultar, ni doble contabilidad.

---

## Modelo de datos

### Sistema A — Depósito
- **Producto**: id, nombre, codigo, cantidad, proveedor.
  - Si en algún momento el depósito maneja fraccionado (metro/kilo), `cantidad`
    debe ser **decimal** (no entero). Dejarlo decimal desde ya es más barato.

### Sistema B — Local
- **Cliente**: id, nombre, telefono, saldo (saldo es derivado de los movimientos).
- **CtaCteMov** (movimiento de cuenta corriente): id, cliente_id, tipo
  (cargo/pago), monto, fecha, descripcion, comprobante_id (opcional, si el cargo
  se facturó).
- **Comprobante** (factura emitida con CAE): ver módulo de facturación.
- **SesionCaja**: id, apertura, cierre, monto_inicial, monto_final.
- **MovCaja**: id, sesion_id, tipo (ingreso/egreso), monto, fecha. Solo montos.

> **PENDIENTE DE CONFIRMAR (importante):** el modelo rico inicial (Producto con
> `Presentacion` y `unidad_base` decimal, `Venta`, `LineaVenta`, `Rubro`,
> `MovimientoStock`) fue diseñado para un punto de venta completo. El suegro
> pidió algo más chico. **No implementar ese modelo rico hasta confirmar** que el
> local realmente necesita registrar ventas a nivel producto y descontar stock.
> Si más adelante el local crece a POS completo, ese diseño ya está pensado y se
> puede sumar.

**Convenciones del modelo:**
- Plata: tipo `numeric`/`decimal`, **nunca float**.
- El `saldo` del cliente se recalcula desde `CtaCteMov`, no es fuente de verdad.

---

## Módulo de facturación (ARCA)

Ya existe un esqueleto (carpeta `facturacion/`). Puntos clave:

- **Cómo funciona:** el sistema se autentica contra el **WSAA** (con un
  certificado digital) y obtiene un Ticket de Acceso; con eso llama al **WSFEv1**
  para pedir el **CAE** (Código de Autorización Electrónico). Sin CAE, la factura
  no tiene validez fiscal.
- **Librería:** `@afipsdk/afip.js`, detrás del port `ArcaProvider`. Cambiar de
  librería = escribir otro adapter y cambiar una línea en el módulo.
- **Requisitos (config por emisor):** certificado `.crt`, clave privada `.key`
  (SECRETA), punto de venta exclusivo del sistema, CUIT, condición de IVA.
- **Ambiente** por variable de entorno: `homologacion` | `produccion`.

**Códigos ARCA de referencia:**
- Comprobante: 1=Factura A, 6=Factura B, 11=Factura C, 3=NC A, 8=NC B.
- DocTipo receptor: 80=CUIT, 96=DNI, 99=Consumidor Final (DocNro 0).
- IVA (Id): 5=21%, 4=10.5%, 6=27%, 3=0%.

**Reglas:**
- La `.key` **nunca** se versiona en git (va en `.env` o secret manager).
- El punto de venta del sistema debe ser **distinto** del que usa para facturar a
  mano (si comparten, la numeración choca y ARCA rechaza).
- Una factura con CAE no se borra: se anula con una **Nota de Crédito**.

---

## Estrategia de backup (CRÍTICO)

El dato irremplazable son los **saldos de cuentas corrientes (fiado)**. El stock y
los precios el suegro los tiene de memoria; si se rompe la PC puede seguir
trabajando. Los fiados no existen en ningún otro lado.

Cada noche, a **dos destinos**:
- **Plan A: pendrive** en la PC del local.
- **Plan B: Google Drive** cuando haya internet.

Y **dos archivos**, con **fecha en el nombre** (nunca sobrescribir el mismo, para
que una corrupción no se replique; retener ~30 días):
- `dump_AAAA-MM-DD.sql` — `pg_dump` completo para restaurar todo.
- `saldos_AAAA-MM-DD.csv` — nombre, teléfono y saldo de cada deudor. **Legible sin
  el sistema** (se abre desde el celular o cualquier PC si el local se quema).

Se ejecuta como contenedor/cron en el Compose.

---

## Convenciones de código

- **Español** para nombres de dominio y comentarios (Producto, Cliente,
  Comprobante, CtaCteMov...).
- Separar **dominio** de **infraestructura**. Servicios externos (ARCA) siempre
  detrás de un puerto/interfaz.
- Plata en `decimal`/`numeric`. Cantidades que puedan fraccionarse, en `decimal`.
- Validación de entradas con `class-validator` en los DTOs.
- Migraciones de TypeORM **versionadas**. Nada de `synchronize: true` fuera de
  desarrollo.
- Tests: como mínimo un e2e del flujo de facturación en homologación.

---

## Estado actual y pendientes

- [ ] Traer de ARCA el certificado `.crt` y el número de punto de venta (trámite
      en curso, se hace en la PC del suegro con su clave fiscal).
- [ ] Confirmar si los precios se cargan **netos** (sin IVA) o **con IVA incluido**
      → cambia el cálculo en el service de facturación.
- [ ] Confirmar si el local necesita registrar ventas/stock a nivel producto o
      alcanza con caja + cuentas corrientes + facturación.
- [ ] Confirmar cómo imputa los **pagos parciales**: contra ventas específicas o
      contra un saldo global del cliente.
- [ ] Facturación: notas de crédito (anulación), PDF con QR, validación de CUIT
      contra el padrón, mapeo de errores de ARCA y reintento de timeouts.

---

## Qué NO hacer

- No facturar contra **producción** de ARCA hasta tener todo probado en
  homologación.
- No versionar `.key` ni `.env`.
- No usar `float` para montos.
- No hardcodear los datos del emisor (van por configuración).
- No implementar el modelo rico de stock/ventas/presentaciones sin confirmarlo.
- No agregar features que el suegro no pidió "porque quedan lindas": el riesgo es
  un sistema que él no usa. Crecer cuando lo pida.
