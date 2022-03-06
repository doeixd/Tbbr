
// chrome.action.onClicked.addListener((tab) => {
//   chrome.scripting.executeScript({
//     target: { tabId: tab.id },
//     func: contentScriptFunc,
//     args: ['action'],
//   });
// });

// function contentScriptFunc(name) {
//   console.log(`"${name}" executed`);
// }

const listOfLetters = ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';', 'u', 'i', 'o', 'p', 'n', 'm', ',', '.', 'q', 'w', 'e', 'r', 't', 'y', 'b', 'v', 'c', 'x', 'z']

chrome.commands.onCommand.addListener((command) => {
  console.log(`Command: ${command}`);
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
            focus.style.setProperty('opacity', '0');
            focus.style.setProperty('position', 'fixed');
            focus.style.setProperty('top', '50%');
            document.querySelector('body').appendChild(focus)
            focus.focus()
            document.addEventListener('keypress', (e) => {
              console.log(e.key);
              const listOfLetters = ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';', 'u', 'i', 'o', 'p', 'n', 'm', ',', '.', 'q', 'w', 'e', 'r', 't', 'y', 'b', 'v', 'c', 'x', 'z']
              if (listOfLetters.includes(e.key)) {
                console.log('ran')
                focus.blur()
                focus.remove()
                // document.querySelector('body').removeChild(focus)
                var exID = 'bmfpidchefcdkdakhopcmakmemocchhl'
                chrome.runtime.sendMessage("bmfpidchefcdkdakhopcmakmemocchhl", { key: e.key })
                window.postMessage({ key: e.key, type: "FROM_PAGE" }, "*")
              }
            }, { once: true })
          }
        });
      }
      const title = listOfLetters[tab.index] ?? tab.index;
      console.log({ tab })
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
  console.log(key, 'wizkalifa', listOfLetters.indexOf(key));

  if (listOfLetters.indexOf(key) > -1) {
    chrome.tabs.query({ index: listOfLetters.indexOf(key) }, (tabs) => {
      chrome.tabs.update(tabs[0].id, { active: true, highlighted: true });
    })
  }
});



