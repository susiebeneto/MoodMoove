const express = require("express");   // imports express
const session = require("express-session"); // remembers who is logged in
const bcrypt = require("bcrypt");     // stores passwords encrypted
const mysql = require("mysql2");      // same package used in class
const config = require("./db-config");

const app = express();
app.use(express.urlencoded({extended: true})); // reads data sent by HTML forms (req.body)
app.use(express.json());
app.use(session({
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false
}));
app.use(express.static("public"));    // pages live in the public folder

const conn = mysql.createConnection(config.database);
conn.connect(function(err)
{
  if(err)
    console.log("Couldnt connect to MySQL", err);
  else
    console.log("Database connection established");
});

// Makes text safe to place inside HTML
function esc(text)
{
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ---------- REGISTER ----------
app.post("/register", function(req, res)
{
  const username = (req.body.username || "").trim();
  const email = (req.body.email || "").trim().toLowerCase();
  const password = req.body.password || "";
  const confirm = req.body.confirm || "";

  if(!/^[A-Za-z0-9_]{3,30}$/.test(username))
    return res.redirect("/register.html?error=username");
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 100)
    return res.redirect("/register.html?error=email");
  if(password.length < 8)
    return res.redirect("/register.html?error=short");
  if(password !== confirm)
    return res.redirect("/register.html?error=match");

  // ? placeholders help prevent sql injection
  conn.query("SELECT id FROM users WHERE username = ? OR email = ?",
    [username, email], function(err, rows)
  {
    if(err)
    {
      console.log("there was an error in your query", err);
      return res.redirect("/register.html?error=server");
    }
    if(rows.length > 0)
      return res.redirect("/register.html?error=taken");

    bcrypt.hash(password, 10, function(err, hash)
    {
      if(err)
        return res.redirect("/register.html?error=server");

      // a javascript object holds the column names and values
      const user = {username: username, email: email, password_hash: hash};
      conn.query("INSERT INTO users SET ?", user, function(err, result)
      {
        if(err)
        {
          if(err.code === "ER_DUP_ENTRY")
            return res.redirect("/register.html?error=taken");
          console.log("there was an error in your insert", err);
          return res.redirect("/register.html?error=server");
        }
        res.redirect("/login.html?registered=1");
      });
    });
  });
});

// ---------- LOGIN ----------
app.post("/login", function(req, res)
{
  const who = (req.body.who || "").trim();   // username or email
  const password = req.body.password || "";

  conn.query("SELECT id, username, password_hash FROM users WHERE username = ? OR email = ?",
    [who, who.toLowerCase()], function(err, rows)
  {
    if(err)
    {
      console.log("there was an error in your query", err);
      return res.redirect("/login.html?error=server");
    }
    if(rows.length === 0)
      return res.redirect("/login.html?error=invalid");

    bcrypt.compare(password, rows[0].password_hash, function(err, same)
    {
      if(err || !same)
        return res.redirect("/login.html?error=invalid");

      req.session.userId = rows[0].id;
      req.session.username = rows[0].username;
      res.redirect("/dashboard");
    });
  });
});

// ---------- LOGOUT ----------
app.get("/logout", function(req, res)
{
  req.session.destroy(function()
  {
    res.redirect("/login.html?loggedout=1");
  });
});

// Lets the pages ask "who is logged in?"
app.get("/api/me", function(req, res)
{
  if(req.session.userId)
    res.json({loggedIn: true, username: req.session.username});
  else
    res.json({loggedIn: false});
});

