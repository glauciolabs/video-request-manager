FROM node:22-alpine
WORKDIR /app

COPY order-service/package*.json ./
RUN npm install --omit=dev

COPY order-service/src ./src

ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "src/index.js"]
