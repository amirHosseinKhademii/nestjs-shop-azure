package products

import (
	"context"
	"errors"
	"testing"

	repository "shop/internal/adapters/postgresql/sqlc"
)

// mockQuerier implements repository.Querier for testing.
type mockQuerier struct {
	products  []repository.Product
	byID      repository.Product
	listErr   error
	getErr    error
	addErr    error
	delErr    error
	updateErr error
}

func (m *mockQuerier) ListProducts(ctx context.Context) ([]repository.Product, error) {
	return m.products, m.listErr
}

func (m *mockQuerier) ProductById(ctx context.Context, id int32) (repository.Product, error) {
	return m.byID, m.getErr
}

func (m *mockQuerier) AddProduct(ctx context.Context, arg repository.AddProductParams) error {
	return m.addErr
}

func (m *mockQuerier) DeleteProduct(ctx context.Context, id int32) error {
	return m.delErr
}

func (m *mockQuerier) UpdateProduct(ctx context.Context, arg repository.UpdateProductParams) error {
	return m.updateErr
}

func TestListProducts(t *testing.T) {
	ctx := context.Background()
	expected := []repository.Product{
		{ID: 1, Name: "Widget", Price: 100, Quantity: 10},
	}
	svc := NewService(&mockQuerier{products: expected})

	result, err := svc.ListProducts(ctx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(result) != len(expected) {
		t.Fatalf("expected %d products, got %d", len(expected), len(result))
	}
	if result[0].Name != expected[0].Name {
		t.Errorf("expected name %q, got %q", expected[0].Name, result[0].Name)
	}
}

func TestListProductsReturnsError(t *testing.T) {
	ctx := context.Background()
	wantErr := errors.New("db error")
	svc := NewService(&mockQuerier{listErr: wantErr})

	_, err := svc.ListProducts(ctx)
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if err != wantErr {
		t.Errorf("expected %v, got %v", wantErr, err)
	}
}

func TestGetProductById(t *testing.T) {
	ctx := context.Background()
	expected := repository.Product{ID: 1, Name: "Widget", Price: 100, Quantity: 10}
	svc := NewService(&mockQuerier{byID: expected})

	result, err := svc.GetProductById(ctx, 1)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.ID != expected.ID {
		t.Errorf("expected ID %d, got %d", expected.ID, result.ID)
	}
	if result.Name != expected.Name {
		t.Errorf("expected name %q, got %q", expected.Name, result.Name)
	}
}

func TestGetProductByIdReturnsError(t *testing.T) {
	ctx := context.Background()
	wantErr := errors.New("not found")
	svc := NewService(&mockQuerier{getErr: wantErr})

	_, err := svc.GetProductById(ctx, 1)
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if err \!= wantErr {
		t.Errorf("expected %v, got %v", wantErr, err)
	}
}

func TestAddProduct(t *testing.T) {
	ctx := context.Background()
	svc := NewService(&mockQuerier{})

	err := svc.AddProduct(ctx, "Widget", 100, 10)
	if err \!= nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestAddProductReturnsError(t *testing.T) {
	ctx := context.Background()
	wantErr := errors.New("insert failed")
	svc := NewService(&mockQuerier{addErr: wantErr})

	err := svc.AddProduct(ctx, "Widget", 100, 10)
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if err \!= wantErr {
		t.Errorf("expected %v, got %v", wantErr, err)
	}
}

func TestDeleteProduct(t *testing.T) {
	ctx := context.Background()
	svc := NewService(&mockQuerier{})

	err := svc.DeleteProduct(ctx, 1)
	if err \!= nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestDeleteProductReturnsError(t *testing.T) {
	ctx := context.Background()
	wantErr := errors.New("delete failed")
	svc := NewService(&mockQuerier{delErr: wantErr})

	err := svc.DeleteProduct(ctx, 1)
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if err \!= wantErr {
		t.Errorf("expected %v, got %v", wantErr, err)
	}
}

func TestUpdateProduct(t *testing.T) {
	ctx := context.Background()
	svc := NewService(&mockQuerier{})

	err := svc.UpdateProduct(ctx, 1, "Updated Widget", 200, 20)
	if err \!= nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestUpdateProductReturnsError(t *testing.T) {
	ctx := context.Background()
	wantErr := errors.New("update failed")
	svc := NewService(&mockQuerier{updateErr: wantErr})

	err := svc.UpdateProduct(ctx, 1, "Updated Widget", 200, 20)
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if err \!= wantErr {
		t.Errorf("expected %v, got %v", wantErr, err)
	}
}
