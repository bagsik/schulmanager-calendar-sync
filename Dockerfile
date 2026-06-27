FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV DATA_DIR=/data
ENV PORT=8080

COPY package.json ./
COPY README.md ./
COPY server.mjs ./
COPY src ./src

RUN mkdir -p /data && chown -R node:node /app /data

USER node

EXPOSE 8080
VOLUME ["/data"]

CMD ["node", "server.mjs"]
