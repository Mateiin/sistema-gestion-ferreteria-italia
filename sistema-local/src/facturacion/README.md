# Módulo de facturación (ARCA) — esqueleto NestJS

Módulo mínimo y funcional para emitir facturas electrónicas contra ARCA, diseñado
**multi-tenant desde el arranque** (un concepto de `Emisor` configurable, no datos fijos).

## Estructura

```
facturacion/
├── config/emisor.ts                      Datos fiscales por comercio (multi-tenant)
├── interfaces/arca-provider.interface.ts PORT: de esto depende el resto del sistema
├── providers/afipsdk.provider.ts         ADAPTER con @afipsdk/afip.js (intercambiable)
├── entities/comprobante.entity.ts        Persistencia del comprobante + CAE
├── dto/crear-factura.dto.ts              Entrada de la API
├── facturacion.service.ts                Cálculo de totales + CAE + guardado
├── facturacion.controller.ts             Endpoints
└── facturacion.module.ts                 Cableado
```

La gracia del diseño: el service y el controller dependen del **port**
(`ArcaProvider`), no de la librería. Cambiar afip.js por facturajs o SOAP directo
es escribir otro adapter y cambiar una línea en el módulo. El resto no se toca.

## Instalación

```bash
npm install @afipsdk/afip.js
npm install class-validator class-transformer   # si no los tenés ya
```

Registrá `FacturacionModule` en tu `AppModule` y asegurate de tener configurado
TypeORM con PostgreSQL.

## Variables de entorno

```bash
EMISOR_RAZON_SOCIAL="Ferretería de ..."
EMISOR_CUIT=20123456783
EMISOR_PUNTO_VENTA=4              # el que creaste en ARCA, exclusivo del sistema
EMISOR_CONDICION_IVA=RI
ARCA_AMBIENTE=homologacion        # empezá SIEMPRE en homologacion
ARCA_CERT="-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"
ARCA_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
```

> La `ARCA_KEY` es secreta: nunca la subas a git. Usá `.env` (en `.gitignore`) o un
> secret manager.

## Empezá por homologación

Mientras desarrollás, `ARCA_AMBIENTE=homologacion` para no emitir facturas reales.
Recién cuando esté probado, pasás a `produccion` con el certificado que trajiste de
la ferretería. afip.js incluso permite un modo de desarrollo con un CUIT de prueba
sin certificado, útil para el primer arranque.

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

## Lo que falta para producción (TODOs conscientes)

Esto es un esqueleto, no está terminado. Antes de usarlo en serio:

- **Mapear los errores de ARCA** a mensajes claros y reintentar los timeouts
  (los servidores de ARCA a veces demoran; conviene reintentar antes de fallar).
- **Notas de crédito** para anulaciones (una factura con CAE no se borra: se anula
  con una NC).
- **Definir cómo cargás los precios**: el service asume precio neto (sin IVA) y suma
  21%. Si en el mostrador se cargan precios con IVA incluido, invertí el cálculo.
- **Consultar el padrón** para validar el CUIT del receptor antes de emitir factura A.
- **Guardar/mostrar el comprobante** (PDF con QR) para imprimirlo o mandarlo por WhatsApp.
- **Multi-tenant real**: hoy el emisor es único (desde env). Para vender el sistema,
  resolvé el emisor por request y guardá cert/key/punto de venta por cliente.
