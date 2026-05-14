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

	"management-svc/pkg/config"
	"management-svc/pkg/controller"
	"management-svc/pkg/service"
	"management-svc/pkg/utils"
)

func shutdown(srv *http.Server) {
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("shutdown signal received, stopping server…")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	// defer cancel() means: “always call cancel() once shutdown is done with this scope.”
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("http shutdown: %v", err)
	}
}

func bootstrap(mux *http.ServeMux) {

	port := strings.TrimSpace(os.Getenv("PORT"))
	if port == "" {
		port = "3010"
	}
	// http.Server{ ... } is a struct literal (one server value with those fields).
	// & in front means: “allocate that struct and give me a pointer to it.”
	// So srv has type *http.Server. The HTTP server object lives in one place; srv is how you refer to it.
	srv := &http.Server{
		Addr:              ":" + port,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}

	// go starts a goroutine: the function literal after it runs in the background,
	// at the same time as the rest of bootstrap.
	// The call go func() { ... }() returns immediately;
	// it does not wait for ListenAndServe to finish.
	// Why that matters here
	// srv.ListenAndServe() blocks.
	// It runs until the server stops (error or graceful shutdown).
	// If you called it without go on the main path of bootstrap,
	// execution would sit inside ListenAndServe forever and you would never reach the next line:

	// So go is what lets the server run concurrently while shutdown
	// still runs sequentially in bootstrap and can stop the server cleanly.
	go func() {
		log.Printf("HTTP  http://127.0.0.1:%s/  (PORT=%s)", port, port)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("http server: %v", err)
		}
	}()

	shutdown(srv)
}

func main() {
	utils.LoadAncestorDotEnv()

	ctx := context.Background()

	pool, err := config.ConnectPostgresPool(ctx)
	if err != nil {
		log.Fatal(err)
	}
	defer pool.Close()
	log.Println("postgres: connected")

	ctrl := controller.NewHTTPController(
		service.NewMetaService(),
		service.NewHealthService(pool))

	// http.NewServeMux() returns a *http.ServeMux.
	//  So mux is already a pointer to the mux.
	//  You do not write & yourself; the standard library returns the pointer for you.
	mux := http.NewServeMux()

	ctrl.Register(mux)

	bootstrap(mux)
}
