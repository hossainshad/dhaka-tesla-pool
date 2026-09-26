FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
EXPOSE 4000

USER node

CMD ["sh", "-c", "node scripts/setup-db.js && exec node src/server.js"]