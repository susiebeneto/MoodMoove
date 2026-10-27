// Swipe screen: shows one workout at a time. Like or skip is saved in the database.

const area = document.querySelector("#card_area");
const like_btn = document.querySelector("#like_btn");
const skip_btn = document.querySelector("#skip_btn");
const matches_list = document.querySelector("#matches");

let current = null;   // the workout on screen
let busy = false;     // stops double clicks while saving

// Sends the user to log in if the server says they are not logged in
function check_login(response)
{
  if(response.status === 401)
  {
    window.location.href = "/login.html?error=needlogin";
    return null;
  }
  return response.json();
}

function dots(level)
{
  return "●".repeat(level) + "○".repeat(5 - level);
}

function set_buttons(enabled)
{
  like_btn.disabled = !enabled;
  skip_btn.disabled = !enabled;
}

function show_message_card(text)
{
  area.textContent = "";
  const box = document.createElement("div");
  box.className = "card";
  const p = document.createElement("p");
  p.textContent = text;
  box.appendChild(p);
  area.appendChild(box);
  set_buttons(false);
}

function show_card(workout)
{
  current = workout;
  area.textContent = "";

  const card = document.createElement("div");
  card.className = "card swipe-card";
  card.id = "swipe_card";

  const title = document.createElement("h3");
  title.textContent = workout.title;

  const desc = document.createElement("p");
  desc.textContent = workout.description || "";

  const info = document.createElement("p");
  info.className = "card-info";
  info.textContent = workout.type + " · " + workout.duration_min + " min · intensity " +
    dots(workout.intensity);

  card.appendChild(title);
  card.appendChild(desc);
  card.appendChild(info);
  area.appendChild(card);

  set_buttons(true);
  busy = false;
  enable_drag(card);
}

function load_next()
{
  fetch("/api/next-workout")
    .then(check_login)
    .then(function(data)
    {
      if(!data) return;
      if(data.workout)
        show_card(data.workout);
      else
        show_message_card("You have seen every workout for today. Come back tomorrow!");
    })
    .catch(function()
    {
      show_message_card("Could not load workouts. Is the server running?");
    });
}

function load_matches()
{
  fetch("/api/matches")
    .then(check_login)
    .then(function(data)
    {
      if(!data) return;
      matches_list.textContent = "";
      if(data.matches.length === 0)
      {
        const li = document.createElement("li");
        li.textContent = "No matches yet. Like a workout to add it here.";
        matches_list.appendChild(li);
        return;
      }
      data.matches.forEach(function(m)
      {
        const li = document.createElement("li");
        li.textContent = m.title + " (" + m.type + ", " + m.duration_min + " min)";
        matches_list.appendChild(li);
      });
    });
}

// action is "like" or "skip"
function swipe(action)
{
  if(busy || !current) return;
  busy = true;
  set_buttons(false);

  const card = document.querySelector("#swipe_card");
  card.style.transform = "";
  card.classList.add(action === "like" ? "fly-right" : "fly-left");

  fetch("/api/swipe",
  {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({workout_id: current.id, action: action})
  })
    .then(check_login)
    .then(function(data)
    {
      if(!data) return;
      setTimeout(function()
      {
        load_next();
        load_matches();
      }, 300);
    })
    .catch(function()
    {
      show_message_card("Could not save your swipe. Please try again.");
    });
}

// Drag the card left or right with a finger or the mouse
function enable_drag(card)
{
  let start_x = null;

  card.addEventListener("pointerdown", function(event)
  {
    if(busy) return;
    start_x = event.clientX;
    card.setPointerCapture(event.pointerId);
    card.classList.add("dragging");
  });

  card.addEventListener("pointermove", function(event)
  {
    if(start_x === null) return;
    const dx = event.clientX - start_x;
    card.style.transform = "translateX(" + dx + "px) rotate(" + (dx / 20) + "deg)";
  });

  function release(event)
  {
    if(start_x === null) return;
    const dx = event.clientX - start_x;
    start_x = null;
    card.classList.remove("dragging");
    if(dx > 100)
      swipe("like");
    else if(dx < -100)
      swipe("skip");
    else
      card.style.transform = "";
  }
  card.addEventListener("pointerup", release);
  card.addEventListener("pointercancel", release);
}

like_btn.addEventListener("click", function() { swipe("like"); });
skip_btn.addEventListener("click", function() { swipe("skip"); });

document.addEventListener("keydown", function(event)
{
  if(event.key === "ArrowRight") swipe("like");
  if(event.key === "ArrowLeft") swipe("skip");
});

set_buttons(false);
load_next();
load_matches();
