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
│                                          (calcularDesglose, totalizar, anular...)
├── modulo/facturacion.module.ts          MÓDULO: cableado
├── gestor/facturacion.gestor.ts          GESTOR (GRASP Controller): orquesta,
│                                          no calcula ni valida reglas de negocio
├── controlador/facturacion.controller.ts CONTROLADOR: endpoints HTTP
├── dto/crear-factura.dto.ts              Entrada de la API
├── interfaces/arca-provider.interface.ts PORT: de esto depende el Gestor
├── providers/arca-sdk.provider.ts        ADAPTER con @arcasdk/core (intercambiable,
│                                          traductor puro: no calcula IVA ni totales)
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
ARCA_AMBIENTE=homologacion        # empezá SIEMPRE en homologacion
ARCA_CERT_PATH=./certs/ferreteria.crt
ARCA_KEY_PATH=./certs/ferreteria.key
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

## Lo que falta para producción (TODOs conscientes)

Esto es un esqueleto, no está terminado. Antes de usarlo en serio:

- **Mapear los errores de ARCA** a mensajes claros y reintentar los timeouts
  (los servidores de ARCA a veces demoran; conviene reintentar antes de fallar).
- **Definir cómo cargás los precios**: el Gestor asume precio neto (sin IVA) por
  ítem. Si en el mostrador se cargan precios con IVA incluido, invertí el cálculo
  antes de llamar al Gestor.
- **Consultar el padrón** para validar el CUIT del receptor antes de emitir factura A.
- **Guardar/mostrar el comprobante** (PDF con QR) para imprimirlo o mandarlo por WhatsApp.
- **Multi-tenant real**: hoy el emisor es único (desde env). Para vender el sistema,
  resolvé el emisor por request y guardá cert/key/punto de venta por cliente.
