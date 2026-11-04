# MoodMove

A workout-suggestion website with registration, login (sessions), a `/profile` page and `/logout`.

# How to run

1. Install the packages: `npm install`
2. Create the MySQL database `moodmove` and its tables (`users`, `workout_types`, `workouts`, `swipes`).
3. Give the server the database password in ONE of these ways:
   - **A:** copy `db-config.example.js` to `db-config.js` and fill in your MySQL password.
   - **B:** set environment variables before starting the server:
     `ROOTPASS` (MySQL root password) and `SESSION_SECRET` (any long phrase).
4. Start the server: `node server.js`
5. Open http://localhost:3000/register.html

# Endpoints

| Endpoint | What it does |
|----------|--------------|
| `POST /register` | Creates the account and responds "You have successfully registered." with a link to `login.html` |
| `POST /login` | Responds "You have logged in successfully." (and stores the user in the session) or "Your login credentials were incorrect." |
| `GET /profile` | Shows the username and email saved in the session (login required) |
| `GET /logout` | Destroys the session |
