FROM node:22-slim AS base
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY packages/core/package.json packages/core/
COPY packages/router/package.json packages/router/
COPY packages/providers/package.json packages/providers/
COPY packages/channels/package.json packages/channels/
COPY packages/tools/package.json packages/tools/
COPY packages/memory/package.json packages/memory/
COPY packages/voice/package.json packages/voice/
COPY packages/cli/package.json packages/cli/
COPY apps/nexus/package.json apps/nexus/
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/ packages/
COPY apps/ apps/
RUN pnpm build

FROM base AS runtime
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/*/node_modules ./packages/
COPY --from=build /app/packages/*/dist ./packages/
COPY --from=build /app/apps/nexus/dist ./apps/nexus/dist
COPY --from=build /app/package.json ./
COPY --from=build /app/pnpm-workspace.yaml ./
COPY --from=build /app/packages/shared/package.json ./packages/shared/
COPY --from=build /app/packages/core/package.json ./packages/core/
COPY --from=build /app/packages/router/package.json ./packages/router/
COPY --from=build /app/packages/providers/package.json ./packages/providers/
COPY --from=build /app/packages/channels/package.json ./packages/channels/
COPY --from=build /app/packages/tools/package.json ./packages/tools/
COPY --from=build /app/packages/memory/package.json ./packages/memory/
COPY --from=build /app/packages/voice/package.json ./packages/voice/
COPY --from=build /app/packages/cli/package.json ./packages/cli/
COPY --from=build /app/apps/nexus/package.json ./apps/nexus/

RUN mkdir -p /app/data /app/config
VOLUME ["/app/data", "/app/config"]
EXPOSE 3000

CMD ["node", "apps/nexus/dist/index.js"]
