FROM node:20-alpine
WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@9.14.2 --activate
COPY package.json pnpm-workspace.yaml ./
COPY apps ./apps
COPY packages ./packages
RUN pnpm install && pnpm --filter @shop/shop-svc build && pnpm prune --prod
WORKDIR /workspace/apps/shop-svc
EXPOSE 3002
CMD ["node", "dist/main.js"]
