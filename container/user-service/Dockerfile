FROM node:22-alpine
WORKDIR /app

COPY user-service/package*.json ./
RUN npm install --omit=dev

COPY user-service/src ./src

ENV NODE_ENV=production
EXPOSE 3002
CMD ["node", "src/index.js"]
