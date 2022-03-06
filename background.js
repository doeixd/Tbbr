const listOfLetters = ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';', 'u', 'i', 'o', 'p', 'n', 'm', ',', '.', 'q', 'w', 'e', 'r', 't', 'y', 'b', 'v', 'c', 'x', 'z']

chrome.commands.onCommand.addListener((command) => {
  if (!(command == 'pick')) return
  chrome.tabs.query({ currentWindow: true }, (tabList) => {
    if (!tabList.length) return;
    tabList.forEach((tab) => {
      if (tab.active) {
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          args: [listOfLetters],
          func: function(listOfLetters) {
            const focus = document.createElement('input')
            focus.style.cssText += `position:fixed;opacity:0;top:50%;`


            document.querySelector('body').appendChild(focus)
            focus.focus()

            const tID = setTimeout(() => focus.removeEventListener('keydown', listenForKey), 5001)

            function listenForKey(e) {
              if (listOfLetters.includes(e.key)) {
                focus.blur()
                focus.remove()
                var exID = 'bmfpidchefcdkdakhopcmakmemocchhl'
                chrome.runtime.sendMessage("bmfpidchefcdkdakhopcmakmemocchhl", { key: e.key })
                window.postMessage({ key: e.key, type: "FROM_PAGE" }, "*")
                clearTimeout(tID)
              }
            }
            document.addEventListener('keypress', listenForKey, { once: true })
          }
        });
      }
      const title = listOfLetters[tab.index] ?? tab.index;
      chrome.scripting.executeScript(
        {
          func: function(title) {
            var old = document.title;
            document.title = title;
            setTimeout(function() {
              document.title = old;
            }, 3000);
          },
          args: [title],
          target: {
            tabId: tab.id,
            allFrames: true,
          }
        }
      );
    });
  });
})

chrome.tabs.onActivated.addListener(activeInfo => move(activeInfo));

async function move(activeInfo) {
  let current = activeInfo.tabId;
  console.log(current);
  try {
    setTimeout(async () => {
      const [next] = await chrome.tabs.query({ currentWindow: true, active: true })
      console.log({ next })
      if (current === next.id) {
        chrome.tabs.move(current, { index: 0 });
      }
    }, 5000);
    console.log('Success.');
  } catch (error) {
    if (error == 'Error: Tabs cannot be edited right now (user may be dragging a tab).') {
      setTimeout(() => move(activeInfo), 50);
    }
  }
}

chrome.runtime.onMessageExternal.addListener(({ key }) => {
  console.log(key, 'wiz');
  if (listOfLetters.indexOf(key) > -1) {
    chrome.tabs.update(listOfLetters.indexOf(key), { active: true });
  }
});
chrome.runtime.onMessage.addListener(({ key }) => {
  if (listOfLetters.indexOf(key) > -1) {
    chrome.tabs.query({ index: listOfLetters.indexOf(key) }, (tabs) => {
      chrome.tabs.update(tabs[0].id, { active: true, highlighted: true });
    })
  }
});



