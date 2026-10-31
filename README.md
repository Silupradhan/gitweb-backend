# Backend

Node.js + Express + PostgreSQL API using Drizzle ORM, organized in a modular folder structure.

## Getting started

```bash
npm install
```

Set your database connection string in `.env` → `DATABASE_URL`, then:

```bash
npm run dev        # start in dev mode (nodemon)
npm start          # start in production mode
```

## Database (Drizzle)

```bash
npm run db:generate   # generate migrations from schema
npm run db:migrate    # apply migrations
npm run db:push       # push schema directly (no migration files)
npm run db:studio     # browse data in Drizzle Studio
```

## Structure

```
src/
├── config/            # env config
├── db/                # drizzle client, central schema, migrations
├── middlewares/       # error handler, 404
├── modules/           # feature modules (each one is self-contained)
│   └── users/
│       ├── user.schema.js     # drizzle tables
│       ├── user.service.js    # business logic / queries
│       ├── user.controller.js # request handling
│       └── user.routes.js     # express routes
├── routes/            # mounts all module routers under /api/v1
├── utils/             # helpers (asyncHandler)
├── app.js             # express app setup
└── server.js          # entrypoint
```

## Adding a new module

1. Create `src/modules/<name>/` with `.schema.js`, `.service.js`, `.controller.js`, `.routes.js`
2. Re-export its tables from `src/db/schema.js`
3. Mount its router in `src/routes/index.js`
