CREATE TABLE images (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp', 'image/avif')),
  data BLOB NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 600000),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (business_id) REFERENCES businesses(id)
);

ALTER TABLE products ADD COLUMN image_id TEXT REFERENCES images(id);

CREATE INDEX idx_images_business ON images(business_id, created_at DESC);
CREATE INDEX idx_products_image ON products(business_id, image_id);
