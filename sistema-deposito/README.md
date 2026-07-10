# Sistema de Depósito

Administra la mercadería que se guarda en el depósito (casa). Es el sistema
simple del proyecto: corre en la PC del depósito y no se comunica (por ahora)
con [`sistema-local`](../sistema-local).

## Alcance

- ABM de productos.
- Campos por producto: **nombre, código, cantidad, proveedor**.
- Listado ordenado alfabéticamente + buscador por nombre.

## Modelo de datos

- **Producto**: id, nombre, codigo, cantidad, proveedor.
  - `cantidad` es **decimal**, no entero, por si en algún momento el depósito
    maneja fraccionado (metro/kilo).

> El **código de producto** debe usar la misma convención que en
> `sistema-local`, para que ambos sistemas puedan cruzarse el día que haga
> falta. Ver la regla de consistencia en el [README raíz](../README.md).

## Estado

Pendiente de implementar. Ver [`CLAUDE.md`](../CLAUDE.md) en la raíz del repo
para el contexto completo.
