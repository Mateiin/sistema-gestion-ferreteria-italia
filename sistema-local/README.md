# Sistema Local

Corre en la PC del local. Cubre lo que el dueño del negocio pidió
explícitamente, y nada más (ver "Qué NO hacer" en el [`CLAUDE.md`](../CLAUDE.md)
raíz).

## Módulos

1. **Caja** — registra los montos que entran y salen. Solo importes, sin
   detalle de qué se vendió ni para qué se sacó plata. *(pendiente)*
2. **Cuentas corrientes (fiado)** — clientes, cargos y pagos, saldo por
   cliente. El módulo más importante para el negocio. *(pendiente)*
3. **[Facturación electrónica (ARCA)](src/facturacion)** — emisión de
   facturas A y B contra los web services de ARCA (WSAA + WSFEv1). Esqueleto
   funcional, ver su propio README para detalle de instalación y variables de
   entorno.

## Modelo de datos (resumen)

- **Cliente**: id, nombre, telefono, saldo (derivado de los movimientos).
- **CtaCteMov**: id, cliente_id, tipo (cargo/pago), monto, fecha, descripcion,
  comprobante_id (opcional).
- **Comprobante**: factura emitida con CAE (ver módulo de facturación).
- **SesionCaja**: id, apertura, cierre, monto_inicial, monto_final.
- **MovCaja**: id, sesion_id, tipo (ingreso/egreso), monto, fecha.

El detalle completo, las convenciones (plata en `decimal`, saldo derivado, no
`synchronize: true`) y los puntos pendientes de confirmar están en el
[`CLAUDE.md`](../CLAUDE.md) de la raíz del repo.
