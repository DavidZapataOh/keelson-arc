FROM node:24
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 CI=true
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile --filter @keelson/issuer... --filter @keelson/keeper...
ENV NODE_ENV=production
CMD ["bash", "deploy/start.sh"]
