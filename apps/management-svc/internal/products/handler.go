package products

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"

	repository "shop/internal/adapters/postgresql/sqlc"
	jsonUtil "shop/internal/json"

	"github.com/go-chi/chi/v5"
	"github.com/go-playground/validator/v10"
	"strings"
)

var validate = validator.New()

type handler struct {
	service Service
}

// Constructor
func NewHandler(svc Service) *handler {
	return &handler{
		service: svc,
	}
}

func (h *handler) ListEmployeesHandler(w http.ResponseWriter, r *http.Request) {
	employees, err := h.service.ListEmployees(r.Context())
	if err != nil {
		log.Print(err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	jsonUtil.Write(w, http.StatusOK, employees)
}

func (h *handler) GetEmployeeById(w http.ResponseWriter, r *http.Request) {
	param := chi.URLParam(r, "id")
	if param == "" {
		parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
		if len(parts) >= 2 {
			param = parts[len(parts)-1]
		}
	}
	parsedId, err := strconv.ParseInt(param, 10, 32)
	var id int32 = int32(parsedId)
	employee, err := h.service.GetEmployeeById(r.Context(), id)
	if err != nil {
		log.Print(err)
		jsonUtil.Write(w, http.StatusNotFound, map[string]string{"error": "employee not found"})
		return
	}
	jsonUtil.Write(w, http.StatusOK, employee)
}

func (h *handler) GetEmployeeByEmail(w http.ResponseWriter, r *http.Request) {
	param := chi.URLParam(r, "email")
	employee, err := h.service.GetEmployeeByEmail(r.Context(), param)
	if err != nil {
		log.Print(err)
		jsonUtil.Write(w, http.StatusNotFound, map[string]string{"error": "employee not found"})
		return
	}
	jsonUtil.Write(w, http.StatusOK, employee)
}

// AddEmployeeRequest represents the validated request body for creating an employee
type AddEmployeeRequest struct {
	Name       string `json:"name" validate:"required,min=1,max=255"`
	Email      string `json:"email" validate:"required,email,max=255"`
	Department string `json:"department" validate:"required,min=1,max=100"`
}

// ValidationError represents a single field validation error
type ValidationError struct {
	Field   string `json:"field"`
	Message string `json:"message"`
}

// ValidationErrors represents a collection of validation errors
type ValidationErrors struct {
	Errors []ValidationError `json:"errors"`
}

func (h *handler) AddEmployeeHandler(w http.ResponseWriter, r *http.Request) {
	var req AddEmployeeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonUtil.Write(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON body"})
		return
	}

	// Validate the request body
	if err := validate.Struct(req); err != nil {
		var validationErrors ValidationErrors
		for _, err := range err.(validator.ValidationErrors) {
			validationErrors.Errors = append(validationErrors.Errors, ValidationError{
				Field:   err.Field(),
				Message: h.fieldErrorMessage(err),
			})
		}
		jsonUtil.Write(w, http.StatusUnprocessableEntity, validationErrors)
		return
	}

	err := h.service.AddEmployee(r.Context(), req.Name, req.Email, req.Department)
	if err != nil {
		log.Print(err)
		jsonUtil.Write(w, http.StatusInternalServerError, map[string]string{"error": "failed to create employee"})
		return
	}
	jsonUtil.Write(w, http.StatusCreated, repository.AddEmployeeParams{
		Name:       req.Name,
		Email:      req.Email,
		Department: req.Department,
	})
}

func (h *handler) UpdateEmployeeHandler(w http.ResponseWriter, r *http.Request) {
	// Support direct handler calls in tests where chi URL params may not be set
	// Fallback to extracting the ID from the request URL path if chi.URLParam is empty
	param := chi.URLParam(r, "id")
	if param == "" {
		// Expect path like /employees/{id}
		parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
		if len(parts) >= 2 {
			param = parts[len(parts)-1]
		}
	}

	parsedId, err := strconv.ParseInt(param, 10, 32)
	var id int32 = int32(parsedId)

	var req AddEmployeeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonUtil.Write(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON body"})
		return
	}

	// Validate the request body
	if err := validate.Struct(req); err != nil {
		var validationErrors ValidationErrors
		for _, err := range err.(validator.ValidationErrors) {
			validationErrors.Errors = append(validationErrors.Errors, ValidationError{
				Field:   err.Field(),
				Message: h.fieldErrorMessage(err),
			})
		}
		jsonUtil.Write(w, http.StatusUnprocessableEntity, validationErrors)
		return
	}

	err = h.service.UpdateEmployee(r.Context(), id, req.Name, req.Email, req.Department)
	if err != nil {
		log.Print(err)
		jsonUtil.Write(w, http.StatusInternalServerError, map[string]string{"error": "failed to update employee"})
		return
	}
	jsonUtil.Write(w, http.StatusOK, repository.UpdateEmployeeParams{
		ID:         id,
		Name:       req.Name,
		Email:      req.Email,
		Department: req.Department,
	})
}

func (h *handler) DeleteEmployeeHandler(w http.ResponseWriter, r *http.Request) {
	param := chi.URLParam(r, "id")
	if param == "" {
		parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
		if len(parts) >= 2 {
			param = parts[len(parts)-1]
		}
	}
	parsedId, err := strconv.ParseInt(param, 10, 32)
	var id int32 = int32(parsedId)

	err = h.service.DeleteEmployee(r.Context(), id)
	if err != nil {
		log.Print(err)
		jsonUtil.Write(w, http.StatusInternalServerError, map[string]string{"error": "failed to delete employee"})
		return
	}
	jsonUtil.Write(w, http.StatusOK, map[string]string{"message": "employee deleted successfully"})
}

func (h *handler) fieldErrorMessage(fe validator.FieldError) string {
	switch fe.Tag() {
	case "required":
		return fe.Field() + " is required"
	case "min":
		return fe.Field() + " must be at least " + fe.Param() + " characters"
	case "max":
		return fe.Field() + " must be at most " + fe.Param() + " characters"
	case "gt":
		return fe.Field() + " must be greater than " + fe.Param()
	case "gte":
		return fe.Field() + " must be greater than or equal to " + fe.Param()
	default:
		return fe.Field() + " is invalid"
	}
}
