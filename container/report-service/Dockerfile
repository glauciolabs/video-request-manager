FROM node:22-alpine
WORKDIR /app

COPY report-service/package*.json ./
RUN npm install --omit=dev

COPY report-service/src ./src

ENV NODE_ENV=production
EXPOSE 3005
CMD ["node", "src/index.js"]
