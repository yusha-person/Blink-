FROM oven/bun:1

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --production --frozen-lockfile

COPY server ./server

CMD ["bun", "server/index.ts"]
