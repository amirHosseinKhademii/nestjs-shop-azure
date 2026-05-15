package products

import (
	"context"
	"errors"
	"testing"

	repository "shop/internal/adapters/postgresql/sqlc"
)

// mockQuerier implements repository.Querier for testing.
type mockQuerier struct {
	employees     []repository.Employee
	byID          repository.Employee
	byEmail       repository.Employee
	listErr       error
	getErr        error
	getByEmailErr error
	addErr        error
	delErr        error
	updateErr     error
}

func (m *mockQuerier) ListEmployees(ctx context.Context) ([]repository.Employee, error) {
	return m.employees, m.listErr
}

func (m *mockQuerier) EmployeeById(ctx context.Context, id int32) (repository.Employee, error) {
	return m.byID, m.getErr
}

func (m *mockQuerier) EmployeeByEmail(ctx context.Context, email string) (repository.Employee, error) {
	return m.byEmail, m.getByEmailErr
}

func (m *mockQuerier) AddEmployee(ctx context.Context, arg repository.AddEmployeeParams) error {
	return m.addErr
}

func (m *mockQuerier) DeleteEmployee(ctx context.Context, id int32) error {
	return m.delErr
}

func (m *mockQuerier) UpdateEmployee(ctx context.Context, arg repository.UpdateEmployeeParams) error {
	return m.updateErr
}

func TestListEmployees(t *testing.T) {
	ctx := context.Background()
	expected := []repository.Employee{
		{ID: 1, Name: "John Doe", Email: "john@example.com", Department: "Engineering"},
	}
	svc := NewService(&mockQuerier{employees: expected})

	result, err := svc.ListEmployees(ctx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(result) != len(expected) {
		t.Fatalf("expected %d employees, got %d", len(expected), len(result))
	}
	if result[0].Name != expected[0].Name {
		t.Errorf("expected name %q, got %q", expected[0].Name, result[0].Name)
	}
}

func TestListEmployeesReturnsError(t *testing.T) {
	ctx := context.Background()
	wantErr := errors.New("db error")
	svc := NewService(&mockQuerier{listErr: wantErr})

	_, err := svc.ListEmployees(ctx)
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if err != wantErr {
		t.Errorf("expected %v, got %v", wantErr, err)
	}
}

func TestGetEmployeeById(t *testing.T) {
	ctx := context.Background()
	expected := repository.Employee{ID: 1, Name: "John Doe", Email: "john@example.com", Department: "Engineering"}
	svc := NewService(&mockQuerier{byID: expected})

	result, err := svc.GetEmployeeById(ctx, 1)
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

func TestGetEmployeeByIdReturnsError(t *testing.T) {
	ctx := context.Background()
	wantErr := errors.New("not found")
	svc := NewService(&mockQuerier{getErr: wantErr})

	_, err := svc.GetEmployeeById(ctx, 1)
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if err != wantErr {
		t.Errorf("expected %v, got %v", wantErr, err)
	}
}

func TestGetEmployeeByEmail(t *testing.T) {
	ctx := context.Background()
	expected := repository.Employee{ID: 1, Name: "John Doe", Email: "john@example.com", Department: "Engineering"}
	svc := NewService(&mockQuerier{byEmail: expected})

	result, err := svc.GetEmployeeByEmail(ctx, "john@example.com")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Email != expected.Email {
		t.Errorf("expected email %q, got %q", expected.Email, result.Email)
	}
}

func TestGetEmployeeByEmailReturnsError(t *testing.T) {
	ctx := context.Background()
	wantErr := errors.New("not found")
	svc := NewService(&mockQuerier{getByEmailErr: wantErr})

	_, err := svc.GetEmployeeByEmail(ctx, "john@example.com")
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if err != wantErr {
		t.Errorf("expected %v, got %v", wantErr, err)
	}
}

func TestAddEmployee(t *testing.T) {
	ctx := context.Background()
	svc := NewService(&mockQuerier{})

	err := svc.AddEmployee(ctx, "John Doe", "john@example.com", "Engineering")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestAddEmployeeReturnsError(t *testing.T) {
	ctx := context.Background()
	wantErr := errors.New("insert failed")
	svc := NewService(&mockQuerier{addErr: wantErr})

	err := svc.AddEmployee(ctx, "John Doe", "john@example.com", "Engineering")
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if err != wantErr {
		t.Errorf("expected %v, got %v", wantErr, err)
	}
}

func TestDeleteEmployee(t *testing.T) {
	ctx := context.Background()
	svc := NewService(&mockQuerier{})

	err := svc.DeleteEmployee(ctx, 1)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestDeleteEmployeeReturnsError(t *testing.T) {
	ctx := context.Background()
	wantErr := errors.New("delete failed")
	svc := NewService(&mockQuerier{delErr: wantErr})

	err := svc.DeleteEmployee(ctx, 1)
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if err != wantErr {
		t.Errorf("expected %v, got %v", wantErr, err)
	}
}

func TestUpdateEmployee(t *testing.T) {
	ctx := context.Background()
	svc := NewService(&mockQuerier{})

	err := svc.UpdateEmployee(ctx, 1, "John Updated", "john.updated@example.com", "Engineering")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestUpdateEmployeeReturnsError(t *testing.T) {
	ctx := context.Background()
	wantErr := errors.New("update failed")
	svc := NewService(&mockQuerier{updateErr: wantErr})

	err := svc.UpdateEmployee(ctx, 1, "John Updated", "john.updated@example.com", "Engineering")
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if err != wantErr {
		t.Errorf("expected %v, got %v", wantErr, err)
	}
}
