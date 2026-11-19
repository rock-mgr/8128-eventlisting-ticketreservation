require("dotenv").config();

const crypto = require("crypto");
const express = require("express");
const path = require("path");
const db = require("./db");

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

const asyncRoute = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

// CONVERT THE VALUE TO A VALID POSITIVE ID
const toId = (value) => {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

// FORMAT A DATABASE DATE AND TIME FOR THE EVENT FORM
const formatDateTimeInput = (value) => {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return "";
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

// CLEAN AND VALIDATE EVENT FORM DATA BEFORE SAVING
const parseEventForm = (body) => {
  const event = {
    organization_id: toId(body.organization_id),
    title: String(body.title || "").trim(),
    category: String(body.category || "").trim(),
    description: String(body.description || "").trim(),
    start_datetime: String(body.start_datetime || "").replace("T", " "),
    end_datetime: String(body.end_datetime || "").replace("T", " "),
    venue_name: String(body.venue_name || "").trim(),
    venue_address: String(body.venue_address || "").trim(),
    capacity: Number(body.capacity),
    status: String(body.status || "Draft")
  };
  const errors = [];
  if (!event.organization_id) errors.push("Choose an organizer.");
  if (!event.title) errors.push("Enter an event title.");
  if (!event.category) errors.push("Enter an event category.");
  const startTime = new Date(event.start_datetime);
  const endTime = new Date(event.end_datetime);
  if (!event.start_datetime || !event.end_datetime || Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime()) || endTime <= startTime) {
    errors.push("The end date and time must be after the start date and time.");
  }
  if (!event.venue_name || !event.venue_address) errors.push("Enter the venue name and address.");
  if (!Number.isInteger(event.capacity) || event.capacity < 1) errors.push("Capacity must be a whole number greater than zero.");
  if (!["Draft", "Published"].includes(event.status)) errors.push("Choose Draft or Published.");
  return { event, errors };
};

// PARSE TICKET TYPE DETAILS SUBMITTED WITH THE EVENT FORM
const parseTicketRows = (body) => {
  let rows = body.tickets || [];
  if (!Array.isArray(rows)) rows = [rows];
  const tickets = rows
    .map((ticket) => ({
      ticket_type_id: ticket.ticket_type_id ? toId(ticket.ticket_type_id) : null,
      ticket_name: String(ticket.ticket_name || "").trim(),
      priceInput: String(ticket.price ?? "").trim(),
      price: Number(ticket.price)
    }))
    .filter((ticket) => ticket.ticket_name || ticket.priceInput !== "" || ticket.ticket_type_id);
  const errors = [];
  if (tickets.length === 0) errors.push("Add at least one ticket type.");
  if (tickets.some((ticket) => !ticket.ticket_name)) errors.push("Every ticket type needs a name.");
  if (tickets.some((ticket) => ticket.priceInput === "")) errors.push("Enter a price for every ticket type; use 0 for free admission.");
  if (tickets.some((ticket) => !Number.isFinite(ticket.price) || ticket.price < 0)) errors.push("Ticket prices must be zero or greater.");
  const names = tickets.map((ticket) => ticket.ticket_name.toLowerCase());
  if (new Set(names).size !== names.length) errors.push("Ticket type names must be unique for an event.");
  return { tickets, errors };
};

// LOAD ORGANIZATIONS FOR THE EVENT FORM DROPDOWN
const getOrganizations = async () => {
  const [organizations] = await db.execute(
    "SELECT organization_id, organization_name FROM organizations ORDER BY organization_name"
  );
  return organizations;
};

// DISPLAY THE EVENT FORM WITH ORGANIZATION AND OTHER FORM DATA
const renderEventForm = async (res, options) => {
  const organizations = await getOrganizations();
  return res.render("event-form", { organizations, ...options });
};

// EVENT LISTING FETCHING 
app.get("/", asyncRoute(async (req, res) => {
  const category = String(req.query.category || "");
  const eventDate = String(req.query.eventDate || "");

  // Only listed those that are under status published and later than today datetime
  const conditions = ["e.status = 'Published'", "e.start_datetime >= NOW()"];

  const values = [];

  // If category was provided, set it as part of the filter condition
  if (category) {
    conditions.push("e.category = ?");
    values.push(category);
  }

  // If date was provided, set it as part of the filter condition
  if (/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
    conditions.push("DATE(e.start_datetime) = ?");
    values.push(eventDate);
  }

  // Retrieving matching upcoming events, 
  // work out each event’s lowest ticket price and remaining spaces, 
  // with condition filter above
  const [events] = await db.execute(`
    SELECT e.event_id, e.title, e.category, e.description, e.start_datetime,
           e.venue_name, e.venue_address, e.capacity,
           COALESCE(prices.starting_price, 0) AS starting_price,
           GREATEST(e.capacity - COALESCE(bookings.reserved_count, 0), 0) AS spaces_left
    FROM events e
    LEFT JOIN (
      SELECT event_id, MIN(price) AS starting_price
      FROM ticket_types GROUP BY event_id
    ) prices ON prices.event_id = e.event_id
    LEFT JOIN (
      SELECT r.event_id, SUM(ri.quantity) AS reserved_count
      FROM reservations r JOIN reservation_items ri ON ri.reservation_id = r.reservation_id
      WHERE r.status = 'Confirmed' GROUP BY r.event_id
    ) bookings ON bookings.event_id = e.event_id
    WHERE ${conditions.join(" AND ")}
    ORDER BY e.start_datetime
  `, values);
  const [categories] = await db.execute(
    "SELECT DISTINCT category FROM events WHERE status = 'Published' AND start_datetime >= NOW() ORDER BY category"
  );
  res.render("events", { events, categories, filters: { category, eventDate }, error: null });
}));

// SHOW ONE PUBLISHED EVENT AND LOAD ITS TICKET OPTIONS
app.get("/events/:id", asyncRoute(async (req, res) => {
  const eventId = toId(req.params.id);
  if (!eventId) return res.status(404).render("message", { title: "Event not found", message: "That event could not be found.", backLink: "/", backText: "Back to events" });

  const [rows] = await db.execute(`
    SELECT e.*, o.organization_name,
           COALESCE((SELECT SUM(ri.quantity)
                     FROM reservations r JOIN reservation_items ri ON ri.reservation_id = r.reservation_id
                     WHERE r.event_id = e.event_id AND r.status = 'Confirmed'), 0) AS reserved_count
    FROM events e JOIN organizations o ON o.organization_id = e.organization_id
    WHERE e.event_id = ? AND e.status = 'Published'
  `, [eventId]);
  if (!rows.length) return res.status(404).render("message", { title: "Event not found", message: "That event is unavailable.", backLink: "/", backText: "Back to events" });
  const event = rows[0];
  event.spaces_left = Math.max(0, Number(event.capacity) - Number(event.reserved_count));
  const [ticketTypes] = await db.execute(
    "SELECT ticket_type_id, ticket_name, price FROM ticket_types WHERE event_id = ? ORDER BY ticket_type_id",
    [eventId]
  );
  res.render("event-details", { event, ticketTypes, error: null, formData: {} });
}));

// CHECK THE RESERVATION FORM AND LOAD THE EVENT'S BOOKING INFORMATION
app.post("/events/:id/reservations", asyncRoute(async (req, res) => {
  const eventId = toId(req.params.id);
  if (!eventId) return res.status(404).render("message", { title: "Event not found", message: "That event could not be found.", backLink: "/", backText: "Back to events" });

  const attendeeName = String(req.body.attendee_name || "").trim();
  const attendeeEmail = String(req.body.attendee_email || "").trim();
  const quantities = req.body.quantities && typeof req.body.quantities === "object" ? req.body.quantities : {};
  const requested = Object.entries(quantities)
    .map(([id, quantity]) => ({ ticketTypeId: toId(id.replace("ticket_", "")), quantity: Number(quantity) }))
    .filter((item) => item.ticketTypeId && Number.isInteger(item.quantity) && item.quantity > 0);

  const [eventRows] = await db.execute(`
    SELECT e.*, COALESCE((SELECT SUM(ri.quantity)
      FROM reservations r JOIN reservation_items ri ON ri.reservation_id = r.reservation_id
      WHERE r.event_id = e.event_id AND r.status = 'Confirmed'), 0) AS reserved_count
    FROM events e WHERE e.event_id = ? AND e.status = 'Published'
  `, [eventId]);
  if (!eventRows.length) return res.status(404).render("message", { title: "Event unavailable", message: "This event is no longer available for reservation.", backLink: "/", backText: "Back to events" });
  const [ticketTypes] = await db.execute(
    "SELECT ticket_type_id, ticket_name, price FROM ticket_types WHERE event_id = ? ORDER BY ticket_type_id",
    [eventId]
  );

  const validationErrors = [];
  if (!attendeeName) validationErrors.push("Enter the participant's name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(attendeeEmail)) validationErrors.push("Enter a valid email address.");
  if (!requested.length) validationErrors.push("Select at least one ticket.");
  if (Object.values(quantities).some((quantity) => !/^\d+$/.test(String(quantity)) || Number(quantity) < 0)) {
    validationErrors.push("Ticket quantities must be zero or a whole number.");
  }
  if (requested.some((item) => !ticketTypes.some((ticket) => ticket.ticket_type_id === item.ticketTypeId))) {
    validationErrors.push("One or more selected ticket types are invalid.");
  }

  const requestedCount = requested.reduce((sum, item) => sum + item.quantity, 0);
  if (requestedCount > Number(eventRows[0].capacity) - Number(eventRows[0].reserved_count)) {
    validationErrors.push("There are not enough spaces remaining for that quantity.");
  }
  if (validationErrors.length) {
    return res.status(400).render("event-details", {
      event: { ...eventRows[0], spaces_left: Math.max(0, Number(eventRows[0].capacity) - Number(eventRows[0].reserved_count)) },
      ticketTypes,
      error: validationErrors.join(" "),
      formData: { attendeeName, attendeeEmail, quantities }
    });
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [lockedEvents] = await connection.execute(
      "SELECT event_id, title, capacity, status FROM events WHERE event_id = ? FOR UPDATE",
      [eventId]
    );
    if (!lockedEvents.length || lockedEvents[0].status !== "Published") {
      throw Object.assign(new Error("This event is no longer available."), { status: 409 });
    }
    const [capacityRows] = await connection.execute(`
      SELECT COALESCE(SUM(ri.quantity), 0) AS reserved_count
      FROM reservations r JOIN reservation_items ri ON ri.reservation_id = r.reservation_id
      WHERE r.event_id = ? AND r.status = 'Confirmed'
    `, [eventId]);
    const seatsLeft = Number(lockedEvents[0].capacity) - Number(capacityRows[0].reserved_count);
    if (requestedCount > seatsLeft) throw Object.assign(new Error("The remaining capacity changed. Please review the available spaces."), { status: 409 });

    const confirmationCode = `EVT-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
    const [reservationResult] = await connection.execute(
      "INSERT INTO reservations (event_id, event_title_snapshot, attendee_name, attendee_email, confirmation_code, status) VALUES (?, ?, ?, ?, ?, 'Confirmed')",
      [eventId, lockedEvents[0].title, attendeeName, attendeeEmail, confirmationCode]
    );
    for (const item of requested) {
      const ticket = ticketTypes.find((row) => row.ticket_type_id === item.ticketTypeId);
      await connection.execute(
        "INSERT INTO reservation_items (reservation_id, ticket_type_id, ticket_name_snapshot, quantity, unit_price) VALUES (?, ?, ?, ?, ?)",
        [reservationResult.insertId, ticket.ticket_type_id, ticket.ticket_name, item.quantity, ticket.price]
      );
    }
    await connection.commit();
    return res.redirect(`/reservations/confirmation/${encodeURIComponent(confirmationCode)}`);
  } catch (error) {
    await connection.rollback();
    if (error.status === 409) {
      return res.status(409).render("event-details", {
        event: { ...eventRows[0], spaces_left: Math.max(0, Number(eventRows[0].capacity) - Number(eventRows[0].reserved_count)) },
        ticketTypes,
        error: error.message,
        formData: { attendeeName, attendeeEmail, quantities }
      });
    }
    throw error;
  } finally {
    connection.release();
  }
}));

// FIND A RESERVATION BY CONFIRMATION CODE AND SHOW ITS DETAILS
app.get("/reservations/confirmation/:code", asyncRoute(async (req, res) => {
  const code = String(req.params.code || "").toUpperCase();
  const [rows] = await db.execute(`
    SELECT r.reservation_id, r.confirmation_code, r.attendee_name, r.attendee_email,
           r.status, r.reserved_at, COALESCE(e.title, r.event_title_snapshot) AS event_title,
           e.start_datetime, e.venue_name, e.venue_address
    FROM reservations r LEFT JOIN events e ON e.event_id = r.event_id
    WHERE r.confirmation_code = ?
  `, [code]);
  if (!rows.length) return res.status(404).render("message", { title: "Reservation not found", message: "That confirmation code could not be found.", backLink: "/", backText: "Back to events" });
  const reservation = rows[0];
  const [items] = await db.execute(
    "SELECT ticket_name_snapshot AS ticket_name, quantity, unit_price FROM reservation_items WHERE reservation_id = ? ORDER BY reservation_item_id",
    [reservation.reservation_id]
  );
  res.render("confirmation", { reservation, items });
}));

// REDIRECT THE ADMIN HOME PAGE TO EVENT MANAGEMENT
app.get("/admin", (req, res) => res.redirect("/admin/events"));

// LOAD AND DISPLAY EVENTS FOR ADMIN MANAGEMENT
app.get("/admin/events", asyncRoute(async (req, res) => {
  const [events] = await db.execute(`
    SELECT e.event_id, e.title, e.category, e.start_datetime, e.venue_name, e.capacity, e.status,
           o.organization_name,
           COALESCE(SUM(CASE WHEN r.status = 'Confirmed' THEN ri.quantity ELSE 0 END), 0) AS reserved_count
    FROM events e JOIN organizations o ON o.organization_id = e.organization_id
    LEFT JOIN reservations r ON r.event_id = e.event_id
    LEFT JOIN reservation_items ri ON ri.reservation_id = r.reservation_id
    GROUP BY e.event_id ORDER BY e.start_datetime DESC
  `);
  res.render("admin-events", { events });
}));

// OPEN THE FORM TO CREATE A NEW EVENT
app.get("/admin/events/new", asyncRoute(async (req, res) => {
  await renderEventForm(res, {
    title: "Create event",
    action: "/admin/events",
    event: { status: "Draft", capacity: 100 },
    tickets: [
      { ticket_name: "", price: "" },
      { ticket_name: "", price: "" },
      { ticket_name: "", price: "" },
      { ticket_name: "", price: "" }
    ],
    error: null
  });
}));

// VALIDATE AND SAVE A NEW EVENT WITH ITS TICKET OPTIONS
app.post("/admin/events", asyncRoute(async (req, res) => {
  const { event, errors } = parseEventForm(req.body);
  const { tickets, errors: ticketErrors } = parseTicketRows(req.body);
  const allErrors = [...errors, ...ticketErrors];
  if (allErrors.length) {
    return renderEventForm(res.status(400), {
      title: "Create event", action: "/admin/events", event: req.body,
      tickets: req.body.tickets || [], error: allErrors.join(" ")
    });
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [result] = await connection.execute(`
      INSERT INTO events (organization_id, title, category, description, start_datetime, end_datetime,
                          venue_name, venue_address, capacity, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [event.organization_id, event.title, event.category, event.description || null,
      event.start_datetime, event.end_datetime, event.venue_name, event.venue_address,
      event.capacity, event.status]);
    for (const ticket of tickets) {
      await connection.execute(
        "INSERT INTO ticket_types (event_id, ticket_name, price) VALUES (?, ?, ?)",
        [result.insertId, ticket.ticket_name, ticket.price]
      );
    }
    await connection.commit();
    res.redirect("/admin/events");
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));

// LOAD AN EVENT AND ITS TICKET OPTIONS INTO THE EDIT FORM
app.get("/admin/events/:id/edit", asyncRoute(async (req, res) => {
  const eventId = toId(req.params.id);
  const [rows] = eventId ? await db.execute("SELECT * FROM events WHERE event_id = ?", [eventId]) : [[]];
  if (!rows.length) return res.status(404).render("message", { title: "Event not found", message: "That event could not be found.", backLink: "/admin/events", backText: "Back to event management" });
  const [tickets] = await db.execute(
    "SELECT ticket_type_id, ticket_name, price FROM ticket_types WHERE event_id = ? ORDER BY ticket_type_id",
    [eventId]
  );
  await renderEventForm(res, { title: "Edit event", action: `/admin/events/${eventId}/edit`, event: rows[0], tickets, error: null });
}));

// VALIDATE AND SAVE CHANGES TO AN EXISTING EVENT
app.post("/admin/events/:id/edit", asyncRoute(async (req, res) => {
  const eventId = toId(req.params.id);
  if (!eventId) return res.status(404).render("message", { title: "Event not found", message: "That event could not be found.", backLink: "/admin/events", backText: "Back to event management" });
  const { event, errors } = parseEventForm(req.body);
  const { tickets, errors: ticketErrors } = parseTicketRows(req.body);
  const allErrors = [...errors, ...ticketErrors];
  const [existingEvents] = await db.execute("SELECT event_id FROM events WHERE event_id = ?", [eventId]);
  if (!existingEvents.length) return res.status(404).render("message", { title: "Event not found", message: "That event could not be found.", backLink: "/admin/events", backText: "Back to event management" });
  const [bookingTotals] = await db.execute(`
    SELECT COALESCE(SUM(ri.quantity), 0) AS reserved_count
    FROM reservations r JOIN reservation_items ri ON ri.reservation_id = r.reservation_id
    WHERE r.event_id = ? AND r.status = 'Confirmed'
  `, [eventId]);
  if (event.capacity < Number(bookingTotals[0].reserved_count)) {
    errors.push(`Capacity cannot be lower than the ${bookingTotals[0].reserved_count} confirmed ticket(s).`);
  }
  const [existingTickets] = await db.execute("SELECT ticket_type_id FROM ticket_types WHERE event_id = ?", [eventId]);
  const submittedIds = tickets.filter((ticket) => ticket.ticket_type_id).map((ticket) => ticket.ticket_type_id);
  if (new Set(submittedIds).size !== submittedIds.length || submittedIds.some((id) => !existingTickets.some((row) => row.ticket_type_id === id))) {
    allErrors.push("A submitted ticket type does not belong to this event.");
  }
  const retainedIds = new Set(submittedIds);
  const removedIds = existingTickets.map((row) => row.ticket_type_id).filter((id) => !retainedIds.has(id));
  if (removedIds.length) {
    const placeholders = removedIds.map(() => "?").join(",");
    const [usedRows] = await db.execute(
      `SELECT COUNT(*) AS used_count FROM reservation_items WHERE ticket_type_id IN (${placeholders})`, removedIds
    );
    if (Number(usedRows[0].used_count) > 0) allErrors.push("A ticket type with existing reservations cannot be removed. Keep it and set its price to 0 if you no longer want to charge for it.");
  }
  if (allErrors.length) {
    return renderEventForm(res.status(400), {
      title: "Edit event", action: `/admin/events/${eventId}/edit`, event: { ...req.body, event_id: eventId },
      tickets: req.body.tickets || [], error: allErrors.join(" ")
    });
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute(`
      UPDATE events SET organization_id = ?, title = ?, category = ?, description = ?, start_datetime = ?,
                        end_datetime = ?, venue_name = ?, venue_address = ?, capacity = ?, status = ?
      WHERE event_id = ?
    `, [event.organization_id, event.title, event.category, event.description || null,
      event.start_datetime, event.end_datetime, event.venue_name, event.venue_address,
      event.capacity, event.status, eventId]);
    if (removedIds.length) {
      const placeholders = removedIds.map(() => "?").join(",");
      await connection.execute(`DELETE FROM ticket_types WHERE ticket_type_id IN (${placeholders})`, removedIds);
    }
    for (const ticket of tickets) {
      if (ticket.ticket_type_id) {
        await connection.execute(
          "UPDATE ticket_types SET ticket_name = ?, price = ? WHERE ticket_type_id = ? AND event_id = ?",
          [ticket.ticket_name, ticket.price, ticket.ticket_type_id, eventId]
        );
      } else {
        await connection.execute(
          "INSERT INTO ticket_types (event_id, ticket_name, price) VALUES (?, ?, ?)",
          [eventId, ticket.ticket_name, ticket.price]
        );
      }
    }
    await connection.commit();
    res.redirect("/admin/events");
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));

// SHOW THE EVENT DELETE CONFIRMATION PAGE
app.get("/admin/events/:id/delete", asyncRoute(async (req, res) => {
  const eventId = toId(req.params.id);
  const [rows] = eventId ? await db.execute(`
    SELECT e.event_id, e.title,
      (SELECT COUNT(*) FROM reservations r WHERE r.event_id = e.event_id) AS reservation_count
    FROM events e WHERE e.event_id = ?
  `, [eventId]) : [[]];
  if (!rows.length) return res.status(404).render("message", { title: "Event not found", message: "That event could not be found.", backLink: "/admin/events", backText: "Back to event management" });
  res.render("event-delete", { event: rows[0] });
}));

// PROCESS THE CONFIRMED EVENT DELETION
app.post("/admin/events/:id/delete", asyncRoute(async (req, res) => {
  const eventId = toId(req.params.id);
  if (!eventId) return res.status(404).render("message", { title: "Event not found", message: "That event could not be found.", backLink: "/admin/events", backText: "Back to event management" });
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute("SELECT event_id FROM events WHERE event_id = ? FOR UPDATE", [eventId]);
    if (!rows.length) {
      await connection.rollback();
      return res.status(404).render("message", { title: "Event not found", message: "That event could not be found.", backLink: "/admin/events", backText: "Back to event management" });
    }
    await connection.execute("UPDATE reservations SET status = 'Cancelled' WHERE event_id = ?", [eventId]);
    await connection.execute("DELETE FROM events WHERE event_id = ?", [eventId]);
    await connection.commit();
    res.redirect("/admin/events");
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));

// LOAD AND DISPLAY RESERVATIONS FOR ADMIN
app.get("/admin/reservations", asyncRoute(async (req, res) => {
  const [reservations] = await db.execute(`
    SELECT r.reservation_id, r.confirmation_code, r.attendee_name, r.attendee_email,
           r.status, r.reserved_at, COALESCE(e.title, r.event_title_snapshot) AS event_title,
           COALESCE(SUM(ri.quantity), 0) AS ticket_count,
           COALESCE(SUM(ri.quantity * ri.unit_price), 0) AS total_cost
    FROM reservations r LEFT JOIN events e ON e.event_id = r.event_id
    LEFT JOIN reservation_items ri ON ri.reservation_id = r.reservation_id
    GROUP BY r.reservation_id ORDER BY r.reserved_at DESC
  `);
  res.render("admin-reservations", { reservations });
}));

// OPEN THE RESERVATION DELETE CONFIRMATION PAGE
app.get("/admin/reservations/:id/delete", asyncRoute(async (req, res) => {
  const reservationId = toId(req.params.id);
  const [rows] = reservationId ? await db.execute(`
    SELECT r.reservation_id, r.confirmation_code, r.attendee_name,
           COALESCE(e.title, r.event_title_snapshot) AS event_title
    FROM reservations r LEFT JOIN events e ON e.event_id = r.event_id
    WHERE r.reservation_id = ?
  `, [reservationId]) : [[]];
  if (!rows.length) return res.status(404).render("message", { title: "Reservation not found", message: "That reservation could not be found.", backLink: "/admin/reservations", backText: "Back to reservations" });
  res.render("reservation-delete", { reservation: rows[0] });
}));

// DELETE A RESERVATION AND RETURN TO THE ADMIN LIST
app.post("/admin/reservations/:id/delete", asyncRoute(async (req, res) => {
  const reservationId = toId(req.params.id);
  if (!reservationId) return res.status(404).render("message", { title: "Reservation not found", message: "That reservation could not be found.", backLink: "/admin/reservations", backText: "Back to reservations" });
  const [result] = await db.execute("DELETE FROM reservations WHERE reservation_id = ?", [reservationId]);
  if (!result.affectedRows) return res.status(404).render("message", { title: "Reservation not found", message: "That reservation could not be found.", backLink: "/admin/reservations", backText: "Back to reservations" });
  res.redirect("/admin/reservations");
}));

// SHOW A PAGE NOT FOUND MESSAGE FOR UNKNOWN URLS
app.use((req, res) => res.status(404).render("message", {
  title: "Page not found", message: "The page you requested could not be found.", backLink: "/", backText: "Back to events"
}));

// HANDLE UNEXPECTED APPLICATION ERRORS
app.use((error, req, res, next) => {
  console.error(error);
  if (res.headersSent) return next(error);
  res.status(error.status || 500).render("message", {
    title: error.status ? "Request could not be completed" : "Something went wrong",
    message: error.status ? error.message : "The request could not be completed. Please try again or contact the event organizer.",
    backLink: req.get("referer") || "/",
    backText: "Go back"
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
