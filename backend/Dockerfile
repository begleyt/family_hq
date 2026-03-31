FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
RUN mkdir -p /app/data
EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=5s --start-period=10s CMD wget -qO- http://127.0.0.1:4000/api/health || exit 1
CMD ["node", "server.js"]
