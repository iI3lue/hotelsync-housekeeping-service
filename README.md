# HotelSync — Housekeeping Service

Microservicio de limpieza de HotelSync: estado de habitaciones y tareas de limpieza generadas a partir de los check-outs.

- **Producción:** https://hotelsync-housekeeping-service.onrender.com
- **Puerto local:** 3006
- **Base de datos:** `housekeeping_db` (PostgreSQL 16)

## Responsabilidad

| Hace | No hace |
| --- | --- |
| Mantener el estado de cada habitación (`dirty`, `cleaning`, `clean`, `maintenance`) | Hacer check-in/check-out |
| Crear tareas al recibir `checkout.completed` | Gestionar reservas ni tarifas |
| Asignar, iniciar y completar tareas | Cobrar ni facturar |
| Consultar el personal del hotel en user-service | Ser dueño del catálogo de habitaciones |

## Tecnologías

Node.js ≥20 · TypeScript · Express · Prisma · PostgreSQL 16 · Zod · RabbitMQ (consumidor de eventos).

## Arquitectura interna

`Route → Controller → Service → Prisma`, con Zod y `AppError`. El consumidor de `checkout.completed` (cola durable `housekeeping.tasks`) marca la habitación como `dirty` y crea la tarea. La asignación consulta user-service para validar al empleado; si user-service no responde, la operación falla cerrada.

## Endpoints

| Método | Ruta | Auth | Descripción |
| --- | --- | --- | --- |
| GET | `/health` | — | Estado del servicio |
| GET | `/v1/rooms/status` | JWT + HOUSEKEEPER / MANAGER / SUPER_ADMIN | Estado de habitaciones |
| PUT | `/v1/rooms/:id/status` | JWT + MANAGER / SUPER_ADMIN | Cambia estado de habitación |
| GET | `/v1/tasks` | JWT + MANAGER / SUPER_ADMIN | Lista tareas |
| GET | `/v1/tasks/mine` | JWT | Tareas propias |
| PUT | `/v1/tasks/:id/assign` | JWT + MANAGER / SUPER_ADMIN | Asigna tarea |
| PUT | `/v1/tasks/:id/start` | JWT + HOUSEKEEPER / MANAGER / SUPER_ADMIN | Inicia tarea |
| PUT | `/v1/tasks/:id/complete` | JWT + HOUSEKEEPER / MANAGER / SUPER_ADMIN | Completa tarea |

## Modelo de datos

Tablas: `RoomStatus` (una fila por hotel + número de habitación) y `CleaningHistory` (historial de tareas).

Migraciones en `prisma/migrations` (3). Seed opcional: con `SEED_HOTEL_ID` y `SEED_ROOM_NUMBERS` (lista separada por comas) crea las habitaciones en estado `clean`.

## Comunicación

- **Consume:** `checkout.completed` (cola durable `housekeeping.tasks`).
- **REST saliente:** Booking `GET /v1/bookings/:id` (header `x-housekeeping-key`) y user-service para validar al personal asignado (`USER_SERVICE_URL`).
- No publica eventos.

## Variables de entorno

| Variable | Obligatoria | Descripción |
| --- | --- | --- |
| `NODE_ENV` | No | `development` / `production` |
| `PORT` | No | Puerto HTTP (default 3006) |
| `DATABASE_URL` | Sí | PostgreSQL de `housekeeping_db` |
| `DIRECT_URL` | No | Conexión directa prevista para migraciones |
| `AUTH_JWT_SECRET` | Sí | HS256 compartido |
| `BOOKING_SERVICE_URL` | Sí | Base de booking-service |
| `BOOKING_SERVICE_KEY` | Sí | Debe coincidir con `HOUSEKEEPING_SERVICE_KEY` de Booking |
| `USER_SERVICE_URL` | Sí | Sin ella la asignación de tareas falla cerrada |
| `RABBITMQ_URL` | No | Sin ella no se reciben check-outs |
| `SEED_HOTEL_ID` | No | Solo seed |
| `SEED_ROOM_NUMBERS` | No | Solo seed (coma-separados) |

Copiar `.env.example` a `.env` y completar los valores.

## Ejecución local

```bash
npm install
cp .env.example .env
npx prisma migrate deploy
npm run seed
npm run dev                 # http://localhost:3006
```

## Despliegue

Render (Oregon, free): build `npm ci && npx prisma generate && npm run build`; start `npx prisma migrate deploy && npm start`; Neon `housekeeping_db`. El plan free duerme a los 15 minutos.

## Pruebas y verificación

```bash
npm test
npm run lint
curl https://hotelsync-housekeeping-service.onrender.com/health
```

## Respaldo de base de datos

```bash
pg_dump "$DATABASE_URL" -Fc -f housekeeping_db.dump
pg_restore --clean --if-exists -d "$DATABASE_URL" housekeeping_db.dump
```

## Estructura

```
src/{routes,controllers,services,validators,middleware,lib}
prisma/{schema.prisma,seed.ts,migrations}
tests/
```
