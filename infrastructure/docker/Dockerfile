FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=docker:27-cli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=docker:27-cli /usr/local/libexec/docker/cli-plugins/docker-buildx /usr/local/libexec/docker/cli-plugins/docker-buildx
WORKDIR /app
COPY --chown=node:node . .
RUN npm ci && npm run generate:production -w @deployhub/database
ENV NODE_ENV=production
USER node
CMD ["node", "--import", "tsx", "apps/api/src/index.ts"]

FROM base AS dashboard
ARG API_ORIGIN=http://api:4000
ARG MAX_UPLOAD_BYTES=104857600
ARG MAX_FILES=10000
ENV API_ORIGIN=$API_ORIGIN
ENV MAX_UPLOAD_BYTES=$MAX_UPLOAD_BYTES
ENV MAX_FILES=$MAX_FILES
RUN npm run build -w @deployhub/dashboard
CMD ["npm", "run", "start", "-w", "@deployhub/dashboard"]
