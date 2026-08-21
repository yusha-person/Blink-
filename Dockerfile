# Stage 1: build the frontend
FROM oven/bun:1 AS frontend
WORKDIR /app
COPY package.json bun.lock tsconfig.json vite.config.ts postcss.config.js tailwind.config.js index.html ./
COPY src ./src
RUN bun install --frozen-lockfile && bunx vite build

# Stage 2: runtime (backend + built frontend)
FROM oven/bun:1
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --production --frozen-lockfile
COPY server ./server
COPY --from=frontend /app/dist ./dist

CMD ["bun", "server/index.ts"]
