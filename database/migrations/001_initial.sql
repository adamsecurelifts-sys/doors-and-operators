CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(190) NOT NULL UNIQUE, password_hash VARCHAR(255) NOT NULL,
  contact_name VARCHAR(120) NOT NULL, company_name VARCHAR(160) NOT NULL,
  phone VARCHAR(40) NOT NULL, business_address VARCHAR(255) NOT NULL,
  role ENUM('customer','warehouse','admin') NOT NULL DEFAULT 'customer',
  status ENUM('pending','active','suspended') NOT NULL DEFAULT 'pending',
  credit_terms_approved BOOLEAN NOT NULL DEFAULT FALSE,
  credit_limit DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_users_status_role(status,role)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS products (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  sku VARCHAR(80) NOT NULL UNIQUE, manufacturer_part_number VARCHAR(120) NULL,
  name VARCHAR(180) NOT NULL, category VARCHAR(80) NOT NULL, description TEXT NOT NULL,
  base_price DECIMAL(12,2) NOT NULL, min_order_qty INT UNSIGNED NOT NULL DEFAULT 1,
  active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_products_category(category), FULLTEXT INDEX idx_products_search(name,description,sku)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS warehouses (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, code VARCHAR(40) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL, address VARCHAR(255) NULL, active BOOLEAN NOT NULL DEFAULT TRUE
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS inventory_balances (
  warehouse_id BIGINT UNSIGNED NOT NULL, product_id BIGINT UNSIGNED NOT NULL,
  quantity INT NOT NULL DEFAULT 0, reserved_quantity INT NOT NULL DEFAULT 0,
  PRIMARY KEY(warehouse_id,product_id),
  CONSTRAINT fk_balance_warehouse FOREIGN KEY(warehouse_id) REFERENCES warehouses(id),
  CONSTRAINT fk_balance_product FOREIGN KEY(product_id) REFERENCES products(id),
  CONSTRAINT chk_inventory_nonnegative CHECK(quantity>=0 AND reserved_quantity>=0 AND reserved_quantity<=quantity)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS inventory_movements (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, product_id BIGINT UNSIGNED NOT NULL,
  warehouse_id BIGINT UNSIGNED NOT NULL, quantity_delta INT NOT NULL, movement_type ENUM('receipt','adjustment','reservation','release','shipment') NOT NULL,
  reference VARCHAR(100) NULL, actor_user_id BIGINT UNSIGNED NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_movements_product_date(product_id,created_at),
  FOREIGN KEY(product_id) REFERENCES products(id), FOREIGN KEY(warehouse_id) REFERENCES warehouses(id), FOREIGN KEY(actor_user_id) REFERENCES users(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS price_lists (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, name VARCHAR(120) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'USD', active BOOLEAN NOT NULL DEFAULT TRUE
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS customer_price_lists (
  user_id BIGINT UNSIGNED NOT NULL, price_list_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY(user_id,price_list_id), FOREIGN KEY(user_id) REFERENCES users(id), FOREIGN KEY(price_list_id) REFERENCES price_lists(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS price_list_items (
  price_list_id BIGINT UNSIGNED NOT NULL, product_id BIGINT UNSIGNED NOT NULL,
  unit_price DECIMAL(12,2) NOT NULL, min_quantity INT UNSIGNED NOT NULL DEFAULT 1,
  PRIMARY KEY(price_list_id,product_id,min_quantity), FOREIGN KEY(price_list_id) REFERENCES price_lists(id), FOREIGN KEY(product_id) REFERENCES products(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS orders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, order_number VARCHAR(32) NOT NULL UNIQUE,
  user_id BIGINT UNSIGNED NOT NULL, company_name VARCHAR(160) NOT NULL,
  status ENUM('pending','confirmed','picking','packed','shipped','cancelled') NOT NULL DEFAULT 'pending',
  payment_method ENUM('card','bank_transfer','credit_terms') NOT NULL,
  payment_status ENUM('unconfigured','awaiting_transfer','pending','paid','terms_due','failed') NOT NULL DEFAULT 'unconfigured',
  subtotal DECIMAL(12,2) NOT NULL, shipping DECIMAL(12,2) NOT NULL DEFAULT 0, tax DECIMAL(12,2) NOT NULL DEFAULT 0, total DECIMAL(12,2) NOT NULL,
  shipping_address VARCHAR(255) NOT NULL, fulfillment_notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_orders_status_date(status,created_at), INDEX idx_orders_user_date(user_id,created_at), FOREIGN KEY(user_id) REFERENCES users(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS order_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, order_id BIGINT UNSIGNED NOT NULL,
  product_id BIGINT UNSIGNED NOT NULL, sku_snapshot VARCHAR(80) NOT NULL, name_snapshot VARCHAR(180) NOT NULL,
  quantity INT UNSIGNED NOT NULL, unit_price DECIMAL(12,2) NOT NULL, line_total DECIMAL(12,2) NOT NULL,
  FOREIGN KEY(order_id) REFERENCES orders(id), FOREIGN KEY(product_id) REFERENCES products(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS payment_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, order_id BIGINT UNSIGNED NOT NULL,
  provider VARCHAR(40) NOT NULL, provider_reference VARCHAR(160) NULL, event_type VARCHAR(80) NOT NULL,
  amount DECIMAL(12,2) NULL, payload_json JSON NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(order_id) REFERENCES orders(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(80) NOT NULL PRIMARY KEY, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;
