-- Create tables
CREATE TABLE customers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    city VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    stock INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    customer_id INT REFERENCES customers(id),
    order_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(50) NOT NULL,
    total_amount DECIMAL(10, 2) NOT NULL
);

CREATE TABLE order_items (
    id SERIAL PRIMARY KEY,
    order_id INT REFERENCES orders(id),
    product_id INT REFERENCES products(id),
    quantity INT NOT NULL,
    unit_price DECIMAL(10, 2) NOT NULL
);

CREATE TABLE payments (
    id SERIAL PRIMARY KEY,
    order_id INT REFERENCES orders(id),
    payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    amount DECIMAL(10, 2) NOT NULL,
    payment_method VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL
);

-- Insert realistic sample data

INSERT INTO customers (name, email, city) VALUES 
('Alice Johnson', 'alice@example.com', 'New York'),
('Bob Smith', 'bob@example.com', 'Los Angeles'),
('Charlie Brown', 'charlie@example.com', 'Chicago'),
('Diana Prince', 'diana@example.com', 'Seattle'),
('Evan Wright', 'evan@example.com', 'Austin'),
('Fiona Gallagher', 'fiona@example.com', 'Chicago'),
('George Miller', 'george@example.com', 'New York');

INSERT INTO products (name, category, price, stock) VALUES 
('Laptop Pro', 'Electronics', 1200.00, 50),
('Wireless Mouse', 'Accessories', 25.00, 200),
('Mechanical Keyboard', 'Accessories', 85.00, 150),
('Monitor 27"', 'Electronics', 300.00, 80),
('Ergonomic Chair', 'Furniture', 250.00, 40),
('Standing Desk', 'Furniture', 400.00, 20),
('USB-C Hub', 'Accessories', 45.00, 300);

INSERT INTO orders (customer_id, order_date, status, total_amount) VALUES 
(1, '2023-01-15 10:00:00', 'Completed', 1225.00),
(2, '2023-02-20 14:30:00', 'Completed', 385.00),
(3, '2023-03-05 09:15:00', 'Completed', 250.00),
(1, '2023-04-10 11:45:00', 'Completed', 300.00),
(4, '2023-05-12 16:20:00', 'Completed', 445.00),
(5, '2023-06-18 13:10:00', 'Pending', 1200.00),
(2, '2023-07-22 15:00:00', 'Completed', 85.00);

INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES 
(1, 1, 1, 1200.00),
(1, 2, 1, 25.00),
(2, 4, 1, 300.00),
(2, 3, 1, 85.00),
(3, 5, 1, 250.00),
(4, 4, 1, 300.00),
(5, 6, 1, 400.00),
(5, 7, 1, 45.00),
(6, 1, 1, 1200.00),
(7, 3, 1, 85.00);

INSERT INTO payments (order_id, payment_date, amount, payment_method, status) VALUES 
(1, '2023-01-15 10:05:00', 1225.00, 'Credit Card', 'Completed'),
(2, '2023-02-20 14:35:00', 385.00, 'PayPal', 'Completed'),
(3, '2023-03-05 09:20:00', 250.00, 'Credit Card', 'Completed'),
(4, '2023-04-10 11:50:00', 300.00, 'Debit Card', 'Completed'),
(5, '2023-05-12 16:25:00', 445.00, 'Credit Card', 'Completed'),
(6, '2023-06-18 13:10:00', 1200.00, 'Bank Transfer', 'Pending'),
(7, '2023-07-22 15:05:00', 85.00, 'PayPal', 'Completed');
