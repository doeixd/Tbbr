window.addEventListener('message', function(event) {
  if ((event?.data?.type === "FROM_PAGE" || event?.data?.type === "PICKED") && typeof chrome?.app?.isInstalled !== 'undefined') {
    chrome.runtime.sendMessage(event.data);
  }
})


window.addEventListener('picked', function(event) {
  document.title = document.oldTitle;
  chrome.runtime.sendMessage({ type: "picked" });
})
