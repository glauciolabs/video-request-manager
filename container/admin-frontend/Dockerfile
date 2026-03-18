FROM node:24-trixie-slim AS builder
WORKDIR /app
RUN npm install -g npm@11.11.1 --no-audit --no-fund

COPY admin-frontend/package*.json ./
RUN npm install --no-audit --no-fund

COPY admin-frontend/ ./
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:24-trixie-slim AS runtime
WORKDIR /app
RUN npm install -g npm@11.11.1 --no-audit --no-fund

ENV NODE_ENV=production
ENV PORT=3006
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=builder /app/package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/src ./src
COPY --from=builder /app/next.config.mjs ./next.config.mjs
COPY --from=builder /app/jsconfig.json ./jsconfig.json

RUN chown -R 10001:10001 /app
USER 10001

EXPOSE 3006
CMD ["npm", "run", "start"]
