package main

import (
	"log"
	"net/http"
	repository "shop/internal/adapters/postgresql/sqlc"
	"shop/internal/products"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/jackc/pgx/v5/pgxpool"
)

// mount
func (app *application) mount() http.Handler {
	r := chi.NewRouter()

	// A good base middleware stack
	r.Use(middleware.RequestID) // rate limiting
	r.Use(middleware.RealIP)    // rate limit and tracing
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	// Set a timeout value on the request context (ctx), that will signal
	// through ctx.Done() that the request has timed out and further
	// processing should be stopped.
	r.Use(middleware.Timeout(60 * time.Second))

	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("Ok"))
	})

	employeeService := products.NewService(repository.New(app.pool))
	employeeHandler := products.NewHandler(employeeService)

	r.Get("/employees", employeeHandler.ListEmployeesHandler)
	r.Get("/employees/{id}", employeeHandler.GetEmployeeById)
	r.Get("/employees/email/{email}", employeeHandler.GetEmployeeByEmail)
	r.Post("/employees", employeeHandler.AddEmployeeHandler)
	r.Put("/employees/{id}", employeeHandler.UpdateEmployeeHandler)
	r.Delete("/employees/{id}", employeeHandler.DeleteEmployeeHandler)

	return r
}

func (app *application) run(h http.Handler) error {
	srv := &http.Server{
		Addr:         app.config.addr,
		Handler:      h,
		WriteTimeout: time.Second * 30,
		ReadTimeout:  time.Second * 10,
		IdleTimeout:  time.Minute,
	}
	log.Println("Server has started at address", app.config.addr)
	return srv.ListenAndServe()
}

type application struct {
	config config
	pool   *pgxpool.Pool
}

type config struct {
	addr string
}
