// Saves options to chrome.storage.
function save_options() {
  const delay = document.getElementById('delay').value;
  const autoCloseEnabled = document.getElementById('autoCloseEnabled').checked;
  const autoCloseTime = document.getElementById('autoCloseTime').value;
  const cycleTimeout = document.getElementById('cycleTimeout').value;
  const skipPinned = document.getElementById('skipPinned').checked;
  const isActiveDelay = document.getElementById('isActiveDelay').value;
  const warningTime = document.getElementById('warningTime').value;
  const autoCloseWhitelist = document.getElementById('autoCloseWhitelist').value
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean);

  chrome.storage.sync.set({
    delay: delay,
    autoCloseEnabled: autoCloseEnabled,
    autoCloseTime: autoCloseTime,
    cycleTimeout: cycleTimeout,
    skipPinned: skipPinned,
    isActiveDelay: isActiveDelay,
    warningTime: warningTime,
    autoCloseWhitelist: autoCloseWhitelist
  }, function() {
    // Update status to let user know options were saved.
    const status = document.getElementById('status');
    status.textContent = 'Options saved.';
    status.classList.add('visible');
    setTimeout(function() {
      status.classList.remove('visible');
    }, 1500);
  });
}

// Restores input value using the preferences stored in chrome.storage.
function restore_options() {
  // Use default values.
  chrome.storage.sync.get({
    delay: 5,
    autoCloseEnabled: false,
    autoCloseTime: 60,
    cycleTimeout: 3,
    skipPinned: true,
    isActiveDelay: 0,
    warningTime: 5,
    autoCloseWhitelist: []
  }, function(items) {
    document.getElementById('delay').value = items.delay;
    document.getElementById('autoCloseEnabled').checked = items.autoCloseEnabled;
    document.getElementById('autoCloseTime').value = items.autoCloseTime;
    document.getElementById('cycleTimeout').value = items.cycleTimeout;
    document.getElementById('skipPinned').checked = items.skipPinned;
    document.getElementById('isActiveDelay').value = items.isActiveDelay;
    document.getElementById('warningTime').value = items.warningTime;
    document.getElementById('autoCloseWhitelist').value = items.autoCloseWhitelist.join('\n');
  });
}

document.addEventListener('DOMContentLoaded', restore_options);

// Add event listeners to all options
const optionIds = [
    'delay', 'autoCloseEnabled', 'autoCloseTime',
    'cycleTimeout', 'skipPinned', 'isActiveDelay', 'warningTime',
    'autoCloseWhitelist'
];

optionIds.forEach(id => {
    document.getElementById(id).addEventListener('change', save_options);
});
