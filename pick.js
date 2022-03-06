window.addEventListener('message', function(event) {
  if (event?.data?.type === "FROM_PAGE" && typeof chrome.app.isInstalled !== 'undefined') {
    chrome.runtime.sendMessage(event.data);
  }
})

