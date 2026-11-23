-- 029: a vehicle's subcategory (Motorcycle, Scooter, SUV, Pickup, ...) from
-- the vehicle catalog (028), stored as text next to vehicle_type like brand
-- and model are. Existing vehicles stay blank.

ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS subcategory TEXT NOT NULL DEFAULT '';
