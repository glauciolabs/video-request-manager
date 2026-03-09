FROM node:22-alpine
WORKDIR /app

COPY sla-service/package*.json ./
RUN npm install --omit=dev

COPY sla-service/src ./src

ENV NODE_ENV=production
EXPOSE 3004
CMD ["node", "src/index.js"]
