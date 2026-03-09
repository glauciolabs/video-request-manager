FROM node:22-alpine
WORKDIR /app

COPY notification-service/package*.json ./
RUN npm install --omit=dev

COPY notification-service/src ./src

ENV NODE_ENV=production
EXPOSE 3003
CMD ["node", "src/index.js"]
