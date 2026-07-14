# Módulo de facturación (ARCA) — esqueleto NestJS

Módulo mínimo y funcional para emitir facturas electrónicas contra ARCA, diseñado
**multi-tenant desde el arranque** (un concepto de `Emisor` configurable, no datos fijos).

Sigue la convención **MMSC** (Modelo-Módulo-Servicio/Gestor-Controlador) +
**GRASP** del proyecto: el Gestor no calcula nada, solo instancia/obtiene al
Modelo y le delega. Ver la sección "Arquitectura de aplicación" en el
`CLAUDE.md` de la raíz para el porqué.

## Estructura

Carpetas MMSC (Modelo-Módulo-Servicio/Gestor-Controlador) + las carpetas del
eje puertos-y-adaptadores/config, que son un eje aparte:

```
facturacion/
├── modelo/comprobante.entity.ts          MODELO: persiste el comprobante + CAE
│                                          y concentra la lógica de negocio
│                                          (calcularDesglose, totalizar, anular,
│                                          construirUrlQr, nombreArchivoPdf...)
├── modulo/facturacion.module.ts          MÓDULO: cableado
├── gestor/facturacion.gestor.ts          GESTOR (GRASP Controller): orquesta,
│                                          no calcula ni valida reglas de negocio
├── controlador/facturacion.controller.ts CONTROLADOR: endpoints HTTP
├── dto/crear-factura.dto.ts              Entrada de la API
├── interfaces/arca-provider.interface.ts PORT: de esto depende el Gestor
├── providers/arca-sdk.provider.ts        ADAPTER con @arcasdk/core (intercambiable,
│                                          traductor puro: no calcula IVA ni totales)
├── pdf/comprobante-pdf.provider.ts        ADAPTER con pdfmake + qrcode: arma el
│   pdf/formato-arca.ts                    PDF con el QR oficial (RG 4892),
│   pdf/pdfmake.d.ts                       tampoco calcula nada de negocio.
│                                          formato-arca.ts tiene los bloques de
│                                          layout (encabezado, receptor, tabla
│                                          de ítems, totales) que también reusa
│                                          ventas/pdf/presupuesto-pdf.provider.ts
└── config/emisor.ts                      Datos fiscales por comercio (multi-tenant)
```

La gracia del diseño: el Gestor y el controlador dependen del **port**
(`ArcaProvider`), no de la librería. Cambiar `@arcasdk/core` por otro SDK o por
SOAP directo es escribir otro adapter y cambiar una línea en el módulo. El resto
no se toca.

## Instalación

```bash
npm install @arcasdk/core
npm install class-validator class-transformer   # si no los tenés ya
```

Registrá `FacturacionModule` en tu `AppModule` y asegurate de tener configurado
TypeORM con PostgreSQL.

> **Nota sobre la dependencia:** `@arcasdk/core` habla DIRECTO con los web
> services oficiales de ARCA (WSAA + WSFEv1), sin intermediarios ni token de
> terceros. Es de un mantenedor único (`ralcorta`, repo público en GitHub), así
> que antes de actualizar de versión conviene revisar el changelog: este
> paquete maneja el certificado y la clave privada del emisor.

## Variables de entorno

```bash
EMISOR_RAZON_SOCIAL="Ferretería de ..."
EMISOR_CUIT=20123456783
EMISOR_PUNTO_VENTA=4              # el que creaste en ARCA, exclusivo del sistema
EMISOR_CONDICION_IVA=RI
# Obligatorios en el PDF impreso (no los pide WSFEv1, pero sin esto el
# comprobante impreso queda incompleto/legalmente inválido para imprimir):
EMISOR_DOMICILIO_COMERCIAL="Calle Falsa 123, Localidad, Provincia"
EMISOR_INGRESOS_BRUTOS=20123456783
EMISOR_INICIO_ACTIVIDADES=01/2020
ARCA_AMBIENTE=homologacion        # empezá SIEMPRE en homologacion
ARCA_CERT_PATH=../../certs/ferreteria.crt
ARCA_KEY_PATH=../../certs/ferreteria.key
```

> La clave privada (`ARCA_KEY_PATH`) apunta a un archivo secreto: nunca se sube a
> git. Usá `.env` (en `.gitignore`) o un secret manager.

## Empezá por homologación

Mientras desarrollás, `ARCA_AMBIENTE=homologacion` para no emitir facturas reales.
Recién cuando esté probado, pasás a `produccion` con el certificado que trajiste de
la ferretería.

## Códigos de ARCA (referencia rápida)

