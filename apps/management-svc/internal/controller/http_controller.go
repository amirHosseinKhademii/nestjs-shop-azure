package controller

import (
	"encoding/json"
	"net/http"

	"management-svc/internal/service"
)

type HTTPController struct {
	metaService   *service.MetaService
	healthService *service.HealthService
}

// constructor
func NewHTTPController(metaSvc *service.MetaService, healthSvc *service.HealthService) *HTTPController {
	return &HTTPController{metaService: metaSvc, healthService: healthSvc}
}

// controller attached
func (controller *HTTPController) root(res http.ResponseWriter, _ *http.Request) {
	res.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(res).Encode(controller.metaService.RootInfo())
}

func (controller *HTTPController) live(res http.ResponseWriter, _ *http.Request) {
	res.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(res).Encode(controller.healthService.Live())
}

func (controller *HTTPController) ready(res http.ResponseWriter, r *http.Request) {
	res.Header().Set("Content-Type", "application/json")
	if err := controller.healthService.Ready(r.Context()); err != nil {
		res.WriteHeader(http.StatusServiceUnavailable)
		_ = json.NewEncoder(res).Encode(map[string]string{"status": "error", "detail": err.Error()})
		return
	}
	_ = json.NewEncoder(res).Encode(controller.healthService.ReadyOK())
}

// router
func (controller *HTTPController) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /", controller.root)
	mux.HandleFunc("GET /health/live", controller.live)
	mux.HandleFunc("GET /health/ready", controller.ready)
}
