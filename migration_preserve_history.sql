USE event_reservation_db;

-- Apply this migration once only when the earlier schema has already been installed.
-- It preserves event and ticket names for existing reservation history.

ALTER TABLE reservations
  ADD COLUMN event_title_snapshot VARCHAR(150) NOT NULL DEFAULT '';

UPDATE reservations r
JOIN events e ON e.event_id = r.event_id
SET r.event_title_snapshot = e.title
WHERE r.event_title_snapshot = '';

ALTER TABLE reservations
  DROP FOREIGN KEY fk_reservations_event;

ALTER TABLE reservations
  MODIFY event_id INT UNSIGNED NULL;

ALTER TABLE reservations
  ADD CONSTRAINT fk_reservations_event
    FOREIGN KEY (event_id) REFERENCES events(event_id)
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE reservation_items
  ADD COLUMN ticket_name_snapshot VARCHAR(40) NOT NULL DEFAULT '';

UPDATE reservation_items ri
JOIN ticket_types tt ON tt.ticket_type_id = ri.ticket_type_id
SET ri.ticket_name_snapshot = tt.ticket_name
WHERE ri.ticket_name_snapshot = '';

ALTER TABLE reservation_items
  DROP FOREIGN KEY fk_reservation_items_ticket_type;

ALTER TABLE reservation_items
  MODIFY ticket_type_id INT UNSIGNED NULL;

ALTER TABLE reservation_items
  ADD CONSTRAINT fk_reservation_items_ticket_type
    FOREIGN KEY (ticket_type_id) REFERENCES ticket_types(ticket_type_id)
    ON DELETE SET NULL ON UPDATE CASCADE;

