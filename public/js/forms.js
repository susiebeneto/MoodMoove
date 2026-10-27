// Shows messages on the register and login pages.
// The server redirects with a query string such as ?error=taken,
// and this file turns that into a message in <div id="message">.

const message_box = document.querySelector("#message");
const params = new URLSearchParams(window.location.search);

const error_messages = {
  username: "Username must be 3-30 characters: letters, numbers and underscores only.",
  email: "Please enter a valid email address.",
  short: "Password must be at least 8 characters.",
  match: "The two passwords do not match.",
  taken: "That username or email is already registered.",
  invalid: "The login credentials were incorrect.",
  needlogin: "Please log in first.",
  server: "Something went wrong on the server. Please try again."
};

function show_message(text, kind)
{
  if(!message_box) return;
  message_box.textContent = text;
  message_box.className = kind;   // "error" or "ok" (styled in styles.css)
}

const error = params.get("error");

if(error)
  show_message(error_messages[error] || "Something went wrong. Please try again.", "error");
else if(params.get("loggedout"))
  show_message("You have logged out.", "ok");
else if(params.get("registered"))
  show_message("You have successfully registered. You can log in now.", "ok");
