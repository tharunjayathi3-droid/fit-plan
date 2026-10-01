# Database boundary

The Prisma schema, migration history, and seed data live under `prisma/`. Use `lib/prisma.ts` from server-side services only; client components must not import Prisma or perform database access.

`services/` owns persistence operations and validates untrusted profile input with the Zod schema in `lib/validation.ts`. API routes, authentication, file storage, and generated plan persistence are intentionally not implemented in this first UI/data-model phase.
