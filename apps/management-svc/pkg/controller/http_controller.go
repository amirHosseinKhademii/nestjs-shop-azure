package controller

import (
	"encoding/json"
	"management-svc/pkg/service"
	"net/http"
)

type HTTPController struct {
	metaService   *service.MetaService
	healthService *service.HealthService
}

// constructor
func NewHTTPController(metaSvc *service.MetaService, healthSvc *service.HealthService) *HTTPController {
	return &HTTPController{metaService: metaSvc, healthService: healthSvc}
}

// root is / route handler
func (controller *HTTPController) root(res http.ResponseWriter, _ *http.Request) {
	res.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(res).Encode(controller.metaService.RootInfo())
}

// live is the /health/live root handler
func (controller *HTTPController) live(res http.ResponseWriter, _ *http.Request) {
	res.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(res).Encode(controller.healthService.Live())
}

// ready is /health/ready root handler
func (controller *HTTPController) ready(res http.ResponseWriter, req *http.Request) {
	res.Header().Set("Content-Type", "application/json")
	if err := controller.healthService.Ready(req.Context()); err != nil {
		res.WriteHeader(http.StatusServiceUnavailable)
		_ = json.NewEncoder(res).Encode(map[string]string{"status": "error", "detail": err.Error()})
		return
	}
	_ = json.NewEncoder(res).Encode(controller.healthService.ReadyOK())
}

// Register is what register all the routes in main
func (controller *HTTPController) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /", controller.root)
	mux.HandleFunc("GET /health/live", controller.live)
	mux.HandleFunc("GET /health/ready", controller.ready)
}
