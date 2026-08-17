# Modelo funcional de Kontia

Kontia reproduce el dominio operativo de LitePOS, pero no su arquitectura de
sincronización. El navegador solo consume la API Hono y Cloudflare D1 es la
única fuente de verdad.

## Equivalencia de tablas

| LitePOS | Kontia D1 | Responsabilidad |
| --- | --- | --- |
| `businesses` | `businesses` | Negocios, moneda e impuesto |
| `users` | `users` | Usuarios, credenciales y roles |
| `categories` | `categories` | Clasificación del catálogo |
| `products` | `products` | Identidad y presentación del producto |
| `inventory_batches` | `inventory_batches` | Costo, precios y saldos por lote |
| `inventory_movements` | `inventory_movements` | Libro auditable de entradas, salidas y transferencias |
| `product_components` | `product_components` | Composición de productos y combos |
| `cash_sessions` | `cash_sessions` | Apertura, cierre y arqueo de caja |
| `sales` | `sales` | Cabecera de venta |
| `sale_items` | `sale_items` | Productos, lotes y precios congelados en la venta |
| `sale_refunds` | `sale_refunds` | Devoluciones completas de ventas |
| `suppliers` | `suppliers` | Proveedores |
| `supplier_invoices` | `supplier_invoices` | Facturas de compra |
| `operating_expenses` | `operating_expenses` | Gastos operativos |
| `financial_movements` | `financial_movements` | Libro de entradas y salidas de dinero |
| `audit_logs` | `audit_logs` | Auditoría funcional y administrativa |

`sync_metadata` no se replica porque solo existe para sincronizar SQLite local
con SQLite Cloud. `images` es una tabla propia de Kontia que reemplaza R2.

## Fuente de precios

`products` no define el precio operativo. Cada `inventory_batches` conserva:

- costo unitario;
- precio en efectivo;
- precio con tarjeta;
- existencia en almacén;
- existencia transferida al POS;
- fecha de recepción.

El POS selecciona el lote más antiguo con `pos_quantity > 0` (FIFO) y muestra
sus precios. Una venta puede consumir varios lotes; por eso crea un movimiento
de inventario por cada lote utilizado. `sale_items` congela el nombre y el
precio cobrado para que el historial no cambie si luego cambia el catálogo.

## Fuente de existencias

Los movimientos son el historial auditable. Los saldos de lote son valores
materializados para consultar rápidamente y deben cambiar en la misma operación
atómica que crea el movimiento.

- compra, producción, inyección y ajuste positivo: suman a almacén;
- transferencia al POS: resta almacén y suma POS;
- venta: resta POS;
- devolución de cliente: suma POS;
- merma y ajuste negativo: restan de su ubicación correspondiente;
- transferencia al almacén: resta POS y suma almacén.

Las columnas antiguas `products.sale_price_cents` y `products.current_stock`
quedan únicamente para permitir la migración desde el prototipo. La API no debe
usarlas después de `0003_litepos_domain.sql`.

## Diferencias deliberadas

- Todo importe se almacena en centavos enteros, no en `REAL`.
- Todas las consultas privadas se filtran por `business_id` obtenido de la sesión.
- Las contraseñas se derivan y nunca se guardan como PIN en texto plano.
- No existe acceso directo del frontend a D1.
- No existe sincronización bidireccional ni resolución de conflictos local/cloud.
