# syntax=docker/dockerfile:1.6

# Build stage — compile TypeScript with the full devDependencies installed.
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* pnpm-lock.yaml* yarn.lock* ./
RUN if [ -f pnpm-lock.yaml ]; then npm i -g pnpm && pnpm install --frozen-lockfile; \
    elif [ -f yarn.lock ]; then yarn install --frozen-lockfile; \
    else npm install; fi
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Runtime stage — only production deps + compiled JS.
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm install --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist

# Run as non-root for safer container deploys.
USER node

CMD ["node", "dist/index.js"]
