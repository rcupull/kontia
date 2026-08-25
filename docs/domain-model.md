# Modelo funcional de Kontia

Este documento resume las decisiones de dominio que deben preservarse al
modificar Kontia. Cloudflare D1 es la fuente de verdad; el navegador consume la
API Hono y solo el POS mantiene una instantánea y una cola offline temporal.

## Reglas fundamentales

- Toda consulta privada se limita por el `business_id` de la sesión.
- Los importes se almacenan como enteros en la unidad menor de su moneda.
- Los costos, precios, ventas, compras e informes usan la moneda base del negocio.
- Los historiales congelan nombres, precios, importes y tasas; nunca se recalculan
  usando valores actuales.
- Los libros auditables y sus saldos materializados cambian dentro del mismo
  lote atómico de sentencias.
- Una operación automática no debe duplicarse como un nuevo ingreso o gasto al
  trasladar dinero entre caja, banco o monedas.

## Mapa de responsabilidades

| Tabla                            | Responsabilidad                                             |
| -------------------------------- | ----------------------------------------------------------- |
| `businesses`                     | Negocio, moneda contable base e impuesto                    |
| `business_currencies`            | Monedas que el negocio acepta o entrega                     |
| `money_accounts`                 | Ubicación lógica de saldos nominales por moneda             |
| `monetary_components`            | Forma real en que una operación recibió o entregó dinero    |
| `currency_exchanges`             | Cabecera de cambios internos entre moneda base y secundaria |
| `users`                          | Credenciales, negocio y roles                               |
| `categories`, `products`         | Identidad y presentación del catálogo                       |
| `inventory_batches`              | Costo y precios congelados por lote                         |
| `inventory_batch_stocks`         | Existencia materializada de un lote en cada ubicación       |
| `inventory_movements`            | Libro auditable de entradas, salidas y transferencias       |
| `cash_sessions`                  | Cabecera compatible de apertura y cierre de POS             |
| `cash_session_currency_balances` | Apertura, esperado, contado y diferencia por moneda         |
| `sales`, `sale_items`            | Cabecera, artículos y precios congelados de una venta       |
| `sale_refunds`                   | Devolución completa de una venta                            |
| `suppliers`, `supplier_invoices` | Proveedores y documentos de compra en moneda base           |
| `financial_movements`            | Clasificación contable de entradas y salidas financieras    |
| `audit_logs`                     | Auditoría funcional y administrativa                        |

`operating_expenses` fue eliminada en la migración `0006`; los gastos viven en
`financial_movements`. `images` reemplaza el almacenamiento de imágenes de
LitePOS. `sync_metadata` no existe porque Kontia no replica su arquitectura de
sincronización.

## Inventario, precios y existencias

`products` no contiene cantidades, costos ni precios operativos. Cada lote
conserva costo unitario, precio en efectivo, precio con tarjeta y fecha de
recepción. El POS consume primero el lote disponible más antiguo de su
ubicación (FIFO).

`inventory_movements` es el historial auditable; `inventory_batch_stocks` es el
saldo materializado para consultar rápido. Una venta puede consumir varios
lotes y crea un movimiento por cada asignación. `sale_items` congela el nombre
y el precio cobrado para que el historial no cambie con el catálogo.

- compra, producción, inyección y ajuste positivo: suman a una ubicación;
- venta, consumo, retiro, merma y ajuste negativo: restan;
- transferencia: resta del origen y suma al destino;
- devolución de cliente: repone la ubicación del POS.

## Modelo monetario

### Moneda contable base

`businesses.currency` es la única moneda contable base. Los siguientes importes
siempre están expresados en ella:

- `sales.total_cents` y los totales de `sale_items`;
- `supplier_invoices.total_amount_cents`;
- costos y precios de `inventory_batches`;
- `financial_movements.amount_cents`;
- métricas consolidadas del dashboard.

USD, EUR u otras monedas no cambian el valor contable de la operación. Explican
cómo se liquidó ese valor. La moneda base también debe existir y permanecer
activa en `business_currencies`.

### Componentes monetarios

