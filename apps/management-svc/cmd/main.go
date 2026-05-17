package main

import (
	"context"
	"log/slog"
	"os"

	"shop/internal/configuration"
)

func main() {
	ctx := context.Background()
	configuration.LoadAncestorDotEnv()

	cfg := config{
		addr: ":3010",
	}

	logger := slog.New((slog.NewTextHandler(os.Stdout, nil)))
	slog.SetDefault(logger)

	pool, err := configuration.ConnectPostgres(ctx)

	if err != nil {
		slog.Error("DB has failed to start with", "error", err)
		os.Exit(1)
	}

	defer pool.Close()

	logger.Info("postgres: connected")

	api := &application{
		config: cfg,
		pool:   pool,
	}

	if err := api.run(api.mount()); err != nil {
		slog.Error("Server has failed to start with", "error", err)
		os.Exit(1)
	}
}
