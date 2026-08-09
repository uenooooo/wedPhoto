FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY worker.cjs ./
CMD ["node", "worker.cjs"]
