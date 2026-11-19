CREATE DATABASE IF NOT EXISTS event_reservation_db;
USE event_reservation_db;


CREATE TABLE IF NOT EXISTS organizations (
    organization_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    organization_name VARCHAR(120) NOT NULL,
    contact_email VARCHAR(255) NOT NULL,
    contact_phone VARCHAR(30)
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
    CONSTRAINT fk_events_organization
        FOREIGN KEY (organization_id)
        REFERENCES organizations(organization_id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ticket_types (
    ticket_type_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    event_id INT UNSIGNED NOT NULL,
    ticket_name VARCHAR(40) NOT NULL,
    price DECIMAL(8,2) NOT NULL DEFAULT 0.00,
    CONSTRAINT fk_ticket_types_event
        FOREIGN KEY (event_id)
        REFERENCES events(event_id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS reservations (
    reservation_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    event_id INT UNSIGNED NOT NULL,
    attendee_name VARCHAR(100) NOT NULL,
    attendee_email VARCHAR(255) NOT NULL,
    confirmation_code VARCHAR(20) NOT NULL UNIQUE,
    status VARCHAR(20) NOT NULL DEFAULT 'Confirmed',
    reserved_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_reservations_event
        FOREIGN KEY (event_id)
        REFERENCES events(event_id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS reservation_items (
    reservation_item_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    reservation_id INT UNSIGNED NOT NULL,
    ticket_type_id INT UNSIGNED NOT NULL,
    quantity INT UNSIGNED NOT NULL,
    unit_price DECIMAL(8,2) NOT NULL,
    CONSTRAINT uq_reservation_ticket_type
        UNIQUE (reservation_id, ticket_type_id),
    CONSTRAINT fk_reservation_items_reservation
        FOREIGN KEY (reservation_id)
        REFERENCES reservations(reservation_id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    CONSTRAINT fk_reservation_items_ticket_type
        FOREIGN KEY (ticket_type_id)
        REFERENCES ticket_types(ticket_type_id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;