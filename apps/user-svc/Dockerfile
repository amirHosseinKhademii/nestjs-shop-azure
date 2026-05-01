FROM node:20-alpine
WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@9.14.2 --activate
COPY package.json pnpm-workspace.yaml ./
COPY apps ./apps
COPY packages ./packages
COPY turbo.json ./
RUN pnpm install \
 && pnpm exec turbo run build --filter=@shop/user-svc \
 && pnpm prune --prod
WORKDIR /workspace/apps/user-svc
EXPOSE 3001
USER node
CMD ["node", "dist/main.js"]
