package configuration

import (
	"context"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
)

// ConnectPostgresPool reads DATABASE_URL (same as user-svc / order-svc), opens a pool,
// and verifies connectivity with Ping.
func ConnectPostgres(ctx context.Context) (*pgxpool.Pool, error) {
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

// LoadAncestorDotEnv loads the first `.env` found walking up from the working directory
// (typically the monorepo root). Already-set environment variables are not overridden.
func LoadAncestorDotEnv() {
	dir, err := os.Getwd()
	if err != nil {
		return
	}
	for {
		p := filepath.Join(dir, ".env")
		if st, err := os.Stat(p); err == nil && !st.IsDir() {
			if err := godotenv.Load(p); err != nil {
				log.Fatalf("load %s: %v", p, err)
			}
			return
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return
		}
		dir = parent
	}
}
