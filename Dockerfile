# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Install OpenSSL compatibility library for Prisma
RUN apk add --no-cache openssl libc6-compat

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Generate Prisma Client
RUN npx prisma generate

# Build the application
RUN npm run build

# Stage 2: Production
FROM node:20-alpine

WORKDIR /app

# Install OpenSSL compatibility library for Prisma
RUN apk add --no-cache openssl libc6-compat

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install only production dependencies
RUN npm install --omit=dev

# Copy Prisma schema and generate client
RUN npx prisma generate

# Copy built application from builder
COPY --from=builder /app/dist ./dist

# Copy migrations (needed for prisma migrate deploy at runtime)
COPY --from=builder /app/prisma/migrations ./prisma/migrations

# Copy entrypoint script and fix Windows CRLF -> LF
COPY docker-entrypoint.sh ./
RUN sed -i 's/\r$//' docker-entrypoint.sh && chmod +x docker-entrypoint.sh

EXPOSE 5004

HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD node -e "const p=process.env.PORT||5004;require('http').get('http://localhost:'+p+'/rooms/health/liveness',(r)=>process.exit(r.statusCode===200?0:1))"

ENTRYPOINT ["./docker-entrypoint.sh"]
