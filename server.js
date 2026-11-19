require("dotenv").config();

const express = require("express");
const path = require("path");
const db = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;

app.set("view engine", "ejs");
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/", async (req, res) => {
  const category = req.query.category || "";
  const eventDate = req.query.eventDate || "";

  const conditions = ["e.status = 'Published'"];
  const values = [];

  if (category) {
    conditions.push("e.category = ?");
    values.push(category);
  }

  if (eventDate) {
    conditions.push("DATE(e.start_datetime) = ?");
    values.push(eventDate);
  }

  const eventsSql = `
    SELECT
      e.event_id,
      e.title,
      e.category,
      e.description,
      e.start_datetime,
      e.venue_name,
      e.capacity,
      COALESCE(ticket_prices.starting_price, 0) AS starting_price
    FROM events e
    LEFT JOIN (
      SELECT event_id, MIN(price) AS starting_price
      FROM ticket_types
      GROUP BY event_id
    ) AS ticket_prices ON ticket_prices.event_id = e.event_id
    WHERE ${conditions.join(" AND ")}
    ORDER BY e.start_datetime
  `;

  try {
    const [events] = await db.execute(eventsSql, values);
    const [categories] = await db.execute(`
      SELECT DISTINCT category
      FROM events
      WHERE status = 'Published'
      ORDER BY category
    `);

    res.render("events", {
      events,
      categories,
      filters: { category, eventDate },
      error: null
    });
  } catch (error) {
    console.error(error);

    res.status(500).render("events", {
      events: [],
      categories: [],
      filters: { category, eventDate },
      error: "Events could not be loaded. Check the database connection."
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});