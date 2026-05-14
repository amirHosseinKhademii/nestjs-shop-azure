package controller

import (
	"encoding/json"
	"net/http"

	"management-svc/internal/service"
)

type HTTPController struct {
	meta   *service.MetaService
	health *service.HealthService
}

func NewHTTPController(meta *service.MetaService, health *service.HealthService) *HTTPController {
	return &HTTPController{meta: meta, health: health}
}

func (c *HTTPController) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /", c.root)
	mux.HandleFunc("GET /health/live", c.healthLive)
	mux.HandleFunc("GET /health/ready", c.healthReady)
}

func (c *HTTPController) root(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(c.meta.RootInfo())
}

func (c *HTTPController) healthLive(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(c.health.Live())
}

func (c *HTTPController) healthReady(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if err := c.health.Ready(r.Context()); err != nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		_ = json.NewEncoder(w).Encode(map[string]string{"status": "error", "detail": err.Error()})
		return
	}
	_ = json.NewEncoder(w).Encode(c.health.ReadyOK())
}
