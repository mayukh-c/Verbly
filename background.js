// Verbly v1 | background service worker.
// Its only job: open the Verbly side panel when the toolbar icon (or Alt+Shift+V) is used.
function init() {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((e) => console.error('sidePanel behavior failed', e));
}
chrome.runtime.onInstalled.addListener(init);
chrome.runtime.onStartup.addListener(init);
