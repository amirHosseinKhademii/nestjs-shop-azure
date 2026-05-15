package products

import (
	"context"
	repository "shop/internal/adapters/postgresql/sqlc"
)

type Service interface {
	ListProducts(ctx context.Context) ([]repository.Product, error)
	GetProductById(ctx context.Context, id int32) (repository.Product, error)
	AddProduct(ctx context.Context, name string, price int32, quantity int32) error
	DeleteProduct(ctx context.Context, id int32) error
	UpdateProduct(ctx context.Context, id int32, name string, price int32, quantity int32) error
}

type svc struct {
	repository repository.Querier
}

// Constructor
func NewService(repository repository.Querier) Service {
	return &svc{repository}
}

func (s *svc) ListProducts(ctx context.Context) ([]repository.Product, error) {
	return s.repository.ListProducts(ctx)
}

func (s *svc) GetProductById(ctx context.Context, id int32) (repository.Product, error) {
	return s.repository.ProductById(ctx, id)
}

func (s *svc) AddProduct(ctx context.Context, name string, price int32, quantity int32) error {
	return s.repository.AddProduct(ctx, repository.AddProductParams{
		Name:     name,
		Price:    price,
		Quantity: quantity,
	})
}

func (s *svc) DeleteProduct(ctx context.Context, id int32) error {
	return s.repository.DeleteProduct(ctx, id)
}

func (s *svc) UpdateProduct(ctx context.Context, id int32, name string, price int32, quantity int32) error {
	return s.repository.UpdateProduct(ctx, repository.UpdateProductParams{
		ID:       id,
		Name:     name,
		Price:    price,
		Quantity: quantity,
	})
}
