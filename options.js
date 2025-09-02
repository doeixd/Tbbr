// Saves options to chrome.storage.
function save_options() {
  const delay = document.getElementById('delay').value;
  chrome.storage.sync.set({
    delay: delay
  }, function() {
    // Update status to let user know options were saved.
    const status = document.getElementById('status');
    status.textContent = 'Options saved.';
    setTimeout(function() {
      status.textContent = '';
    }, 750);
  });
}

// Restores input value using the preferences stored in chrome.storage.
function restore_options() {
  // Use default value delay = 5.
  chrome.storage.sync.get({
    delay: 5
  }, function(items) {
    document.getElementById('delay').value = items.delay;
  });
}

document.addEventListener('DOMContentLoaded', restore_options);
document.getElementById('delay').addEventListener('change', save_options);
