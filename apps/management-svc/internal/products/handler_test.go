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
	listEmployees  []repository.Employee
	getEmployee    repository.Employee
	getByEmail     repository.Employee
	addEmployee    repository.AddEmployeeParams
	delEmployee    int32
	updateEmployee repository.UpdateEmployeeParams

	listErr       error
	getErr        error
	getByEmailErr error
	addErr        error
	delErr        error
	updateErr     error
}

func (m *mockService) ListEmployees(ctx context.Context) ([]repository.Employee, error) {
	return m.listEmployees, m.listErr
}

func (m *mockService) GetEmployeeById(ctx context.Context, id int32) (repository.Employee, error) {
	return m.getEmployee, m.getErr
}

func (m *mockService) GetEmployeeByEmail(ctx context.Context, email string) (repository.Employee, error) {
	return m.getByEmail, m.getByEmailErr
}

func (m *mockService) AddEmployee(ctx context.Context, name string, email string, department string) error {
	m.addEmployee = repository.AddEmployeeParams{Name: name, Email: email, Department: department}
	return m.addErr
}

func (m *mockService) DeleteEmployee(ctx context.Context, id int32) error {
	m.delEmployee = id
	return m.delErr
}

func (m *mockService) UpdateEmployee(ctx context.Context, id int32, name string, email string, department string) error {
	m.updateEmployee = repository.UpdateEmployeeParams{ID: id, Name: name, Email: email, Department: department}
	return m.updateErr
}

func TestListEmployeesHandler(t *testing.T) {
	mock := &mockService{
		listEmployees: []repository.Employee{
			{ID: 1, Name: "John Doe", Email: "john@example.com", Department: "Engineering"},
		},
	}
	handler := NewHandler(mock)

	req := httptest.NewRequest(http.MethodGet, "/employees", nil)
	w := httptest.NewRecorder()

	handler.ListEmployeesHandler(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status %d, got %d", http.StatusOK, w.Code)
	}

	var resp []repository.Employee
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}
	if len(resp) != 1 {
		t.Fatalf("expected 1 employee, got %d", len(resp))
	}
	if resp[0].Name != "John Doe" {
		t.Errorf("expected name %q, got %q", "John Doe", resp[0].Name)
	}
}

func TestGetEmployeeByIdHandler(t *testing.T) {
	mock := &mockService{
		getEmployee: repository.Employee{ID: 1, Name: "John Doe", Email: "john@example.com", Department: "Engineering"},
	}
	handler := NewHandler(mock)

	req := httptest.NewRequest(http.MethodGet, "/employees/1", nil)
	w := httptest.NewRecorder()

	handler.GetEmployeeById(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status %d, got %d", http.StatusOK, w.Code)
	}

	var resp repository.Employee
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}
	if resp.ID != 1 {
		t.Errorf("expected ID %d, got %d", 1, resp.ID)
	}
	if resp.Name != "John Doe" {
		t.Errorf("expected name %q, got %q", "John Doe", resp.Name)
	}
}

func TestAddEmployeeHandler(t *testing.T) {
	mock := &mockService{}
	handler := NewHandler(mock)

	body := `{"name":"John Doe","email":"john@example.com","department":"Engineering"}`
	req := httptest.NewRequest(http.MethodPost, "/employees", bytes.NewBufferString(body))
	w := httptest.NewRecorder()

	handler.AddEmployeeHandler(w, req)

	if w.Code != http.StatusCreated {
		t.Errorf("expected status %d, got %d", http.StatusCreated, w.Code)
	}

	var resp repository.AddEmployeeParams
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}
	if resp.Name != "John Doe" {
		t.Errorf("expected name %q, got %q", "John Doe", resp.Name)
	}
	if resp.Email != "john@example.com" {
		t.Errorf("expected email %q, got %q", "john@example.com", resp.Email)
	}
	if resp.Department != "Engineering" {
		t.Errorf("expected department %q, got %q", "Engineering", resp.Department)
	}
}

func TestAddEmployeeHandlerInvalidJSON(t *testing.T) {
	mock := &mockService{}
	handler := NewHandler(mock)

	req := httptest.NewRequest(http.MethodPost, "/employees", bytes.NewBufferString(`{invalid`))
	w := httptest.NewRecorder()

	handler.AddEmployeeHandler(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected status %d, got %d", http.StatusBadRequest, w.Code)
	}
}

func TestAddEmployeeHandlerValidationErrors(t *testing.T) {
	mock := &mockService{}
	handler := NewHandler(mock)

	body := `{"name":"","email":"invalid","department":""}`
	req := httptest.NewRequest(http.MethodPost, "/employees", bytes.NewBufferString(body))
	w := httptest.NewRecorder()

	handler.AddEmployeeHandler(w, req)

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

func TestUpdateEmployeeHandler(t *testing.T) {
	mock := &mockService{}
	handler := NewHandler(mock)

	body := `{"name":"John Updated","email":"john.updated@example.com","department":"Engineering"}`
	req := httptest.NewRequest(http.MethodPut, "/employees/1", bytes.NewBufferString(body))
	w := httptest.NewRecorder()

	handler.UpdateEmployeeHandler(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status %d, got %d", http.StatusOK, w.Code)
	}

	var resp repository.UpdateEmployeeParams
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}
	if resp.ID != 1 {
		t.Errorf("expected ID %d, got %d", 1, resp.ID)
	}
	if resp.Name != "John Updated" {
		t.Errorf("expected name %q, got %q", "John Updated", resp.Name)
	}
}

func TestDeleteEmployeeHandler(t *testing.T) {
	mock := &mockService{}
	handler := NewHandler(mock)

	req := httptest.NewRequest(http.MethodDelete, "/employees/1", nil)
	w := httptest.NewRecorder()

	handler.DeleteEmployeeHandler(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status %d, got %d", http.StatusOK, w.Code)
	}

	var resp map[string]string
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}
	if resp["message"] != "employee deleted successfully" {
		t.Errorf("expected message %q, got %q", "employee deleted successfully", resp["message"])
	}
}
