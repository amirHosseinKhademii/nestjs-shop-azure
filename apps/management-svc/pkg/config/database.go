package config

import (
	"context"
	"fmt"
	"os"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

// ConnectPostgresPool reads DATABASE_URL (same as user-svc / order-svc), opens a pool,
// and verifies connectivity with Ping.
func ConnectPostgresPool(ctx context.Context) (*pgxpool.Pool, error) {
	raw := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	if raw == "" {
		return nil, fmt.Errorf("DATABASE_URL is required (same connection string as user-svc / order-svc)")
	}
	databaseURL := strings.TrimPrefix(strings.TrimPrefix(raw, `"`), `'`)
	databaseURL = strings.TrimSuffix(strings.TrimSuffix(databaseURL, `"`), `'`)

	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return nil, fmt.Errorf("postgres connect: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("postgres ping: %w", err)
	}
	return pool, nil
}
