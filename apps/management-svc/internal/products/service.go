package products

import (
	"context"
	repository "shop/internal/adapters/postgresql/sqlc"
)

type Service interface {
	ListEmployees(ctx context.Context) ([]repository.Employee, error)
	GetEmployeeById(ctx context.Context, id int32) (repository.Employee, error)
	GetEmployeeByEmail(ctx context.Context, email string) (repository.Employee, error)
	AddEmployee(ctx context.Context, name string, email string, department string) error
	DeleteEmployee(ctx context.Context, id int32) error
	UpdateEmployee(ctx context.Context, id int32, name string, email string, department string) error
}

type svc struct {
	repository repository.Querier
}

// Constructor
func NewService(repository repository.Querier) Service {
	return &svc{repository}
}

func (s *svc) ListEmployees(ctx context.Context) ([]repository.Employee, error) {
	return s.repository.ListEmployees(ctx)
}

func (s *svc) GetEmployeeById(ctx context.Context, id int32) (repository.Employee, error) {
	return s.repository.EmployeeById(ctx, id)
}

func (s *svc) GetEmployeeByEmail(ctx context.Context, email string) (repository.Employee, error) {
	return s.repository.EmployeeByEmail(ctx, email)
}

func (s *svc) AddEmployee(ctx context.Context, name string, email string, department string) error {
	return s.repository.AddEmployee(ctx, repository.AddEmployeeParams{
		Name:       name,
		Email:      email,
		Department: department,
	})
}

func (s *svc) DeleteEmployee(ctx context.Context, id int32) error {
	return s.repository.DeleteEmployee(ctx, id)
}

func (s *svc) UpdateEmployee(ctx context.Context, id int32, name string, email string, department string) error {
	return s.repository.UpdateEmployee(ctx, repository.UpdateEmployeeParams{
		ID:         id,
		Name:       name,
		Email:      email,
		Department: department,
	})
}
