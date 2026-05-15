-- name: ListEmployees :many
SELECT * FROM employees;

-- name: EmployeeById :one
SELECT * FROM employees
    WHERE id = $1;

-- name: EmployeeByEmail :one
SELECT * FROM employees
    WHERE email = $1;

-- name: AddEmployee :exec
INSERT INTO employees (name, email, department) 
VALUES ($1, $2, $3);

-- name: DeleteEmployee :exec
DELETE FROM employees WHERE id = $1;

-- name: UpdateEmployee :exec
UPDATE employees
SET name = $2, email = $3, department = $4
WHERE id = $1;