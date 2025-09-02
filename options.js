// Saves options to chrome.storage.
function save_options() {
  const delay = document.getElementById('delay').value;
  const autoCloseEnabled = document.getElementById('autoCloseEnabled').checked;
  const autoCloseTime = document.getElementById('autoCloseTime').value;

  chrome.storage.sync.set({
    delay: delay,
    autoCloseEnabled: autoCloseEnabled,
    autoCloseTime: autoCloseTime
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
  // Use default values.
  chrome.storage.sync.get({
    delay: 5,
    autoCloseEnabled: false,
    autoCloseTime: 60
  }, function(items) {
    document.getElementById('delay').value = items.delay;
    document.getElementById('autoCloseEnabled').checked = items.autoCloseEnabled;
    document.getElementById('autoCloseTime').value = items.autoCloseTime;
  });
}

document.addEventListener('DOMContentLoaded', restore_options);
document.getElementById('delay').addEventListener('change', save_options);
document.getElementById('autoCloseEnabled').addEventListener('change', save_options);
document.getElementById('autoCloseTime').addEventListener('change', save_options);
