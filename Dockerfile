FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
ENV NODE_ENV=production PORT=3000 SQLITE_PATH=/data/ndi.db
VOLUME /data
EXPOSE 3000
CMD ["node","--disable-warning=ExperimentalWarning","server/index.js"]
