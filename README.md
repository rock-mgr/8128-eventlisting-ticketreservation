# EventEase — Event Listing and Ticket Reservation

EventEase helps organizations publish events and lets participants find events, check details and reserve tickets before arriving. The platform records a confirmation code; it does not process online payments.

## Features

### Participant pages
- Browse upcoming published events.
- Search by event category and event date.
- View event details, venue, capacity, available spaces and adult/child/senior/free fares.
- Reserve several ticket types in one submission and receive a confirmation code.
- Capacity is checked in a database transaction to prevent reservations exceeding the event limit.

### Organizer pages
- Create, view, edit and delete events.
- Set an event's type, dates, venue, capacity, publication status and ticket prices.
- Review reservations and confirmation details.
- Delete a reservation after confirmation; its ticket lines are removed and capacity becomes available again.
- Delete an event after a confirmation page; its reservations are marked Cancelled and retained as history, with event and ticket details preserved.

The organizer pages are an assessment demonstration and do not include a login system.

## Technology

- Node.js and Express
- EJS templates
- MariaDB with the mysql2 driver
- HTML and CSS

## Database setup

The database name is `event_reservation_db`. The complete schema and three example future events are in `schema.sql`.

The Codespaces MariaDB lesson uses:

```sh
mysql -h 127.0.0.1 -u root -pmariadb < schema.sql
```

Use the password provided for your MariaDB environment. The filename above is the actual file in this repository. The SQL creates/selects the database, creates all five tables, and inserts repeat-safe sample event and ticket data.

If you already created the tables using the earlier schema version from this project, run `migration_preserve_history.sql` once after confirming the previous schema is installed. It adds the snapshot fields and updates the foreign keys needed to retain cancelled reservations when an event is deleted. Do not run the migration on a fresh database; the current `schema.sql` already includes those changes.

In Codespaces, start MariaDB if it is not running:

```bash
sudo service mariadb start

## Application setup

1. Copy `.env.example` to `.env`.
2. Set the database password to the value for your MariaDB instance.
3. Install dependencies with `npm install`.
4. Start with `npm run dev` during development or `npm start` to run the server.
5. In Codespaces, open the forwarded port 3000.

Never commit `.env`; it is excluded by `.gitignore`.

## Main routes

| Method | Route | Purpose |
|---|---|---|
| GET | `/` | Public event listing and category/date search |
| GET | `/events/:id` | View event details and reservation form |
| POST | `/events/:id/reservations` | Create reservation and confirmation code |
| GET | `/reservations/confirmation/:code` | Display reservation confirmation |
| GET | `/admin/events` | Organizer event list |
| GET, POST | `/admin/events/new`, `/admin/events` | Display and create an event |
| GET, POST | `/admin/events/:id/edit` | Display and update an event |
| GET, POST | `/admin/events/:id/delete` | Confirm and delete an event |
| GET | `/admin/reservations` | Review reservations |
| GET, POST | `/admin/reservations/:id/delete` | Confirm and delete a reservation |

## SQL operations for the assessment

The event listing uses a SELECT with two optional search criteria: event category and event date. The following examples use the `events` table and demonstrate SELECT, INSERT, UPDATE and DELETE statements.

```sql
-- SELECT 1: all published events
SELECT event_id, title, category, start_datetime, venue_name, capacity
FROM events
WHERE status = 'Published'
ORDER BY start_datetime;

-- SELECT 2: search by category and date (two criteria)
SELECT event_id, title, category, start_datetime, venue_name
FROM events
WHERE category = 'Festival'
  AND DATE(start_datetime) = '2027-03-20'
  AND status = 'Published';

-- INSERT: create an event under the seeded organizer
INSERT INTO events
  (organization_id, title, category, description, start_datetime, end_datetime,
   venue_name, venue_address, capacity, status)
SELECT organization_id, 'Example Community Talk', 'Talk', 'A sample event.',
       '2027-06-12 18:00:00', '2027-06-12 20:00:00',
       'Community Hall', '1 Example Road, Singapore', 80, 'Draft'
FROM organizations
WHERE organization_name = 'Community Events Office'
LIMIT 1;

-- UPDATE: change event capacity
UPDATE events
SET capacity = 100
WHERE title = 'Example Community Talk';

-- DELETE: remove the example event (only if it has no reservations)
DELETE FROM events
WHERE title = 'Example Community Talk';
```

## Data model

- `organizations` owns events.
- `events` has ticket types and a participant capacity.
- `ticket_types` stores the fare name and price for an event.
- `reservations` stores the participant and confirmation status.
- `reservation_items` stores each fare and quantity within a reservation.

Primary keys use unsigned integers. Relationships use foreign keys. The schema uses integer, varchar, text, datetime, decimal, and status string data types.

## Assessment follow-up

The source and database are prepared for the Codespaces demonstration. Before submission, confirm the current ERD/logical diagram reflects the final snapshot fields, capture screenshots of the completed pages and database CRUD, and follow the tutor's required hosting, GitHub and source ZIP submission instructions.