`monetary_components` es la fuente de verdad sobre el dinero recibido o
entregado. Una venta, factura o movimiento financiero puede tener varias filas.
Cada fila congela:

- moneda e importe nominal (`currency_code`, `amount_minor`);
- tasa usada, escalada por `1 000 000`;
- equivalente en moneda base (`base_amount_cents`);
- cuenta, medio de pago y dirección (`inflow` o `outflow`).

Para una operación liquidada completamente debe cumplirse:

```text
importe contable base = suma de base_amount_cents de sus componentes
```

Ejemplo de compra por `69 850 CUP`:

```text
90 USD × 665 = 59 850 CUP
10 000 CUP    = 10 000 CUP
Total         = 69 850 CUP
```

Las facturas admiten pagos parciales: su pendiente es el total de la factura
menos la suma de sus componentes de salida. Una factura histórica sin
componentes no debe suponerse pagada.

### Medio de pago y precio del POS

La moneda y el medio de pago son dimensiones distintas. Un componente puede
ser USD en efectivo, CUP por tarjeta o EUR por transferencia. El selector
heredado efectivo/tarjeta del POS determina el precio del lote que se aplica;
los componentes determinan cómo se cobró realmente la venta.

Las devoluciones crean componentes de salida que reflejan los componentes de
entrada de la venta original. Una venta offline conserva sus componentes en la
cola y la API valida nuevamente precios, período autorizado y total monetario
al sincronizar.

## Caja por moneda

`cash_sessions` conserva los campos de moneda base por compatibilidad.
`cash_session_currency_balances` es la fuente de verdad para el efectivo físico:

```text
opening + entradas en efectivo - salidas en efectivo = expected
counted - expected = difference
```

Existe una fila por moneda activa. Tarjetas y transferencias crean componentes
monetarios, pero no modifican el efectivo físico. El cierre cuenta cada moneda
por separado; no convierte todo el efectivo usando una tasa actual.

Propietarios y administradores pueden abrir sesiones tanto en puntos de venta
como en almacenes, y pueden mantener más de una sesión abierta siempre que cada
una pertenezca a una ubicación diferente. Los vendedores continúan limitados a
las ubicaciones POS permitidas. Todos los saldos multimoneda pertenecen a una
sesión concreta, nunca solamente al usuario.

## Cambios de moneda

Un `currencyExchange` transforma saldos del mismo negocio y tiene al menos dos
componentes:

- salida de la moneda entregada;
- entrada de la moneda recibida.

Uno de los lados debe ser la moneda base. Sin comisión, ambos componentes deben
tener el mismo equivalente base. Por ejemplo:

```text
sale 6 650 CUP; entran 10 USD a 665 CUP/USD
```

El cambio no es ingreso, gasto ni inyección de capital. Una comisión se registra
aparte como gasto para no ocultarla dentro de la tasa. Si el cambio pertenece a
una sesión de POS, también actualiza los saldos físicos esperados de ambas
monedas.

## Compatibilidad histórica

La migración `0010_multi_currency_money.sql` interpreta los datos anteriores
como operaciones realizadas íntegramente en la moneda base con tasa `1:1`:

- crea la moneda base y cuentas históricas de efectivo y banco;
- crea un componente por venta y su reverso por devolución;
- migra movimientos financieros independientes;
- crea saldos por moneda base para sesiones anteriores;
- no inventa pagos de facturas de proveedores.

Los identificadores de migración son deterministas para evitar duplicados. Los
campos heredados se mantienen mientras existan lectores antiguos, pero las
nuevas funciones monetarias deben consultar `monetary_components` y
`cash_session_currency_balances`.

## Seguridad e integridad

- Las contraseñas se derivan y nunca se almacenan en texto plano.
- El frontend no accede directamente a D1.
- Las cuentas y monedas de un componente deben pertenecer al mismo negocio.
- Las tasas usan enteros escalados, nunca `REAL`.
- Los importes históricos no se sobrescriben cuando cambia una tasa.
- Un cambio o devolución confirmado debe revertirse mediante otra operación
  auditable, no editando silenciosamente el historial.
