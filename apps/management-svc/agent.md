# Shop API

A Go-based REST API for managing products, built with clean architecture principles using [chi](https://github.com/go-chi/chi) router, [sqlc](https://github.com/sqlc/sqlc) for type-safe SQL queries, and PostgreSQL.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      HTTP Layer                             │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────────┐  │
│  │  chi     │  │   Handler    │  │  Request Validation   │  │
│  │ Router   │→ │ (handler.go) │  │  (validator/v10)      │  │
│  └──────────┘  └──────────────┘  └───────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    Service Layer                            │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Service Interface + Implementation (service.go)     │   │
│  │  - Business logic                                     │   │
│  │  - Decouples HTTP from database                       │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                  Repository Layer (sqlc)                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────────────┐  │
│  │ queries. │  │ models.  │  │ querier.go (interface)   │  │
│  │ sql      │→ │ go       │  │                          │  │
│  └──────────┘  └──────────┘  └──────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                     PostgreSQL                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  migrations/ - Schema definitions & migrations       │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Project Structure

```
.
├── cmd/
│   ├── main.go          # Application entry point
│   └── api.go           # HTTP server setup & routing
├── internal/
│   ├── adapters/
│   │   └── postgresql/
│   │       ├── migrations/      # Database migration files
│   │       └── sqlc/            # sqlc generated code
│   │           ├── models.go    # Generated Go structs from DB schema
│   │           ├── querier.go   # Generated interface for queries
│   │           ├── queries.sql  # SQL queries (you write these)
│   │           └── queries.sql.go # Generated Go code from queries
│   ├── configuration/     # DB connection & config
│   ├── json/              # JSON response utilities
│   └── products/          # Products domain
│       ├── handler.go     # HTTP handlers & request validation
│       └── service.go     # Business logic layer
├── sqlc.yaml              # sqlc configuration
├── go.mod
└── agent.md
```

## Prerequisites

- Go 1.21+
- PostgreSQL database
- [sqlc](https://github.com/sqlc/sqlc) CLI tool
- [golang-migrate](https://github.com/golang-migrate/migrate) (optional, for migrations)

## Quick Start

1. **Set up environment variables**:
   ```bash
   export DATABASE_URL="postgres://user:password@localhost:5432/shop?sslmode=disable"
   ```

2. **Run migrations**:
   ```bash
   migrate -path internal/adapters/postgresql/migrations -database "$DATABASE_URL" up
   ```

3. **Generate Go code from SQL**:
   ```bash
   sqlc generate
   ```

4. **Run the server**:
   ```bash
   go run cmd/main.go
   ```

---

## Working with sqlc

### How sqlc Works

sqlc generates type-safe Go code from your SQL queries. The workflow is:

1. Write SQL queries in `queries.sql`
2. Run `sqlc generate` to generate Go code
3. Use the generated code in your service layer

### Adding a New Query

1. **Open** `internal/adapters/postgresql/sqlc/queries.sql`

2. **Add your query** with the proper annotation:
   ```sql
   -- name: UpdateProduct :exec
   UPDATE products
   SET name = $1, price = $2, quantity = $3
   WHERE id = $4;
   ```

   Query annotations:
   | Annotation | Description |
   |------------|-------------|
   | `:exec` | No return value (INSERT, UPDATE, DELETE) |
   | `:one` | Returns exactly one row (SELECT with WHERE) |
   | `:many` | Returns multiple rows (SELECT without WHERE) |

3. **Generate Go code**:
   ```bash
   sqlc generate
   ```

4. **Use the generated method** in your service:
   ```go
   func (s *svc) UpdateProduct(ctx context.Context, id int32, name string, price int32, quantity int32) error {
       return s.repository.UpdateProduct(ctx, repository.UpdateProductParams{
           ID:       id,
           Name:     name,
           Price:    price,
           Quantity: quantity,
       })
   }
   ```

### sqlc Configuration

The `sqlc.yaml` file configures code generation:

```yaml
version: "2"
sql:
  - engine: "postgresql"
    queries: "./internal/adapters/postgresql/sqlc/queries.sql"
    schema: "./internal/adapters/postgresql/migrations"
    gen:
      go:
        package: "repository"
        out: "./internal/adapters/postgresql/sqlc"
        sql_package: "pgx/v5"
        emit_json_tags: true
        emit_interface: true
```

Key options:
- `emit_interface: true` — generates the `Querier` interface (useful for testing)
- `emit_json_tags: true` — adds JSON tags to generated structs
- `sql_package: "pgx/v5"` — uses pgx as the PostgreSQL driver

---

## Database Migrations

### Creating a New Migration

Using [golang-migrate](https://github.com/golang-migrate/migrate):

```bash
# Create a new migration file
migrate create -ext sql -dir internal/adapters/postgresql/migrations -seq name_of_migration
```

This creates two files:
- `000001_name_of_migration.up.sql` — apply migration
- `000001_name_of_migration.down.sql` — rollback migration

### Example Migration

**Up migration** (`000001_create_products.up.sql`):
```sql
CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    price INT NOT NULL,
    quantity INT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Down migration** (`000001_create_products.down.sql`):
```sql
DROP TABLE IF EXISTS products;
```

### Applying Migrations

```bash
# Apply all pending migrations
migrate -path internal/adapters/postgresql/migrations -database "$DATABASE_URL" up

# Apply one migration at a time
migrate -path internal/adapters/postgresql/migrations -database "$DATABASE_URL" up 1

# Rollback one migration
migrate -path internal/adapters/postgresql/migrations -database "$DATABASE_URL" down 1

# Rollback all migrations
migrate -path internal/adapters/postgresql/migrations -database "$DATABASE_URL" down

# Check migration status
migrate -path internal/adapters/postgresql/migrations -database "$DATABASE_URL" version
```

---

## Adding a New Endpoint

Follow this layered approach:

### 1. Add SQL Query (if needed)
```sql
-- internal/adapters/postgresql/sqlc/queries.sql
-- name: DeleteProduct :exec
DELETE FROM products WHERE id = $1;
```

### 2. Generate Go Code
```bash
sqlc generate
```

### 3. Add Service Method
```go
// internal/products/service.go
type Service interface {
    // ... existing methods
    DeleteProduct(ctx context.Context, id int32) error
}

func (s *svc) DeleteProduct(ctx context.Context, id int32) error {
    return s.repository.DeleteProduct(ctx, id)
}
```

### 4. Add Handler
```go
// internal/products/handler.go
func (h *handler) DeleteProductHandler(w http.ResponseWriter, r *http.Request) {
    id := chi.URLParam(r, "id")
    parsedId, err := strconv.ParseInt(id, 10, 32)
    if err != nil {
        http.Error(w, "invalid ID", http.StatusBadRequest)
        return
    }

    if err := h.service.DeleteProduct(r.Context(), int32(parsedId)); err != nil {
        log.Print(err)
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }

    w.WriteHeader(http.StatusNoContent)
}
```

### 5. Register Route
```go
// cmd/api.go
r.Delete("/products/{id}", productsHandler.DeleteProductHandler)
```

---

## API Endpoints

| Method | Endpoint         | Description          |
|--------|------------------|----------------------|
| GET    | `/products`      | List all products    |
| GET    | `/products/{id}` | Get product by ID    |
| POST   | `/products`      | Create a new product |

---

## Validation

The API uses [go-playground/validator](https://github.com/go-playground/validator) for request body validation.

### Available Validation Tags

| Tag       | Description                          | Example              |
|-----------|--------------------------------------|----------------------|
| `required`| Field must be present and non-empty  | `validate:"required"`|
| `min=n`   | Minimum length/value                 | `validate:"min=1"`   |
| `max=n`   | Maximum length/value                 | `validate:"max=255"` |
| `gt=n`    | Greater than n                       | `validate:"gt=0"`    |
| `gte=n`   | Greater than or equal to n           | `validate:"gte=0"`   |
| `lt=n`    | Less than n                          | `validate:"lt=100"`  |
| `lte=n`   | Less than or equal to n              | `validate:"lte=100"` |

### Example Validation Response

```json
{
  "errors": [
    {
      "field": "Name",
      "message": "Name is required"
    },
    {
      "field": "Price",
      "message": "Price must be greater than 0"
    }
  ]
}
```

---

## Useful Commands

```bash
# Generate SQL types and query methods
sqlc generate

# Run the server
go run cmd/main.go

# Run tests
go test ./...

# Format code
go fmt ./...

# Vet code
go vet ./...

# Tidy dependencies
go mod tidy
```

---

## Environment Variables

| Variable       | Description                    | Default                  |
|----------------|--------------------------------|--------------------------|
| `DATABASE_URL` | PostgreSQL connection string   | Required                 |
