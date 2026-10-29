CREATE TABLE IF NOT EXISTS product_variants (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  product_id BIGINT UNSIGNED NOT NULL,
  sku VARCHAR(80) NOT NULL UNIQUE,
  label VARCHAR(120) NOT NULL,
  attributes_json JSON NOT NULL,
  price_override DECIMAL(12,2) NULL,
  min_order_qty INT UNSIGNED NOT NULL DEFAULT 1,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_variants_product(product_id,active,sort_order),
  CONSTRAINT fk_variant_product FOREIGN KEY(product_id) REFERENCES products(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS product_media (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  product_id BIGINT UNSIGNED NOT NULL,
  image_url VARCHAR(1000) NOT NULL,
  alt_text VARCHAR(240) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_product_media(product_id,sort_order),
  CONSTRAINT fk_product_media_product FOREIGN KEY(product_id) REFERENCES products(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS product_customization_options (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  product_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  input_type ENUM('select','text','number','checkbox') NOT NULL,
  required BOOLEAN NOT NULL DEFAULT FALSE,
  choices_json JSON NULL,
  price_delta DECIMAL(12,2) NOT NULL DEFAULT 0,
  min_value DECIMAL(12,3) NULL,
  max_value DECIMAL(12,3) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_customization_product(product_id,active,sort_order),
  CONSTRAINT fk_customization_product FOREIGN KEY(product_id) REFERENCES products(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS variant_inventory_balances (
  warehouse_id BIGINT UNSIGNED NOT NULL,
  variant_id BIGINT UNSIGNED NOT NULL,
  quantity INT NOT NULL DEFAULT 0,
  reserved_quantity INT NOT NULL DEFAULT 0,
  PRIMARY KEY(warehouse_id,variant_id),
  CONSTRAINT fk_variant_balance_warehouse FOREIGN KEY(warehouse_id) REFERENCES warehouses(id),
  CONSTRAINT fk_variant_balance_variant FOREIGN KEY(variant_id) REFERENCES product_variants(id),
  CONSTRAINT chk_variant_inventory_nonnegative CHECK(quantity>=0 AND reserved_quantity>=0 AND reserved_quantity<=quantity)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS variant_inventory_movements (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  variant_id BIGINT UNSIGNED NOT NULL,
  warehouse_id BIGINT UNSIGNED NOT NULL,
  quantity_delta INT NOT NULL,
  movement_type ENUM('receipt','adjustment','reservation','release','shipment') NOT NULL,
  reference VARCHAR(100) NULL,
  actor_user_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_variant_movements_date(variant_id,created_at),
  CONSTRAINT fk_variant_movement_variant FOREIGN KEY(variant_id) REFERENCES product_variants(id),
  CONSTRAINT fk_variant_movement_warehouse FOREIGN KEY(warehouse_id) REFERENCES warehouses(id),
  CONSTRAINT fk_variant_movement_actor FOREIGN KEY(actor_user_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS order_item_configurations (
  order_item_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  variant_id BIGINT UNSIGNED NULL,
  customization_json JSON NULL,
  CONSTRAINT fk_order_configuration_item FOREIGN KEY(order_item_id) REFERENCES order_items(id),
  CONSTRAINT fk_order_configuration_variant FOREIGN KEY(variant_id) REFERENCES product_variants(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS order_status_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  order_id BIGINT UNSIGNED NOT NULL,
  from_status VARCHAR(30) NULL,
  to_status VARCHAR(30) NOT NULL,
  note VARCHAR(500) NULL,
  actor_user_id BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_order_history(order_id,created_at),
  CONSTRAINT fk_order_history_order FOREIGN KEY(order_id) REFERENCES orders(id),
  CONSTRAINT fk_order_history_actor FOREIGN KEY(actor_user_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS admin_bootstrap_state (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  completed_at TIMESTAMP NULL DEFAULT NULL
) ENGINE=InnoDB;

INSERT IGNORE INTO admin_bootstrap_state(id,completed_at) VALUES(1,NULL);

CREATE TABLE IF NOT EXISTS admin_login_throttles (
  email_hash CHAR(64) NOT NULL PRIMARY KEY,
  failure_count SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  window_started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  locked_until TIMESTAMP NULL DEFAULT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

