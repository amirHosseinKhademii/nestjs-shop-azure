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

func (h *handler) ListProductHandler(w http.ResponseWriter, r *http.Request) {
	products, err := h.service.ListProducts(r.Context())
	if err != nil {
		log.Print(err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	jsonUtil.Write(w, http.StatusOK, products)
}

func (h *handler) GetProductById(w http.ResponseWriter, r *http.Request) {
	param := chi.URLParam(r, "id")
	parsedId, err := strconv.ParseInt(param, 16, 32)
	var id int32 = int32(parsedId)
	products, err := h.service.GetProductById(r.Context(), id)
	if err != nil {
		log.Print(err)

	}
	jsonUtil.Write(w, http.StatusOK, products)
}

// AddProductRequest represents the validated request body for creating a product
type AddProductRequest struct {
	Name     string `json:"name" validate:"required,min=1,max=255"`
	Price    int32  `json:"price" validate:"required,gt=0"`
	Quantity int32  `json:"quantity" validate:"required,gte=0"`
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

func (h *handler) AddProductHandler(w http.ResponseWriter, r *http.Request) {
	var req AddProductRequest
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
				Message: fieldErrorMessage(err),
			})
		}
		jsonUtil.Write(w, http.StatusUnprocessableEntity, validationErrors)
		return
	}

	err := h.service.AddProduct(r.Context(), req.Name, req.Price, req.Quantity)
	if err != nil {
		log.Print(err)
		jsonUtil.Write(w, http.StatusInternalServerError, map[string]string{"error": "failed to create product"})
		return
	}
	jsonUtil.Write(w, http.StatusCreated, repository.AddProductParams{
		Name:     req.Name,
		Price:    req.Price,
		Quantity: req.Quantity,
	})
}

// fieldErrorMessage returns a human-readable message for each validation tag
func fieldErrorMessage(fe validator.FieldError) string {
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

func (h *handler) DeleteProductHandler(w http.ResponseWriter, r *http.Request) {
	param := chi.URLParam(r, "id")
	parsedId, err := strconv.ParseInt(param, 10, 32)
	if err != nil {
		jsonUtil.Write(w, http.StatusBadRequest, map[string]string{"error": "invalid product ID"})
		return
	}
	id := int32(parsedId)

	err = h.service.DeleteProduct(r.Context(), id)
	if err != nil {
		log.Print(err)
		jsonUtil.Write(w, http.StatusInternalServerError, map[string]string{"error": "failed to delete product"})
		return
	}
	jsonUtil.Write(w, http.StatusOK, map[string]string{"message": "product deleted successfully"})
}

// UpdateProductRequest represents the validated request body for updating a product
type UpdateProductRequest struct {
	Name     string `json:"name" validate:"required,min=1,max=255"`
	Price    int32  `json:"price" validate:"required,gt=0"`
	Quantity int32  `json:"quantity" validate:"required,gte=0"`
}

func (h *handler) UpdateProductHandler(w http.ResponseWriter, r *http.Request) {
	param := chi.URLParam(r, "id")
	parsedId, err := strconv.ParseInt(param, 10, 32)
	if err != nil {
		jsonUtil.Write(w, http.StatusBadRequest, map[string]string{"error": "invalid product ID"})
		return
	}
	id := int32(parsedId)

	var req UpdateProductRequest
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
				Message: fieldErrorMessage(err),
			})
		}
		jsonUtil.Write(w, http.StatusUnprocessableEntity, validationErrors)
		return
	}

	err = h.service.UpdateProduct(r.Context(), id, req.Name, req.Price, req.Quantity)
	if err != nil {
		log.Print(err)
		jsonUtil.Write(w, http.StatusInternalServerError, map[string]string{"error": "failed to update product"})
		return
	}
	jsonUtil.Write(w, http.StatusOK, repository.UpdateProductParams{
		ID:       id,
		Name:     req.Name,
		Price:    req.Price,
		Quantity: req.Quantity,
	})
}
