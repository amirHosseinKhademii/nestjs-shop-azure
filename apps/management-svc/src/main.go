package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"

	"management-svc/internal/controller"
	"management-svc/internal/service"
)

// tryLoadAncestorDotEnv loads the first `.env` found walking up from the working directory
// (typically the monorepo root). Already-set environment variables are not overridden.
func tryLoadAncestorDotEnv() {
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

func main() {
	tryLoadAncestorDotEnv()

	ctx := context.Background()
	raw := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	if raw == "" {
		log.Fatal("DATABASE_URL is required (same connection string as user-svc / order-svc)")
	}
	databaseURL := strings.TrimPrefix(strings.TrimPrefix(raw, `"`), `'`)
	databaseURL = strings.TrimSuffix(strings.TrimSuffix(databaseURL, `"`), `'`)

	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		log.Fatalf("postgres connect: %v", err)
	}
	defer pool.Close()

	if err := pool.Ping(ctx); err != nil {
		log.Fatalf("postgres ping: %v", err)
	}
	log.Println("postgres: connected")

	port := strings.TrimSpace(os.Getenv("PORT"))
	if port == "" {
		port = "3010"
	}

	metaSvc := service.NewMetaService()
	healthSvc := service.NewHealthService(pool)
	ctrl := controller.NewHTTPController(metaSvc, healthSvc)

	mux := http.NewServeMux()
	ctrl.Register(mux)

	srv := &http.Server{
		Addr:              ":" + port,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		log.Printf("HTTP  http://127.0.0.1:%s/  (PORT=%s)", port, port)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("http server: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("shutdown signal received, stopping server…")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("http shutdown: %v", err)
	}
}
