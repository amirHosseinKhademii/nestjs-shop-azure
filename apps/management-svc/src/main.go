package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"management-svc/internal/config"
	"management-svc/internal/controller"
	"management-svc/internal/service"
	"management-svc/internal/utils"
)

func main() {
	utils.LoadAncestorDotEnv()

	ctx := context.Background()
	pool, err := config.ConnectPostgresPool(ctx)
	if err != nil {
		log.Fatal(err)
	}
	defer pool.Close()
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
