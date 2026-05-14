package service

type MetaService struct{}
type RootInfo struct {
	Service   string   `json:"service"`
	Endpoints []string `json:"endpoints"`
}

func NewMetaService() *MetaService {
	return &MetaService{}
}

func (_ *MetaService) RootInfo() RootInfo {
	return RootInfo{
		Service: "management-svc",
		Endpoints: []string{
			"GET /health/live",
			"GET /health/ready",
		},
	}
}
