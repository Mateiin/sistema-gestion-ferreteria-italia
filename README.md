# Sistema de Gestión — Ferretería Italia

Sistema de gestión para una ferretería real, pensado con doble objetivo: ser una
herramienta que el negocio usa todos los días, y una pieza de portfolio con
decisiones de arquitectura defendibles (separación dominio/infraestructura,
patrón puertos y adaptadores para servicios externos, diseño multi-tenant).

El titular del negocio es **Responsable Inscripto** (factura A y B).

## Son dos sistemas separados

Corren en dos computadoras distintas y **por ahora no se comunican entre sí**.
Conviven en este repo como dos proyectos independientes para simplificar el
mantenimiento, pero cada uno se despliega solo.

| | [`sistema-deposito/`](sistema-deposito) | [`sistema-local/`](sistema-local) |
|---|---|---|
| **Dónde corre** | PC del depósito (casa) | PC del local |
| **Qué resuelve** | ABM de productos, stock y proveedor | Caja, cuentas corrientes (fiado) y facturación electrónica ARCA |
| **Estado** | Pendiente | Módulo de facturación con esqueleto funcional |

> **Regla de consistencia:** aunque hoy no se hablan, el **código de producto**
> debe ser consistente entre ambos sistemas desde el arranque — el día que se
> quiera cruzar stock del depósito con lo que falta en el local, va a ser
> gratis si se pensó desde el día uno, y caro de emparchar después.

## Stack técnico

- **Backend:** NestJS + TypeORM
- **Base de datos:** PostgreSQL
- **Frontend:** Angular (standalone components)
- **Infra:** Docker + Docker Compose (todo local en cada PC, funciona offline)
- **Lenguaje:** TypeScript

## Decisiones de diseño

- Sin catálogo online / e-commerce: el negocio busca productos por nombre.
- Facturación electrónica (ARCA) diseñada **multi-tenant** desde el arranque
  (`Emisor` configurable), pensando en que el sistema podría venderse a otros
  comercios más adelante.
- Integración con ARCA detrás de un **puerto** (`ArcaProvider`): el dominio no
  depende de la librería concreta que resuelve WSAA/WSFEv1.
- Siempre se desarrolla y prueba contra **homologación** antes que producción.
- El dinero siempre en `decimal`/`numeric`, nunca `float`.
- El sistema es un registro fiel de lo que se carga; no se implementan trucos
  de doble contabilidad.

El detalle completo de alcance, modelo de datos, estrategia de backup y
convenciones de código está en [`CLAUDE.md`](CLAUDE.md).

## Estructura del repo

```
.
├── CLAUDE.md                 Contexto y decisiones del proyecto
├── sistema-deposito/         ABM de productos del depósito (pendiente)
└── sistema-local/            Caja, cuentas corrientes y facturación
    └── src/facturacion/      Módulo de facturación ARCA (ver su propio README)
```

## Estado del proyecto

Ver la sección "Estado actual y pendientes" en [`CLAUDE.md`](CLAUDE.md) para el
detalle de lo que falta confirmar y construir.
