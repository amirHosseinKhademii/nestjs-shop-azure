package products

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	repository "shop/internal/adapters/postgresql/sqlc"
)

// mockService implements products.Service for handler tests.
type mockService struct {
	listProducts []repository.Product
	getProduct   repository.Product
	addProduct   repository.AddProductParams
	delProduct   int32
	updateProduct repository.UpdateProductParams

	listErr  error
	getErr   error
	addErr   error
	delErr   error
	updateErr error
}

func (m *mockService) ListProducts(ctx context.Context) ([]repository.Product, error) {
	return m.listProducts, m.listErr
}

func (m *mockService) GetProductById(ctx context.Context, id int32) (repository.Product, error) {
	return m.getProduct, m.getErr
}

func (m *mockService) AddProduct(ctx context.Context, name string, price int32, quantity int32) error {
	m.addProduct = repository.AddProductParams{Name: name, Price: price, Quantity: quantity}
	return m.addErr
}

func (m *mockService) DeleteProduct(ctx context.Context, id int32) error {
	m.delProduct = id
	return m.delErr
}

func (m *mockService) UpdateProduct(ctx context.Context, id int32, name string, price int32, quantity int32) error {
	m.updateProduct = repository.UpdateProductParams{ID: id, Name: name, Price: price, Quantity: quantity}
	return m.updateErr
}

func TestAddProductHandler(t *testing.T) {
	mock := &mockService{}
	handler := NewHandler(mock)

	body := `{"name":"Widget","price":100,"quantity":10}`
	req := httptest.NewRequest(http.MethodPost, "/products", bytes.NewBufferString(body))
	w := httptest.NewRecorder()

	handler.AddProductHandler(w, req)

	if w.Code != http.StatusCreated {
		t.Errorf("expected status %d, got %d", http.StatusCreated, w.Code)
	}

	var resp repository.AddProductParams
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}
	if resp.Name != "Widget" {
		t.Errorf("expected name %q, got %q", "Widget", resp.Name)
	}
	if resp.Price != 100 {
		t.Errorf("expected price %d, got %d", 100, resp.Price)
	}
	if resp.Quantity != 10 {
		t.Errorf("expected quantity %d, got %d", 10, resp.Quantity)
	}
}

func TestAddProductHandlerInvalidJSON(t *testing.T) {
	mock := &mockService{}
	handler := NewHandler(mock)

	req := httptest.NewRequest(http.MethodPost, "/products", bytes.NewBufferString(`{invalid`))
	w := httptest.NewRecorder()

	handler.AddProductHandler(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected status %d, got %d", http.StatusBadRequest, w.Code)
	}
}

func TestAddProductHandlerValidationErrors(t *testing.T) {
	mock := &mockService{}
	handler := NewHandler(mock)

	body := `{"name":"","price":-1,"quantity":-1}`
	req := httptest.NewRequest(http.MethodPost, "/products", bytes.NewBufferString(body))
	w := httptest.NewRecorder()

	handler.AddProductHandler(w, req)

	if w.Code != http.StatusUnprocessableEntity {
		t.Errorf("expected status %d, got %d", http.StatusUnprocessableEntity, w.Code)
	}

	var resp ValidationErrors
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}
	if len(resp.Errors) == 0 {
		t.Error("expected validation errors, got none")
	}
}
	w := httptest.NewRecorder()

	handler.AddProductHandler(w, req)

	if w.Code \!= http.StatusUnprocessableEntity {
		t.Errorf("expected status %d, got %d", http.StatusUnprocessableEntity, w.Code)
	}

	var resp ValidationErrors
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err \!= nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}
	if len(resp.Errors) == 0 {
		t.Error("expected validation errors, got none")
	}
}
