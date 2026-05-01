FROM node:20-alpine
WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@9.14.2 --activate
COPY package.json pnpm-workspace.yaml ./
COPY apps ./apps
COPY packages ./packages
RUN pnpm install && pnpm --filter @shop/user-svc build && pnpm prune --prod
WORKDIR /workspace/apps/user-svc
EXPOSE 3001
CMD ["node", "dist/main.js"]
