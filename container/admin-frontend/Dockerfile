FROM node:22-alpine AS builder
WORKDIR /app

COPY admin-frontend/package*.json ./
RUN npm install

COPY admin-frontend/ ./
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3006
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=builder /app/package*.json ./
RUN npm install --omit=dev

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/src ./src
COPY --from=builder /app/next.config.mjs ./next.config.mjs
COPY --from=builder /app/jsconfig.json ./jsconfig.json

EXPOSE 3006
CMD ["npm", "run", "start"]
