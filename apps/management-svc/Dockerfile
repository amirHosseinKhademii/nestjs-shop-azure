# syntax=docker/dockerfile:1
#
# Build from repo root (optional) or from this app directory:
#   docker build -t management-svc -f apps/management-svc/Dockerfile apps/management-svc
#
# Run (set DATABASE_URL like other services):
#   docker run --rm -e DATABASE_URL -p 3010:3010 management-svc

FROM golang:1.22-alpine AS build
WORKDIR /src

RUN apk add --no-cache ca-certificates git

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/management-svc ./src

FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata \
	&& adduser -D -H -u 65532 app

WORKDIR /app
COPY --from=build /out/management-svc /app/management-svc
RUN chmod 555 /app/management-svc

USER app

ENV PORT=3010
EXPOSE 3010

ENTRYPOINT ["/app/management-svc"]
