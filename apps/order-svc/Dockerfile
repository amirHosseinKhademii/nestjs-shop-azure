FROM node:20-alpine
WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@9.14.2 --activate
COPY package.json pnpm-workspace.yaml ./
COPY apps ./apps
COPY packages ./packages
RUN pnpm install && pnpm --filter "...@shop/order-svc" build && pnpm prune --prod
WORKDIR /workspace/apps/order-svc
EXPOSE 3003
USER node
CMD ["node", "dist/main.js"]
