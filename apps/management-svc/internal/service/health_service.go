package service

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

type HealthService struct {
	pool *pgxpool.Pool
}

func NewHealthService(pool *pgxpool.Pool) *HealthService {
	return &HealthService{pool: pool}
}

func (s *HealthService) Live() LiveStatus {
	return LiveStatus{Status: "ok"}
}

func (s *HealthService) ReadyOK() LiveStatus {
	return LiveStatus{Status: "ok"}
}

func (s *HealthService) Ready(ctx context.Context) error {
	return s.pool.Ping(ctx)
}

type LiveStatus struct {
	Status string `json:"status"`
}
