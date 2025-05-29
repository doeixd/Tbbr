// Add event listener for mouseenter
document.body.addEventListener('mouseenter', () => {
  chrome.runtime.sendMessage({ type: "mouse_enter" });
});

// Add event listener for mouseleave
document.body.addEventListener('mouseleave', () => {
  chrome.runtime.sendMessage({ type: "mouse_leave" });
});
