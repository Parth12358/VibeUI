// Service worker: coordinates popup <-> offscreen (audio playback) <-> content scripts (effects).

const trippingTabs = new Set();

async function ensureOffscreen() {
  const contexts = await chrome.runtime.getContexts?.({ contextTypes: ["OFFSCREEN_DOCUMENT"] }).catch(() => []);
  if (contexts && contexts.length) return;
  await chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: ["AUDIO_PLAYBACK"],
    justification: "Play a bundled song and analyze it to drive beat-reactive visual effects",
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "START") {
    (async () => {
      try {
        await chrome.storage.local.set({ enabled: true, songId: msg.songId ?? "clarity" });
        await ensureOffscreen();
        chrome.runtime.sendMessage({ type: "OFFSCREEN_START", songId: msg.songId ?? "clarity" }).catch(() => {});
        const tabs = await chrome.tabs.query({});
        chrome.storage.local.get({ intensity: 7 }, (s) => {
          for (const t of tabs) {
            if (t.id != null) chrome.tabs.sendMessage(t.id, { type: "VIBE_START", intensity: s.intensity }).catch(() => {});
          }
        });
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
      }
    })();
    return true;
  }

  if (msg.type === "STOP") {
    (async () => {
      await chrome.storage.local.set({ enabled: false });
      chrome.runtime.sendMessage({ type: "OFFSCREEN_STOP" }).catch(() => {});
      const tabs = await chrome.tabs.query({});
      for (const t of tabs) {
        if (t.id != null) chrome.tabs.sendMessage(t.id, { type: "VIBE_STOP" }).catch(() => {});
      }
      trippingTabs.clear();
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (msg.type === "REGISTER") {
    if (sender.tab?.id != null) trippingTabs.add(sender.tab.id);
    // If enabled but audio isn't running yet (e.g. after a browser restart), (re)start it.
    chrome.storage.local.get({ enabled: false, songId: "clarity" }, (s) => {
      if (s.enabled) {
        ensureOffscreen().then(() => chrome.runtime.sendMessage({ type: "OFFSCREEN_START", songId: s.songId }).catch(() => {}));
      }
    });
    return true;
  }

  if (msg.type === "UNREGISTER") {
    if (sender.tab?.id != null) trippingTabs.delete(sender.tab.id);
  }

  if (msg.type === "FRAME") {
    for (const id of trippingTabs) {
      chrome.tabs.sendMessage(id, { type: "VIBE_FRAME", data: msg.data }).catch(() => {});
    }
  }

  if (msg.type === "ERROR") {
    for (const id of trippingTabs) {
      chrome.tabs.sendMessage(id, { type: "VIBE_ERROR", error: msg.error }).catch(() => {});
    }
  }
});
