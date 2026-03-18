FROM node:24-trixie-slim
WORKDIR /app
RUN npm install -g npm@11.11.1 --no-audit --no-fund

COPY sla-service/package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY sla-service/src ./src

ENV NODE_ENV=production

RUN chown -R 10001:10001 /app
USER 10001

EXPOSE 3004
CMD ["node", "src/index.js"]
