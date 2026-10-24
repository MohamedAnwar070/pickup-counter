FROM node:22-alpine AS builder

WORKDIR /app

# Copy root workspace and package manifests
COPY package*.json ./
COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/

# Install dependencies across workspaces
RUN npm install

# Copy backend source files
COPY backend ./backend

# Build backend NestJS application
RUN npm --workspace=backend run build

FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
COPY backend/package*.json ./backend/

RUN npm install --omit=dev

COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/backend/src/migrations ./backend/src/migrations
COPY --from=builder /app/backend/src/scripts ./backend/src/scripts

EXPOSE 3000

CMD ["sh", "-c", "node backend/dist/common/database/migrate.js && node backend/dist/scripts/seed.js && node backend/dist/main.js"]
