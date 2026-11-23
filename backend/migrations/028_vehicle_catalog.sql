-- 028: vehicle catalog — Category -> Subcategory -> Brand -> Model.
--
-- One master list owned by the super admin (rows with tenant_id NULL) that
-- every lender sees. A lender's admin can hide parts of it for their own
-- staff (vehicle_catalog_hidden) and add brands/models of their own
-- (rows with tenant_id = that lender, seen by that lender only).
--
-- Loans keep storing plain text in vehicles.vehicle_type / brand / model, so
-- nothing here changes existing records. The first three category names are
-- exactly the old "Two Wheeler" / "Three Wheeler" / "Four Wheeler" values.
--
-- Seeded from the "Logo model and vehicles brand and model list" document.
-- Electric is a per-model flag (is_ev), not a subcategory. Agricultural and
-- the rest of Passenger Commercial come later.

CREATE TABLE vehicle_categories (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX vehicle_categories_name_key ON vehicle_categories (lower(name));

CREATE TABLE vehicle_subcategories (
  id           INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  category_id  INTEGER NOT NULL REFERENCES vehicle_categories (id),
  name         TEXT NOT NULL,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  active       BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- lets vehicle_models check its subcategory belongs to its category
  UNIQUE (id, category_id)
);
CREATE UNIQUE INDEX vehicle_subcategories_name_key ON vehicle_subcategories (category_id, lower(name));

-- tenant_id NULL = master brand; set = a brand one lender added for itself.
CREATE TABLE vehicle_makes (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id   INTEGER REFERENCES tenants (id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX vehicle_makes_master_name_key ON vehicle_makes (lower(name)) WHERE tenant_id IS NULL;
CREATE UNIQUE INDEX vehicle_makes_tenant_name_key ON vehicle_makes (tenant_id, lower(name)) WHERE tenant_id IS NOT NULL;

-- tenant_id NULL = master model; set = a model one lender added for itself
-- (it may sit under a master brand or under that lender's own brand).
CREATE TABLE vehicle_models (
  id              INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id       INTEGER REFERENCES tenants (id) ON DELETE CASCADE,
  make_id         INTEGER NOT NULL REFERENCES vehicle_makes (id),
  category_id     INTEGER NOT NULL REFERENCES vehicle_categories (id),
  subcategory_id  INTEGER,
  name            TEXT NOT NULL,
  is_ev           BOOLEAN NOT NULL DEFAULT false,
  -- no longer sold new, still financed as a used vehicle
  discontinued    BOOLEAN NOT NULL DEFAULT false,
  active          BOOLEAN NOT NULL DEFAULT true,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_by      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (subcategory_id, category_id) REFERENCES vehicle_subcategories (id, category_id)
);
CREATE UNIQUE INDEX vehicle_models_master_name_key
  ON vehicle_models (make_id, category_id, lower(name)) WHERE tenant_id IS NULL;
CREATE UNIQUE INDEX vehicle_models_tenant_name_key
  ON vehicle_models (tenant_id, make_id, category_id, lower(name)) WHERE tenant_id IS NOT NULL;
CREATE INDEX vehicle_models_tenant_idx ON vehicle_models (tenant_id);

-- What a lender's admin switched off for their own staff. ref_id points at
-- vehicle_categories / vehicle_subcategories / vehicle_makes / vehicle_models
-- by kind. Hiding a category or brand hides everything under it.
CREATE TABLE vehicle_catalog_hidden (
  tenant_id   INTEGER NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('category', 'subcategory', 'make', 'model')),
  ref_id      INTEGER NOT NULL,
  hidden_by   TEXT,
  hidden_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, kind, ref_id)
);

-- Seed: categories and subcategories -----------------------------------------

INSERT INTO vehicle_categories (name, sort_order) VALUES
  ('Two Wheeler', 1),
  ('Three Wheeler', 2),
  ('Four Wheeler', 3),
  ('Commercial Vehicle', 4),
  ('Passenger Commercial', 5);

INSERT INTO vehicle_subcategories (category_id, name, sort_order)
SELECT c.id, s.name, s.sort_order
  FROM (VALUES
    ('Two Wheeler', 'Motorcycle', 1),
    ('Two Wheeler', 'Scooter', 2),
    ('Two Wheeler', 'Moped', 3),
    ('Three Wheeler', 'Passenger Auto', 1),
    ('Three Wheeler', 'Goods Carrier', 2),
    ('Three Wheeler', 'E-Rickshaw', 3),
    ('Four Wheeler', 'Hatchback', 1),
    ('Four Wheeler', 'Sedan', 2),
    ('Four Wheeler', 'SUV', 3),
    ('Four Wheeler', 'MUV', 4),
    ('Four Wheeler', 'Van', 5),
    ('Commercial Vehicle', 'LCV', 1),
    ('Commercial Vehicle', 'Pickup', 2),
    ('Commercial Vehicle', 'Mini Truck', 3),
    ('Commercial Vehicle', 'Medium Truck', 4),
    ('Commercial Vehicle', 'Heavy Truck', 5),
    ('Passenger Commercial', 'Taxi', 1),
    ('Passenger Commercial', 'Maxi Cab', 2),
    ('Passenger Commercial', 'Bus', 3)
  ) AS s (category, name, sort_order)
  JOIN vehicle_categories c ON c.name = s.category;

-- Seed: master models (category, subcategory, brand, model, is_ev, discontinued).
-- Row order is the document's order and becomes sort_order.

CREATE TEMP TABLE seed_vehicle_models (
  category     TEXT,
  subcategory  TEXT,
  make         TEXT,
  model        TEXT,
  is_ev        BOOLEAN,
  discontinued BOOLEAN,
  seq          INTEGER GENERATED ALWAYS AS IDENTITY
) ON COMMIT DROP;

INSERT INTO seed_vehicle_models (category, subcategory, make, model, is_ev, discontinued) VALUES
  -- Two Wheeler
  ('Two Wheeler', 'Motorcycle', 'Hero', 'Splendor Plus', false, false),
  ('Two Wheeler', 'Motorcycle', 'Hero', 'HF Deluxe', false, false),
  ('Two Wheeler', 'Motorcycle', 'Hero', 'Passion Plus', false, false),
  ('Two Wheeler', 'Motorcycle', 'Hero', 'Glamour', false, false),
  ('Two Wheeler', 'Motorcycle', 'Hero', 'Xtreme 125R', false, false),
  ('Two Wheeler', 'Motorcycle', 'Hero', 'Xpulse 200 4V', false, false),
  ('Two Wheeler', 'Motorcycle', 'Hero', 'Karizma XMR', false, false),
  ('Two Wheeler', 'Scooter', 'Hero', 'Vida V1', true, false),
  ('Two Wheeler', 'Scooter', 'Hero', 'Vida V2', true, false),
  ('Two Wheeler', 'Scooter', 'Honda', 'Activa 6G', false, false),
  ('Two Wheeler', 'Scooter', 'Honda', 'Activa 125', false, false),
  ('Two Wheeler', 'Scooter', 'Honda', 'Dio', false, false),
  ('Two Wheeler', 'Motorcycle', 'Honda', 'Shine 100', false, false),
  ('Two Wheeler', 'Motorcycle', 'Honda', 'Shine 125', false, false),
  ('Two Wheeler', 'Motorcycle', 'Honda', 'SP 125', false, false),
  ('Two Wheeler', 'Motorcycle', 'Honda', 'Unicorn', false, false),
  ('Two Wheeler', 'Motorcycle', 'Honda', 'Hornet 2.0', false, false),
  ('Two Wheeler', 'Scooter', 'TVS', 'Jupiter', false, false),
  ('Two Wheeler', 'Scooter', 'TVS', 'Ntorq 125', false, false),
  ('Two Wheeler', 'Motorcycle', 'TVS', 'Radeon', false, false),
  ('Two Wheeler', 'Motorcycle', 'TVS', 'Sport', false, false),
  ('Two Wheeler', 'Motorcycle', 'TVS', 'Star City Plus', false, false),
  ('Two Wheeler', 'Motorcycle', 'TVS', 'Raider 125', false, false),
  ('Two Wheeler', 'Motorcycle', 'TVS', 'Apache RTR 160', false, false),
  ('Two Wheeler', 'Motorcycle', 'TVS', 'Apache RTR 200 4V', false, false),
  ('Two Wheeler', 'Motorcycle', 'TVS', 'Ronin', false, false),
  ('Two Wheeler', 'Scooter', 'TVS', 'iQube', true, false),
  ('Two Wheeler', 'Motorcycle', 'Bajaj', 'Pulsar 125', false, false),
  ('Two Wheeler', 'Motorcycle', 'Bajaj', 'Pulsar 150', false, false),
  ('Two Wheeler', 'Motorcycle', 'Bajaj', 'Pulsar N160', false, false),
  ('Two Wheeler', 'Motorcycle', 'Bajaj', 'Pulsar NS200', false, false),
  ('Two Wheeler', 'Motorcycle', 'Bajaj', 'Dominar 250', false, false),
  ('Two Wheeler', 'Motorcycle', 'Bajaj', 'Dominar 400', false, false),
  ('Two Wheeler', 'Motorcycle', 'Bajaj', 'Platina 100', false, false),
  ('Two Wheeler', 'Motorcycle', 'Bajaj', 'CT 110X', false, false),
  ('Two Wheeler', 'Scooter', 'Bajaj', 'Chetak', true, false),
  ('Two Wheeler', 'Motorcycle', 'Royal Enfield', 'Classic 350', false, false),
  ('Two Wheeler', 'Motorcycle', 'Royal Enfield', 'Bullet 350', false, false),
  ('Two Wheeler', 'Motorcycle', 'Royal Enfield', 'Hunter 350', false, false),
  ('Two Wheeler', 'Motorcycle', 'Royal Enfield', 'Meteor 350', false, false),
  ('Two Wheeler', 'Motorcycle', 'Royal Enfield', 'Himalayan 450', false, false),
  ('Two Wheeler', 'Motorcycle', 'Royal Enfield', 'Guerrilla 450', false, false),
  ('Two Wheeler', 'Motorcycle', 'Royal Enfield', 'Interceptor 650', false, false),
  ('Two Wheeler', 'Motorcycle', 'Royal Enfield', 'Continental GT 650', false, false),
  ('Two Wheeler', 'Motorcycle', 'Yamaha', 'FZ-S', false, false),
  ('Two Wheeler', 'Motorcycle', 'Yamaha', 'FZ-X', false, false),
  ('Two Wheeler', 'Motorcycle', 'Yamaha', 'MT-15', false, false),
  ('Two Wheeler', 'Motorcycle', 'Yamaha', 'R15', false, false),
  ('Two Wheeler', 'Scooter', 'Yamaha', 'Ray ZR', false, false),
  ('Two Wheeler', 'Scooter', 'Yamaha', 'Fascino', false, false),
  ('Two Wheeler', 'Scooter', 'Yamaha', 'Aerox 155', false, false),
  ('Two Wheeler', 'Scooter', 'Suzuki', 'Access 125', false, false),
  ('Two Wheeler', 'Scooter', 'Suzuki', 'Burgman Street', false, false),
  ('Two Wheeler', 'Scooter', 'Suzuki', 'Avenis', false, false),
  ('Two Wheeler', 'Motorcycle', 'Suzuki', 'Gixxer', false, false),
  ('Two Wheeler', 'Motorcycle', 'Suzuki', 'Gixxer SF', false, false),
  ('Two Wheeler', 'Motorcycle', 'Suzuki', 'V-Strom SX', false, false),
  ('Two Wheeler', 'Scooter', 'Ather', 'Rizta', true, false),
  ('Two Wheeler', 'Scooter', 'Ather', '450X', true, false),
  ('Two Wheeler', 'Scooter', 'Ather', '450S', true, false),
  ('Two Wheeler', 'Scooter', 'Ola Electric', 'S1 X', true, false),
  ('Two Wheeler', 'Scooter', 'Ola Electric', 'S1 Pro', true, false),
  ('Two Wheeler', 'Scooter', 'Ola Electric', 'S1 Air', true, false),
  -- Listed with Omega Seiki's three-wheelers in the document; it is an electric scooter.
  ('Two Wheeler', 'Scooter', 'Omega Seiki Mobility', 'Sharq', true, false),

  -- Three Wheeler
  ('Three Wheeler', 'Passenger Auto', 'Bajaj', 'RE', false, false),
  ('Three Wheeler', 'Goods Carrier', 'Bajaj', 'Maxima C', false, false),
  ('Three Wheeler', 'Passenger Auto', 'Bajaj', 'Maxima Z', false, false),
  ('Three Wheeler', 'Goods Carrier', 'Bajaj', 'Maxima XL Cargo', false, false),
  ('Three Wheeler', 'Passenger Auto', 'Piaggio', 'Ape Auto', false, false),
  ('Three Wheeler', 'Goods Carrier', 'Piaggio', 'Ape Xtra', false, false),
  ('Three Wheeler', 'Passenger Auto', 'Piaggio', 'Ape E-City', true, false),
  ('Three Wheeler', 'Goods Carrier', 'Piaggio', 'Ape E-Xtra', true, false),
  ('Three Wheeler', 'Goods Carrier', 'Piaggio', 'Ape Xtra LDX', false, false),
  ('Three Wheeler', 'Passenger Auto', 'Mahindra', 'Alfa', false, false),
  ('Three Wheeler', 'Goods Carrier', 'Mahindra', 'Alfa Plus', false, false),
  ('Three Wheeler', 'Passenger Auto', 'Mahindra', 'Treo', true, false),
  ('Three Wheeler', 'E-Rickshaw', 'Mahindra', 'Treo Yaari', true, false),
  ('Three Wheeler', 'Goods Carrier', 'Mahindra', 'Treo Zor', true, false),
  ('Three Wheeler', 'Goods Carrier', 'Mahindra', 'Zor Grand', true, false),
  ('Three Wheeler', 'Passenger Auto', 'TVS', 'King Deluxe', false, false),
  ('Three Wheeler', 'Passenger Auto', 'TVS', 'King Duramax', false, false),
  ('Three Wheeler', 'Passenger Auto', 'TVS', 'King EV Max', true, false),
  ('Three Wheeler', 'Passenger Auto', 'Atul Auto', 'Atul Gem', false, false),
  ('Three Wheeler', 'E-Rickshaw', 'Atul Auto', 'Atul Elite', true, false),
  ('Three Wheeler', 'Passenger Auto', 'Atul Auto', 'Atul Rik', false, false),
  ('Three Wheeler', 'Goods Carrier', 'Euler Motors', 'HiLoad EV', true, false),
  ('Three Wheeler', 'Goods Carrier', 'Omega Seiki Mobility', 'Rage+', true, false),
  ('Three Wheeler', 'Passenger Auto', 'Omega Seiki Mobility', 'Stream', true, false),
  ('Three Wheeler', 'E-Rickshaw', 'YC Electric', 'Yatri', true, false),
  ('Three Wheeler', 'E-Rickshaw', 'YC Electric', 'Yatri Super', true, false),
  ('Three Wheeler', 'E-Rickshaw', 'YC Electric', 'Yatri Deluxe', true, false),

  -- Four Wheeler
  ('Four Wheeler', 'Hatchback', 'Maruti Suzuki', 'Alto K10', false, false),
  ('Four Wheeler', 'Hatchback', 'Maruti Suzuki', 'S-Presso', false, false),
  ('Four Wheeler', 'Hatchback', 'Maruti Suzuki', 'Celerio', false, false),
  ('Four Wheeler', 'Hatchback', 'Maruti Suzuki', 'Wagon R', false, false),
  ('Four Wheeler', 'Hatchback', 'Maruti Suzuki', 'Swift', false, false),
  ('Four Wheeler', 'Sedan', 'Maruti Suzuki', 'Dzire', false, false),
  ('Four Wheeler', 'Hatchback', 'Maruti Suzuki', 'Baleno', false, false),
  ('Four Wheeler', 'SUV', 'Maruti Suzuki', 'Fronx', false, false),
  ('Four Wheeler', 'SUV', 'Maruti Suzuki', 'Brezza', false, false),
  ('Four Wheeler', 'SUV', 'Maruti Suzuki', 'Grand Vitara', false, false),
  ('Four Wheeler', 'MUV', 'Maruti Suzuki', 'Ertiga', false, false),
  ('Four Wheeler', 'MUV', 'Maruti Suzuki', 'XL6', false, false),
  ('Four Wheeler', 'Van', 'Maruti Suzuki', 'Eeco', false, false),
  ('Four Wheeler', 'SUV', 'Maruti Suzuki', 'Jimny', false, false),
  ('Four Wheeler', 'MUV', 'Maruti Suzuki', 'Invicto', false, false),
  ('Four Wheeler', 'Hatchback', 'Hyundai', 'Grand i10 Nios', false, false),
  ('Four Wheeler', 'Sedan', 'Hyundai', 'Aura', false, false),
  ('Four Wheeler', 'Hatchback', 'Hyundai', 'i20', false, false),
  ('Four Wheeler', 'Hatchback', 'Hyundai', 'i20 N Line', false, false),
  ('Four Wheeler', 'SUV', 'Hyundai', 'Exter', false, false),
  ('Four Wheeler', 'SUV', 'Hyundai', 'Venue', false, false),
  ('Four Wheeler', 'SUV', 'Hyundai', 'Venue N Line', false, false),
  ('Four Wheeler', 'Sedan', 'Hyundai', 'Verna', false, false),
  ('Four Wheeler', 'SUV', 'Hyundai', 'Creta', false, false),
  ('Four Wheeler', 'SUV', 'Hyundai', 'Alcazar', false, false),
  ('Four Wheeler', 'SUV', 'Hyundai', 'Tucson', false, false),
  ('Four Wheeler', 'SUV', 'Hyundai', 'Ioniq 5', true, false),
  ('Four Wheeler', 'Hatchback', 'Tata Motors', 'Tiago', false, false),
  ('Four Wheeler', 'Sedan', 'Tata Motors', 'Tigor', false, false),
  ('Four Wheeler', 'Hatchback', 'Tata Motors', 'Altroz', false, false),
  ('Four Wheeler', 'SUV', 'Tata Motors', 'Punch', false, false),
  ('Four Wheeler', 'SUV', 'Tata Motors', 'Nexon', false, false),
  ('Four Wheeler', 'SUV', 'Tata Motors', 'Curvv', false, false),
  ('Four Wheeler', 'SUV', 'Tata Motors', 'Harrier', false, false),
  ('Four Wheeler', 'SUV', 'Tata Motors', 'Safari', false, false),
  ('Four Wheeler', 'Hatchback', 'Tata Motors', 'Tiago EV', true, false),
  ('Four Wheeler', 'SUV', 'Tata Motors', 'Punch EV', true, false),
  ('Four Wheeler', 'SUV', 'Tata Motors', 'Nexon EV', true, false),
  ('Four Wheeler', 'SUV', 'Tata Motors', 'Curvv EV', true, false),
  ('Four Wheeler', 'SUV', 'Mahindra', 'Bolero', false, false),
  ('Four Wheeler', 'SUV', 'Mahindra', 'Bolero Neo', false, false),
  ('Four Wheeler', 'SUV', 'Mahindra', 'Thar', false, false),
  ('Four Wheeler', 'SUV', 'Mahindra', 'Thar Roxx', false, false),
  ('Four Wheeler', 'SUV', 'Mahindra', 'Scorpio Classic', false, false),
  ('Four Wheeler', 'SUV', 'Mahindra', 'Scorpio-N', false, false),
  ('Four Wheeler', 'SUV', 'Mahindra', 'XUV 3XO', false, false),
  ('Four Wheeler', 'SUV', 'Mahindra', 'XUV 700', false, false),
  ('Four Wheeler', 'SUV', 'Mahindra', 'XEV 9e', true, false),
  ('Four Wheeler', 'SUV', 'Mahindra', 'BE 6', true, false),
  ('Four Wheeler', 'MUV', 'Mahindra', 'Marazzo', false, false),
  ('Four Wheeler', 'Hatchback', 'Toyota', 'Glanza', false, false),
  ('Four Wheeler', 'SUV', 'Toyota', 'Taisor', false, false),
  ('Four Wheeler', 'MUV', 'Toyota', 'Rumion', false, false),
  ('Four Wheeler', 'SUV', 'Toyota', 'Urban Cruiser Hyryder', false, false),
  ('Four Wheeler', 'MUV', 'Toyota', 'Innova Crysta', false, false),
  ('Four Wheeler', 'MUV', 'Toyota', 'Innova Hycross', false, false),
  ('Four Wheeler', 'SUV', 'Toyota', 'Fortuner', false, false),
  ('Four Wheeler', 'Sedan', 'Toyota', 'Camry', false, false),
  ('Four Wheeler', 'MUV', 'Toyota', 'Vellfire', false, false),
  ('Four Wheeler', 'SUV', 'Toyota', 'Land Cruiser 300', false, false),
  ('Four Wheeler', 'SUV', 'Kia', 'Sonet', false, false),
  ('Four Wheeler', 'SUV', 'Kia', 'Seltos', false, false),
  ('Four Wheeler', 'MUV', 'Kia', 'Carens', false, false),
  ('Four Wheeler', 'MUV', 'Kia', 'Carens Clavis', false, false),
  ('Four Wheeler', 'MUV', 'Kia', 'Carnival', false, false),
  ('Four Wheeler', 'SUV', 'Kia', 'EV6', true, false),
  ('Four Wheeler', 'SUV', 'Kia', 'EV9', true, false),
  ('Four Wheeler', 'Sedan', 'Honda', 'Amaze', false, false),
  ('Four Wheeler', 'Sedan', 'Honda', 'City', false, false),
  ('Four Wheeler', 'SUV', 'Honda', 'Elevate', false, false),
  ('Four Wheeler', 'Hatchback', 'Renault', 'Kwid', false, false),
  ('Four Wheeler', 'MUV', 'Renault', 'Triber', false, false),
  ('Four Wheeler', 'SUV', 'Renault', 'Kiger', false, false),
  ('Four Wheeler', 'SUV', 'Nissan', 'Magnite', false, false),
  ('Four Wheeler', 'SUV', 'Nissan', 'X-Trail', false, false),
  ('Four Wheeler', 'Hatchback', 'Volkswagen', 'Polo', false, true),
  ('Four Wheeler', 'SUV', 'Volkswagen', 'Taigun', false, false),
  ('Four Wheeler', 'Sedan', 'Volkswagen', 'Virtus', false, false),
  ('Four Wheeler', 'SUV', 'Volkswagen', 'Tiguan', false, false),
  ('Four Wheeler', 'Sedan', 'Skoda', 'Slavia', false, false),
  ('Four Wheeler', 'SUV', 'Skoda', 'Kushaq', false, false),
  ('Four Wheeler', 'SUV', 'Skoda', 'Kodiaq', false, false),
  ('Four Wheeler', 'SUV', 'Skoda', 'Kylaq', false, false),
  ('Four Wheeler', 'Sedan', 'Skoda', 'Octavia', false, true),
  ('Four Wheeler', 'Hatchback', 'MG', 'Comet EV', true, false),
  ('Four Wheeler', 'SUV', 'MG', 'Windsor EV', true, false),
  ('Four Wheeler', 'SUV', 'MG', 'ZS EV', true, false),
  ('Four Wheeler', 'SUV', 'MG', 'Astor', false, false),
  ('Four Wheeler', 'SUV', 'MG', 'Hector', false, false),
  ('Four Wheeler', 'SUV', 'MG', 'Gloster', false, false),
  ('Four Wheeler', 'MUV', 'MG', 'M9', true, false),
  ('Four Wheeler', 'Hatchback', 'Citroën', 'C3', false, false),
  ('Four Wheeler', 'SUV', 'Citroën', 'C3 Aircross', false, false),
  ('Four Wheeler', 'SUV', 'Citroën', 'Basalt', false, false),
  ('Four Wheeler', 'Hatchback', 'Citroën', 'eC3', true, false),
  ('Four Wheeler', 'SUV', 'Jeep', 'Compass', false, false),
  ('Four Wheeler', 'SUV', 'Jeep', 'Meridian', false, false),
  ('Four Wheeler', 'SUV', 'Jeep', 'Wrangler', false, false),
  ('Four Wheeler', 'SUV', 'Jeep', 'Grand Cherokee', false, false),
  ('Four Wheeler', 'Sedan', 'BMW', '2 Series', false, false),
  ('Four Wheeler', 'Sedan', 'BMW', '3 Series', false, false),
  ('Four Wheeler', 'Sedan', 'BMW', '5 Series', false, false),
  ('Four Wheeler', 'Sedan', 'BMW', '7 Series', false, false),
  ('Four Wheeler', 'SUV', 'BMW', 'X1', false, false),
  ('Four Wheeler', 'SUV', 'BMW', 'X3', false, false),
  ('Four Wheeler', 'SUV', 'BMW', 'X5', false, false),
  ('Four Wheeler', 'SUV', 'BMW', 'X7', false, false),
  ('Four Wheeler', 'Sedan', 'Mercedes-Benz', 'A-Class', false, false),
  ('Four Wheeler', 'Sedan', 'Mercedes-Benz', 'C-Class', false, false),
  ('Four Wheeler', 'Sedan', 'Mercedes-Benz', 'E-Class', false, false),
  ('Four Wheeler', 'Sedan', 'Mercedes-Benz', 'S-Class', false, false),
  ('Four Wheeler', 'SUV', 'Mercedes-Benz', 'GLA', false, false),
  ('Four Wheeler', 'SUV', 'Mercedes-Benz', 'GLC', false, false),
  ('Four Wheeler', 'SUV', 'Mercedes-Benz', 'GLE', false, false),
  ('Four Wheeler', 'SUV', 'Mercedes-Benz', 'GLS', false, false),
  ('Four Wheeler', 'SUV', 'Mercedes-Benz', 'G-Class', false, false),
  ('Four Wheeler', 'Sedan', 'Audi', 'A4', false, false),
  ('Four Wheeler', 'Sedan', 'Audi', 'A6', false, false),
  ('Four Wheeler', 'SUV', 'Audi', 'Q3', false, false),
  ('Four Wheeler', 'SUV', 'Audi', 'Q5', false, false),
  ('Four Wheeler', 'SUV', 'Audi', 'Q7', false, false),
  ('Four Wheeler', 'SUV', 'Audi', 'Q8', false, false),
  ('Four Wheeler', 'Sedan', 'Audi', 'e-tron GT', true, false),
  ('Four Wheeler', 'SUV', 'Volvo', 'XC40', false, false),
  ('Four Wheeler', 'SUV', 'Volvo', 'EX40', true, false),
  ('Four Wheeler', 'SUV', 'Volvo', 'XC60', false, false),
  ('Four Wheeler', 'SUV', 'Volvo', 'XC90', false, false),
  ('Four Wheeler', 'SUV', 'Volvo', 'EC40', true, false),

  -- Commercial Vehicle
  ('Commercial Vehicle', 'Mini Truck', 'Tata Motors', 'Ace', false, false),
  ('Commercial Vehicle', 'Mini Truck', 'Tata Motors', 'Ace Gold', false, false),
  ('Commercial Vehicle', 'Pickup', 'Tata Motors', 'Intra V10', false, false),
  ('Commercial Vehicle', 'Pickup', 'Tata Motors', 'Intra V20', false, false),
  ('Commercial Vehicle', 'Pickup', 'Tata Motors', 'Intra V30', false, false),
  ('Commercial Vehicle', 'Pickup', 'Tata Motors', 'Yodha', false, false),
  ('Commercial Vehicle', 'LCV', 'Tata Motors', '407', false, false),
  ('Commercial Vehicle', 'Mini Truck', 'Mahindra', 'Jeeto', false, false),
  ('Commercial Vehicle', 'Mini Truck', 'Mahindra', 'Supro', false, false),
  ('Commercial Vehicle', 'Pickup', 'Mahindra', 'Bolero Pik-Up', false, false),
  ('Commercial Vehicle', 'Pickup', 'Mahindra', 'Bolero Maxx Pik-Up', false, false),
  ('Commercial Vehicle', 'LCV', 'Mahindra', 'Veero', false, false),
  ('Commercial Vehicle', 'Pickup', 'Ashok Leyland', 'Dost', false, false),
  ('Commercial Vehicle', 'Pickup', 'Ashok Leyland', 'Bada Dost', false, false),
  ('Commercial Vehicle', 'LCV', 'Ashok Leyland', 'Partner', false, false),
  ('Commercial Vehicle', 'Medium Truck', 'Ashok Leyland', 'Ecomet', false, false),
  ('Commercial Vehicle', 'Mini Truck', 'Maruti Suzuki', 'Super Carry', false, false),
  ('Commercial Vehicle', 'LCV', 'Eicher', 'Pro 2049', false, false),
  ('Commercial Vehicle', 'LCV', 'Eicher', 'Pro 2059', false, false),
  ('Commercial Vehicle', 'Medium Truck', 'Eicher', 'Pro 3015', false, false),
  ('Commercial Vehicle', 'Heavy Truck', 'Eicher', 'Pro 6028', false, false),
  ('Commercial Vehicle', 'Pickup', 'Isuzu', 'D-Max', false, false),
  ('Commercial Vehicle', 'Pickup', 'Isuzu', 'S-CAB', false, false),
  ('Commercial Vehicle', 'Pickup', 'Isuzu', 'V-Cross', false, false),
  -- Listed with three-wheelers in the document; it is a four-wheel small commercial vehicle.
  ('Commercial Vehicle', 'Mini Truck', 'Euler Motors', 'Storm EV', true, false),
  -- Listed with Toyota's cars in the document; it is a pickup.
  ('Commercial Vehicle', 'Pickup', 'Toyota', 'Hilux', false, false),

  -- Passenger Commercial (the rest of this category comes later)
  ('Passenger Commercial', 'Maxi Cab', 'Force Motors', 'Traveller', false, false),
  ('Passenger Commercial', 'Maxi Cab', 'Force Motors', 'Trax Cruiser', false, false),
  ('Passenger Commercial', 'Maxi Cab', 'Force Motors', 'Urbania', false, false);

INSERT INTO vehicle_makes (name)
SELECT make FROM seed_vehicle_models GROUP BY make ORDER BY min(seq);

INSERT INTO vehicle_models (make_id, category_id, subcategory_id, name, is_ev, discontinued, sort_order)
SELECT m.id, c.id, s.id, x.model, x.is_ev, x.discontinued, x.seq
  FROM seed_vehicle_models x
  JOIN vehicle_makes m ON m.name = x.make AND m.tenant_id IS NULL
  JOIN vehicle_categories c ON c.name = x.category
  JOIN vehicle_subcategories s ON s.category_id = c.id AND s.name = x.subcategory
 ORDER BY x.seq;
