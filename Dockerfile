FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev || npm install --omit=dev
COPY . .
RUN node scripts/generate-hashes.js
EXPOSE 3000
CMD ["node", "server.js"]
