FROM oven/bun:1.3.1 AS base

WORKDIR /app

COPY package.json ./
RUN bun install

FROM base AS development

COPY . .

EXPOSE 8787

CMD ["sh", "-c", "bun run db:migrate && bun run dev"]

FROM base AS production

ENV NODE_ENV=production

COPY . .

RUN bun run build

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD bun -e "const r = await fetch('http://127.0.0.1:8787/health'); if (!r.ok) process.exit(1);" || exit 1

CMD ["bun", "run", "start"]
