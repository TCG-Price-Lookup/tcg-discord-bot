# syntax=docker/dockerfile:1.6

# Build stage — compile TypeScript with the full devDependencies installed.
# better-sqlite3 is a native module so we need python3 + build-base in
# both stages where it's installed (npm install runs node-gyp).
FROM node:20-alpine AS build
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json* pnpm-lock.yaml* yarn.lock* ./
RUN if [ -f pnpm-lock.yaml ]; then npm i -g pnpm && pnpm install --frozen-lockfile; \
    elif [ -f yarn.lock ]; then yarn install --frozen-lockfile; \
    else npm install; fi
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Runtime stage — only production deps + compiled JS.
# We rebuild better-sqlite3 here from the production install so the
# runtime image stays slim (no build tools in the final layer).
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache --virtual .build-deps python3 make g++ \
 && mkdir -p /app/data \
 && chown -R node:node /app/data

COPY package.json package-lock.json* ./
RUN npm install --omit=dev \
 && npm cache clean --force \
 && apk del .build-deps

COPY --from=build /app/dist ./dist

# Persistent SQLite directory — mount this as a volume in production
# to keep alerts and portfolios across container restarts.
VOLUME ["/app/data"]
ENV DATA_DIR=/app/data

# Run as non-root for safer container deploys.
USER node

CMD ["node", "dist/index.js"]
