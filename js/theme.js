// MoodMove dark mode toggle
// Saves the choice in localStorage so it sticks across pages and visits.

const theme_toggler = document.querySelector('#theme_toggler');

function update_button_label() {
  const is_dark = document.body.classList.contains('dark_mode');
  theme_toggler.textContent = is_dark ? 'Light mode' : 'Dark mode';
}

function retrieve_theme() {
  let theme = null;
  try {
    theme = localStorage.getItem('website_theme');
  } catch (e) {}

  // First visit: follow the device's setting
  if (theme === null) {
    const prefers_dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    theme = prefers_dark ? 'dark_mode' : 'default';
  }

  document.body.classList.remove('default', 'dark_mode');
  document.body.classList.add(theme);
  update_button_label();
}

theme_toggler.addEventListener('click', function () {
  document.body.classList.toggle('dark_mode');
  const theme = document.body.classList.contains('dark_mode') ? 'dark_mode' : 'default';
  try {
    localStorage.setItem('website_theme', theme);
  } catch (e) {}
  update_button_label();
});

// Keep other open tabs in sync
window.addEventListener('storage', retrieve_theme);

retrieve_theme();
