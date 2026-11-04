const express = require("express");          // imports express 
const session = require("express-session");  // remembers who is logged in
const crypt = require("crypto");             // used to hash passwords (I changed this to look like Dr. James' example)
const mysql = require("mysql2");             // same package used in class
const config = require("./db-config");       // database info + session secret

const app = express();

// ---------- PASSWORD HASHING SETTINGS ----------
const hashRounds = 100;   // number of iterations
const hashLength = 64;    // length of the hash in bytes
const salt = "salt";      // fixed salt added to every password before hashing

// Turns a plain password into a hash 
function hashPassword(plainPass)
{
  return crypt.pbkdf2Sync(plainPass, salt, hashRounds, hashLength, "sha512").toString("hex");
}

// Reads the data sent by HTML forms and puts it in req.body
app.use(express.urlencoded({extended: true}));
app.use(express.json());

// ---------- SESSION SETUP ----------
// The data we store in req.session (userId, username, email) stays on the server and is linked to that cookie, so it is remembered between pages.
app.use(session({
  secret: config.sessionSecret,   // used to sign the session cookie
  resave: false,                  // do not save the session if nothing changed
  saveUninitialized: false,       // do not create sessions for visitors who never log in
  cookie: {
    maxAge: 60000 * 60,           // cookie expires after 1 hour (in milliseconds)
    httpOnly: true,               // JavaScript in the browser cannot read the cookie (protects against XSS)
    secure: false                 // set to true only when the site uses HTTPS
  }
}));

app.use(express.static("public"));

// ---------- DATABASE CONNECTION ----------
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

// Middleware for HTML pages: if nobody is logged in, send them to the login page.

function requirePageLogin(req, res, next)
{
  if(!req.session.userId)
    return res.redirect("/login.html?error=needlogin");
  next();
}

// ---------- REGISTER ----------
// ---------- REGISTER ----------
// The form in register.html sends a POST request here
app.post("/register", function(req, res)
{
  // Read the form fields (name="..." in the HTML) and clean them up
  const username = (req.body.username || "").trim();
  const email = (req.body.email || "").trim().toLowerCase();
  const password = req.body.password || "";
  const confirm = req.body.confirm || "";

  // Validation: on a problem, go back to the form with an error code
  // (js/forms.js turns the code into a message)
  if(!/^[A-Za-z0-9_]{3,30}$/.test(username))
    return res.redirect("/register.html?error=username");
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 100)
    return res.redirect("/register.html?error=email");
  if(password.length < 8)
    return res.redirect("/register.html?error=short");
  if(password !== confirm)
    return res.redirect("/register.html?error=match");

  // Check that the username or email is not already used.
  // The ? placeholders help prevent SQL injection.
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

    // Never store the real password: store a hash of it
    const hash = hashPassword(password);

    // A javascript object holds the column names and values
    const user = {username: username, email: email, password_hash: hash};
    conn.query("INSERT INTO users SET ?", user, function(err, result)
    {
      if(err)
      {
        if(err.code === "ER_DUP_ENTRY")   // someone registered the same name at the same time
          return res.redirect("/register.html?error=taken");
        console.log("there was an error in your insert", err);
        return res.redirect("/register.html?error=server");
      }
      // Success: go to the login page, which shows "You have successfully registered"
      // (the message is displayed by js/forms.js and the page has the login link/form)
      res.redirect("/login.html?registered=1");
    });
  });
});

// ---------- LOGIN ----------
// The form in login.html sends a POST request here
app.post("/login", function(req, res)
{
  const who = (req.body.who || "").trim();   // username or email
  const password = req.body.password || "";

  conn.query("SELECT id, username, email, password_hash FROM users WHERE username = ? OR email = ?",
    [who, who.toLowerCase()], function(err, rows)
  {
    if(err)
    {
      console.log("there was an error in your query", err);
      return res.redirect("/login.html?error=server");
    }
    // Same error for every kind of failure (does not reveal which part was wrong).
    // login.html shows "The login credentials were incorrect" with the form again.
    if(rows.length === 0)                    // no such user
      return res.redirect("/login.html?error=invalid");

    // Hash the typed password the same way and compare it with the stored hash
    if(hashPassword(password) !== rows[0].password_hash)   // wrong password
      return res.redirect("/login.html?error=invalid");

    // ---- SESSION VARIABLES ----
    // Login was correct: store the user's data in the session.
    // These values are now available on every later request from this browser.
    req.session.userId = rows[0].id;
    req.session.username = rows[0].username;
    req.session.email = rows[0].email;

    // Go straight to the dashboard; it shows "You have logged in successfully"
    res.redirect("/dashboard?loggedin=1");
  });
});


// ---------- PROFILE (only for logged in users) ----------
// Reads the username and email) from the SESSION variables saved at login, so the user's name can be shown on a page other than the login page.
app.get("/profile", requirePageLogin, function(req, res)
{
  res.send(
    "<!DOCTYPE html><html lang='en'><head><meta charset='UTF-8' />" +
    "<meta name='viewport' content='width=device-width, initial-scale=1' />" +
    "<title>Profile &middot; MoodMove</title>" +
    "<link rel='stylesheet' href='/css/styles.css' /></head><body>" +
    "<h1 class='logo'>MoodMove</h1>" +
    // Menu with the logout link
    "<p class='menu'><a href='/index.html'>Home</a> | <a href='/about.html'>About</a> | " +
    "<a href='/dashboard'>Dashboard</a> | <a href='/swipe.html'>Swipe</a> | " +
    "<a href='/profile'>Profile</a> | <a href='/logout'>Log out</a></p>" +
    "<p class='theme-toggle-wrap'><button id='theme_toggler' type='button'>Dark mode</button></p>" +
    "<h2>Your profile</h2>" +
    "<div class='card'>" +
    // esc() is used because the values come from the user
    "<h3>Welcome, " + esc(req.session.username) + "!</h3>" +
    "<p><strong>Username:</strong> " + esc(req.session.username) + "</p>" +
    "<p><strong>Email:</strong> " + esc(req.session.email) + "</p>" +
    "</div>" +
    "<p class='menu'><a href='/logout'>Log out</a></p>" +
    "<script src='/js/theme.js'></script></body></html>"
  );
});

// ---------- LOGOUT ----------
// Reached when the user clicks a "Log out" link. It destroys the session.
app.get("/logout", function(req, res)
{
  req.session.destroy(function(err)
  {
    res.clearCookie("connect.sid");   // also remove the session cookie from the browser
    res.send("You have been logged out. <a href='/login.html'>Log in again</a>");
  });
});

// Lets the pages ask "who is logged in?" (used by the front end)
app.get("/api/me", function(req, res)
{
  if(req.session.userId)
    res.json({loggedIn: true, username: req.session.username});
  else
    res.json({loggedIn: false});
});

// ---------- DASHBOARD ( will only show for logged in users) ----------
app.get("/dashboard", requirePageLogin, function(req, res)
{
  // One random default workout (created_by IS NULL means "for everyone")
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
      "<a href='/swipe.html'>Swipe</a> | <a href='/profile'>Profile</a> | " +
      "<a href='/logout'>Log out</a></p>" +
      "<p class='theme-toggle-wrap'><button id='theme_toggler' type='button'>Dark mode</button></p>" +
      // Success message, only shown right after logging in (?loggedin=1)
      (req.query.loggedin ? "<div id='message' class='ok'>You have logged in successfully.</div>" : "") +
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
