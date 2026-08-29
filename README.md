# Kontia

Gestión de inventario para pequeños negocios. React y la API Hono se despliegan juntos en Cloudflare Workers; D1 es la fuente central de datos.

## Principios iniciales

- El frontend nunca accede directamente a la base de datos.
- Todos los datos se aíslan por negocio desde la sesión autenticada.
- El dinero se almacena en centavos enteros.
- Cada cambio de existencia genera un movimiento auditable.
- No se permite inventario negativo.
- No existen usuarios o contraseñas predeterminadas.

## Desarrollo local

Requiere Node.js 22.12 o posterior; se recomienda Node 24 (consulta `.nvmrc`).

1. `npm install`
2. `cp .dev.vars.example .dev.vars`
3. Configura valores seguros para `SESSION_SECRET` y `BOOTSTRAP_SECRET`.
4. `npm run db:migrate:local`
5. `npm run dev`

En el primer acceso, Kontia solicitará el secreto de configuración para crear el negocio y el usuario propietario.
La base D1 local, incluidas las imágenes, se persiste en `.wrangler/state`.

Para reemplazar por completo la base local con una copia de la base remota:

```bash
npm run db:restore:local-from-remote
```

Este comando elimina los datos locales existentes; no modifica la base remota.

## Preparar Cloudflare

```bash
npx wrangler d1 create kontia-db
npx wrangler secret put SESSION_SECRET
npx wrangler secret put BOOTSTRAP_SECRET
npx wrangler secret put EXTERNAL_API_TOKEN
```

`EXTERNAL_API_TOKEN` protege la consulta global de catálogo y las salidas de inventario solicitadas
por aplicaciones externas autorizadas.

Reemplaza el identificador provisional en `wrangler.jsonc`, aplica las migraciones remotas y despliega:

```bash
npm run db:migrate:remote
npm run deploy
```
