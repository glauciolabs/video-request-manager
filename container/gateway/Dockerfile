FROM node:22-alpine
WORKDIR /app

COPY gateway/package*.json ./
RUN npm install --omit=dev

COPY gateway/src ./src

ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "src/index.js"]
