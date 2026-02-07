#!/bin/sh
set -e

# Run migrations (uses ROOMS_DATABASE_URL at runtime)
npx prisma migrate deploy

# Start the application
exec node dist/src/main.js
