package service

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

type HealthService struct {
	pool *pgxpool.Pool
}

type LiveStatus struct {
	Status string `json:"status"`
}

// HealthService{pool: pool} builds one HealthService value and sets its pool field to the pointer you passed in (same underlying pool).
// & takes the address of that new HealthService so the return type is *HealthService.

// constructor
func NewHealthService(pool *pgxpool.Pool) *HealthService {
	return &HealthService{pool: pool}
}

// services attached
func (_ *HealthService) Live() LiveStatus {
	return LiveStatus{Status: "ok"}
}

func (_ *HealthService) ReadyOK() LiveStatus {
	return LiveStatus{Status: "ok"}
}

func (service *HealthService) Ready(ctx context.Context) error {
	return service.pool.Ping(ctx)
}
