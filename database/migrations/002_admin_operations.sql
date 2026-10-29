ALTER TABLE order_items ADD COLUMN warehouse_id BIGINT UNSIGNED NULL AFTER product_id;
ALTER TABLE order_items ADD CONSTRAINT fk_order_item_warehouse FOREIGN KEY (warehouse_id) REFERENCES warehouses(id);
