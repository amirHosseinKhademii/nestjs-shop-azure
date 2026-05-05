# syntax=docker/dockerfile:1.7

# ─── build ──────────────────────────────────────────────────────────────────
# Use the SDK image to restore + publish a self-contained, framework-dependent
# bundle. We keep the build context anchored at the repo root in compose so
# this Dockerfile can resolve sibling apps if it ever needs to.
FROM mcr.microsoft.com/dotnet/sdk:10.0-alpine AS build
WORKDIR /src

COPY apps/task-svc/task-svc.csproj apps/task-svc/
RUN dotnet restore apps/task-svc/task-svc.csproj

COPY apps/task-svc/ apps/task-svc/
RUN dotnet publish apps/task-svc/task-svc.csproj \
    -c Release \
    -o /app/publish \
    --no-restore \
    /p:UseAppHost=false

# ─── runtime ────────────────────────────────────────────────────────────────
FROM mcr.microsoft.com/dotnet/aspnet:10.0-alpine AS runtime
WORKDIR /app

# Drop privileges. The base image already ships an "app" user (UID 1654);
# running as that user satisfies most pod-security policies without ceremony.
USER app

ENV ASPNETCORE_HTTP_PORTS=3004 \
    DOTNET_RUNNING_IN_CONTAINER=true \
    DOTNET_USE_POLLING_FILE_WATCHER=false

COPY --from=build /app/publish .

EXPOSE 3004

ENTRYPOINT ["dotnet", "ShopNest.TaskSvc.dll"]
