FROM node:20-alpine AS dependencies
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./backend/
COPY sonex-core ./sonex-core/
WORKDIR /app/backend
RUN npm ci --ignore-scripts

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=dependencies /app/backend/node_modules ./backend/node_modules
COPY --from=dependencies /app/sonex-core ./sonex-core
COPY backend ./backend
WORKDIR /app/backend
RUN npx prisma generate && npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache curl tini wget
COPY --from=dependencies /app/backend/node_modules ./backend/node_modules
COPY --from=dependencies /app/sonex-core ./sonex-core
COPY --from=build /app/backend/dist ./backend/dist
COPY --from=build /app/backend/prisma ./backend/prisma
COPY --from=build /app/backend/package.json ./backend/

WORKDIR /app/backend
ENV NODE_ENV=production
EXPOSE 5000

ENTRYPOINT ["/sbin/tini", "--"]
CMD npx prisma migrate deploy && node dist/main.js
