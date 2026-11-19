CREATE DATABASE IF NOT EXISTS event_reservation_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
USE event_reservation_db;

CREATE TABLE IF NOT EXISTS organizations (
  organization_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organization_name VARCHAR(120) NOT NULL,
  contact_email VARCHAR(255) NOT NULL,
  contact_phone VARCHAR(30),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS events (
  event_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organization_id INT UNSIGNED NOT NULL,
  title VARCHAR(150) NOT NULL,
  category VARCHAR(60) NOT NULL,
  description TEXT,
  start_datetime DATETIME NOT NULL,
  end_datetime DATETIME NOT NULL,
  venue_name VARCHAR(150) NOT NULL,
  venue_address VARCHAR(255) NOT NULL,
  capacity INT UNSIGNED NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'Draft',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_events_organization
    FOREIGN KEY (organization_id) REFERENCES organizations(organization_id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  INDEX idx_events_listing (status, start_datetime, category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ticket_types (
  ticket_type_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  event_id INT UNSIGNED NOT NULL,
  ticket_name VARCHAR(40) NOT NULL,
  price DECIMAL(8,2) NOT NULL DEFAULT 0.00,
  CONSTRAINT uq_ticket_type_per_event UNIQUE (event_id, ticket_name),
  CONSTRAINT fk_ticket_types_event
    FOREIGN KEY (event_id) REFERENCES events(event_id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS reservations (
  reservation_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  event_id INT UNSIGNED NULL,
  event_title_snapshot VARCHAR(150) NOT NULL,
  attendee_name VARCHAR(100) NOT NULL,
  attendee_email VARCHAR(255) NOT NULL,
  confirmation_code VARCHAR(20) NOT NULL UNIQUE,
  status VARCHAR(20) NOT NULL DEFAULT 'Confirmed',
  reserved_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_reservations_event
    FOREIGN KEY (event_id) REFERENCES events(event_id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  INDEX idx_reservations_event_status (event_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS reservation_items (
  reservation_item_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  reservation_id INT UNSIGNED NOT NULL,
  ticket_type_id INT UNSIGNED NULL,
  ticket_name_snapshot VARCHAR(40) NOT NULL,
  quantity INT UNSIGNED NOT NULL,
  unit_price DECIMAL(8,2) NOT NULL,
  CONSTRAINT uq_reservation_ticket_type UNIQUE (reservation_id, ticket_type_id),
  CONSTRAINT fk_reservation_items_reservation
    FOREIGN KEY (reservation_id) REFERENCES reservations(reservation_id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_reservation_items_ticket_type
    FOREIGN KEY (ticket_type_id) REFERENCES ticket_types(ticket_type_id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  INDEX idx_reservation_items_ticket_type (ticket_type_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO organizations (organization_name, contact_email, contact_phone)
SELECT 'Community Events Office', 'events@example.org', '6123 4567'
WHERE NOT EXISTS (
  SELECT 1 FROM organizations WHERE organization_name = 'Community Events Office'
);

INSERT INTO events
  (organization_id, title, category, description, start_datetime, end_datetime,
   venue_name, venue_address, capacity, status)
SELECT organization_id, 'Community Arts Festival', 'Festival',
       'A weekend of local art, performances and hands-on activities for the community.',
       '2027-03-20 10:00:00', '2027-03-20 18:00:00',
       'Harbour Community Hall', '10 Marina View, Singapore', 240, 'Published'
FROM organizations
WHERE organization_name = 'Community Events Office'
  AND NOT EXISTS (SELECT 1 FROM events WHERE title = 'Community Arts Festival');

INSERT INTO events
  (organization_id, title, category, description, start_datetime, end_datetime,
   venue_name, venue_address, capacity, status)
SELECT organization_id, 'Family Science Discovery Day', 'Workshop',
       'Interactive science demonstrations and guided activities for families.',
       '2027-04-10 09:30:00', '2027-04-10 13:00:00',
       'Northside Learning Centre', '25 Learning Lane, Singapore', 120, 'Published'
FROM organizations
WHERE organization_name = 'Community Events Office'
  AND NOT EXISTS (SELECT 1 FROM events WHERE title = 'Family Science Discovery Day');

INSERT INTO events
  (organization_id, title, category, description, start_datetime, end_datetime,
   venue_name, venue_address, capacity, status)
SELECT organization_id, 'Neighbourhood Music Evening', 'Concert',
       'An evening concert featuring local performers and community groups.',
       '2027-05-08 19:00:00', '2027-05-08 21:30:00',
       'Riverside Open-Air Stage', '8 River Walk, Singapore', 180, 'Published'
FROM organizations
WHERE organization_name = 'Community Events Office'
  AND NOT EXISTS (SELECT 1 FROM events WHERE title = 'Neighbourhood Music Evening');

INSERT INTO events
  (organization_id, title, category, description, start_datetime, end_datetime,
   venue_name, venue_address, capacity, status)
SELECT organization_id, 'Community Open House', 'Community',
       'Meet local groups, explore community programmes and enjoy free activities.',
       '2027-06-19 10:00:00', '2027-06-19 15:00:00',
       'Central Community Hub', '3 Community Square, Singapore', 300, 'Published'
FROM organizations
WHERE organization_name = 'Community Events Office'
  AND NOT EXISTS (SELECT 1 FROM events WHERE title = 'Community Open House');

INSERT INTO ticket_types (event_id, ticket_name, price)
SELECT event_id, 'Adult', 18.00 FROM events WHERE title = 'Community Arts Festival'
  AND NOT EXISTS (SELECT 1 FROM ticket_types WHERE event_id = events.event_id AND ticket_name = 'Adult');
INSERT INTO ticket_types (event_id, ticket_name, price)
SELECT event_id, 'Child', 8.00 FROM events WHERE title = 'Community Arts Festival'
  AND NOT EXISTS (SELECT 1 FROM ticket_types WHERE event_id = events.event_id AND ticket_name = 'Child');
INSERT INTO ticket_types (event_id, ticket_name, price)
SELECT event_id, 'Senior', 10.00 FROM events WHERE title = 'Community Arts Festival'
  AND NOT EXISTS (SELECT 1 FROM ticket_types WHERE event_id = events.event_id AND ticket_name = 'Senior');
INSERT INTO ticket_types (event_id, ticket_name, price)
SELECT event_id, 'Adult', 12.00 FROM events WHERE title = 'Family Science Discovery Day'
  AND NOT EXISTS (SELECT 1 FROM ticket_types WHERE event_id = events.event_id AND ticket_name = 'Adult');
INSERT INTO ticket_types (event_id, ticket_name, price)
SELECT event_id, 'Child', 5.00 FROM events WHERE title = 'Family Science Discovery Day'
  AND NOT EXISTS (SELECT 1 FROM ticket_types WHERE event_id = events.event_id AND ticket_name = 'Child');
INSERT INTO ticket_types (event_id, ticket_name, price)
SELECT event_id, 'Senior', 8.00 FROM events WHERE title = 'Family Science Discovery Day'
  AND NOT EXISTS (SELECT 1 FROM ticket_types WHERE event_id = events.event_id AND ticket_name = 'Senior');
INSERT INTO ticket_types (event_id, ticket_name, price)
SELECT event_id, 'Adult', 25.00 FROM events WHERE title = 'Neighbourhood Music Evening'
  AND NOT EXISTS (SELECT 1 FROM ticket_types WHERE event_id = events.event_id AND ticket_name = 'Adult');
INSERT INTO ticket_types (event_id, ticket_name, price)
SELECT event_id, 'Child', 12.00 FROM events WHERE title = 'Neighbourhood Music Evening'
  AND NOT EXISTS (SELECT 1 FROM ticket_types WHERE event_id = events.event_id AND ticket_name = 'Child');
INSERT INTO ticket_types (event_id, ticket_name, price)
SELECT event_id, 'Senior', 18.00 FROM events WHERE title = 'Neighbourhood Music Evening'
  AND NOT EXISTS (SELECT 1 FROM ticket_types WHERE event_id = events.event_id AND ticket_name = 'Senior');
INSERT INTO ticket_types (event_id, ticket_name, price)
SELECT event_id, 'Free', 0.00 FROM events WHERE title = 'Community Open House'
  AND NOT EXISTS (SELECT 1 FROM ticket_types WHERE event_id = events.event_id AND ticket_name = 'Free');
