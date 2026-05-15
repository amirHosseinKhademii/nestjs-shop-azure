-- name: ListProducts :many
SELECT * FROM products;

-- name: ProductById :one
SELECT * FROM products
    WHERE id = $1;

-- name: AddProduct :exec
INSERT INTO products (name, price, quantity) 
VALUES ($1, $2, $3);

-- name: DeleteProduct :exec
DELETE FROM products WHERE id = $1;

-- name: UpdateProduct :exec
UPDATE products
SET name = $2, price = $3, quantity = $4
WHERE id = $1;