**Tipo de comprobante (`CbteTipo`)**
| Código | Comprobante |
|--------|-------------|
| 1  | Factura A |
| 6  | Factura B |
| 11 | Factura C (monotributo) |
| 3  | Nota de Crédito A |
| 8  | Nota de Crédito B |

**Tipo de documento del receptor (`DocTipo`)**
| Código | Documento |
|--------|-----------|
| 80 | CUIT |
| 96 | DNI |
| 99 | Consumidor Final (sin identificar, DocNro = 0) |

**Alícuota de IVA (`Iva.Id`)**
| Código | Alícuota |
|--------|----------|
| 5 | 21% |
| 4 | 10.5% |
| 6 | 27% |
| 3 | 0% |

**Condición de IVA del receptor (`CondicionIVAReceptorId`, RG 5616/2024)**
| Código | Condición |
|--------|-----------|
| 1 | Responsable Inscripto |
| 4 | Exento |
| 5 | Consumidor Final |
| 6 | Monotributo |

## Qué representa `precioUnitario`

Confirmado con el titular: `precioUnitario` es siempre **NETO (sin IVA)**,
tanto en Factura A como en Factura B (y C) — así es como se carga en la
ficha en la práctica. Se SUMA el IVA en los dos casos.
`Comprobante.calcularImportesLinea(...)` ya no rama por tipo de comprobante;
lo usan `calcularDesglose` (agrupa por alícuota, redondea una sola vez por
grupo — no línea a línea, para cuadrar con ARCA) y `armarDetalle` (snapshot
para el PDF). Test offline en `scripts/probar-calculo-iva.ts`
(`npm run probar:calculo`).

## PDF del comprobante

`GET /facturacion/facturas/:id/pdf` devuelve el PDF (con el QR oficial RG 4892
embebido) como `application/pdf`, nombre tipo `comprobante-B-0002-00000005.pdf`.
Si el `.env` no tiene `EMISOR_DOMICILIO_COMERCIAL`/`EMISOR_INGRESOS_BRUTOS`/
`EMISOR_INICIO_ACTIVIDADES`, esos campos salen en blanco (`-`) en el PDF: hay
que completarlos para que el comprobante impreso sea válido de verdad.

El layout sigue el molde oficial de ARCA (encabezado con la letra en un
recuadro, franja del receptor, tabla de ítems de 9 columnas — Código,
Producto/Servicio, Cantidad, U. medida, Precio Unit., % Bonif, Subtotal,
Alícuota IVA, Subtotal c/IVA — y bloque de totales). En Factura A el precio
unitario y el subtotal van en NETO y el IVA se discrimina por alícuota en el
bloque de totales (con las alícuotas no usadas en 0,00, igual que el
formulario oficial); en Factura B van con el IVA incluido y el bloque de
totales muestra un único importe total (el dato guardado sigue siendo
siempre NETO, ver más abajo — es solo una decisión de qué mostrar impreso).
El presupuesto (`ventas/pdf/presupuesto-pdf.provider.ts`) reusa el mismo
molde vía `pdf/formato-arca.ts`, sin QR, sin CAE y sin "Comprobante
Autorizado". No hay campo de "código de producto" en el dominio todavía
(ver "Sistema A — Depósito" en el `CLAUDE.md` de la raíz), así que esa
columna se imprime en blanco (`-`); tampoco hay bonificaciones, así que
"% Bonif" siempre sale en 0,00%.

### Logo del emisor (opcional)

Si `EMISOR_LOGO_PATH` apunta a un `.png` o `.jpg` válido, se usa como
encabezado en vez del texto de la razón social (en la factura y en el
presupuesto). Si la variable no está seteada, el archivo no existe o la
extensión no es soportada, el PDF cae al texto de la razón social sin
romper la generación (solo un `console.warn`). Ver `EMISOR_LOGO_PATH` en
`.env.example`.

## Lo que falta para producción (TODOs conscientes)

Esto es un esqueleto, no está terminado. Antes de usarlo en serio:

- **Mapear los errores de ARCA** a mensajes claros y reintentar los timeouts
  (los servidores de ARCA a veces demoran; conviene reintentar antes de fallar).
- **Consultar el padrón** para validar el CUIT del receptor antes de emitir factura A.
- **Completar los datos legales del emisor** en el `.env` real (domicilio,
  Ingresos Brutos, inicio de actividades) para que el PDF sea válido.
- **Multi-tenant real**: hoy el emisor es único (desde env). Para vender el sistema,
  resolvé el emisor por request y guardá cert/key/punto de venta por cliente.