// ---------- DASHBOARD (only for logged in users) ----------
app.get("/dashboard", function(req, res)
{
  if(!req.session.userId)
    return res.redirect("/login.html?error=needlogin");

  const sql = "SELECT w.title, w.description, w.duration_min, w.intensity, t.name AS type " +
    "FROM workouts w INNER JOIN workout_types t ON w.type_id = t.id " +
    "WHERE w.created_by IS NULL ORDER BY RAND() LIMIT 1";

  conn.query(sql, function(err, rows)
  {
    if(err)
    {
      console.log("there was an error in your query", err);
      return res.send("<p>Something went wrong. Try again.</p>");
    }

    let suggestion = "<p>No workouts yet.</p>";
    if(rows.length > 0)
    {
      const w = rows[0];
      suggestion = "<div class='card'>" +
        "<h3>" + esc(w.title) + "</h3>" +
        "<p>" + esc(w.description) + "</p>" +
        "<p><strong>" + esc(w.type) + "</strong> &middot; " + esc(w.duration_min) +
        " min &middot; intensity " + esc(w.intensity) + "/5</p></div>";
    }

    res.send(
      "<!DOCTYPE html><html lang='en'><head><meta charset='UTF-8' />" +
      "<meta name='viewport' content='width=device-width, initial-scale=1' />" +
      "<title>Dashboard &middot; MoodMove</title>" +
      "<link rel='stylesheet' href='/css/styles.css' /></head><body>" +
      "<h1 class='logo'>MoodMove</h1>" +
      "<p class='menu'><a href='/index.html'>Home</a> | <a href='/about.html'>About</a> | " +
      "<a href='/swipe.html'>Swipe</a> | " +
      "<a href='/logout'>Log out</a></p>" +
      "<p class='theme-toggle-wrap'><button id='theme_toggler' type='button'>Dark mode</button></p>" +
      "<h2>Hi, " + esc(req.session.username) + "!</h2>" +
      "<p style='text-align:center'>Today's suggested workout:</p>" +
      suggestion +
      "<p class='menu'><a href='/swipe.html'>Not feeling it? Swipe through more workouts</a></p>" +
      "<script src='/js/theme.js'></script></body></html>"
    );
  });
});

// ---------- SWIPE ----------
// Used by the API routes: answers 401 if nobody is logged in
function requireLogin(req, res, next)
{
  if(!req.session.userId)
    return res.status(401).json({error: "login"});
  next();
}

// Next workout this user has not swiped on today
app.get("/api/next-workout", requireLogin, function(req, res)
{
  const sql = "SELECT w.id, w.title, w.description, w.duration_min, w.intensity, t.name AS type " +
    "FROM workouts w INNER JOIN workout_types t ON w.type_id = t.id " +
    "WHERE (w.created_by IS NULL OR w.created_by = ?) " +
    "AND w.id NOT IN (SELECT workout_id FROM swipes WHERE user_id = ? AND swiped_on = CURDATE()) " +
    "ORDER BY RAND() LIMIT 1";

  conn.query(sql, [req.session.userId, req.session.userId], function(err, rows)
  {
    if(err)
    {
      console.log("there was an error in your query", err);
      return res.status(500).json({error: "server"});
    }
    res.json({workout: rows.length > 0 ? rows[0] : null});
  });
});

// Save a like or a skip
app.post("/api/swipe", requireLogin, function(req, res)
{
  const workoutId = parseInt(req.body.workout_id, 10);
  const action = req.body.action;

  if(!workoutId || (action !== "like" && action !== "skip"))
    return res.status(400).json({error: "bad request"});

  conn.query("INSERT INTO swipes (user_id, workout_id, action, swiped_on) VALUES (?, ?, ?, CURDATE())",
    [req.session.userId, workoutId, action], function(err, result)
  {
    if(err)
    {
      if(err.code === "ER_DUP_ENTRY")        // already swiped today: not a problem
        return res.json({ok: true});
      if(err.code === "ER_NO_REFERENCED_ROW_2")  // that workout does not exist
        return res.status(400).json({error: "bad request"});
      console.log("there was an error in your insert", err);
      return res.status(500).json({error: "server"});
    }
    res.json({ok: true});
  });
});

// Workouts this user liked today
app.get("/api/matches", requireLogin, function(req, res)
{
  const sql = "SELECT w.id, w.title, w.duration_min, w.intensity, t.name AS type " +
    "FROM swipes s INNER JOIN workouts w ON s.workout_id = w.id " +
    "INNER JOIN workout_types t ON w.type_id = t.id " +
    "WHERE s.user_id = ? AND s.action = 'like' AND s.swiped_on = CURDATE() " +
    "ORDER BY s.id DESC";

  conn.query(sql, [req.session.userId], function(err, rows)
  {
    if(err)
    {
      console.log("there was an error in your query", err);
      return res.status(500).json({error: "server"});
    }
    res.json({matches: rows});
  });
});

// Start the web server
app.listen(3000, function()
{
  console.log("Listening on port 3000...");
});
