const btn = document.getElementById("toggle");
const slider = document.getElementById("intensity");
const songSel = document.getElementById("song");
const status = document.getElementById("status");

function render(enabled) {
  btn.textContent = enabled ? "Stop trip" : "Start trip";
  btn.classList.toggle("on", enabled);
}

SONGS.forEach((s) => {
  const o = document.createElement("option");
  o.value = s.id;
  o.textContent = s.title;
  songSel.appendChild(o);
});

chrome.storage.local.get({ enabled: false, intensity: 7, songId: SONGS[0].id }, (s) => {
  slider.value = s.intensity;
  songSel.value = s.songId;
  render(s.enabled);
});

slider.addEventListener("input", () => {
  chrome.storage.local.set({ intensity: Number(slider.value) });
});

songSel.addEventListener("change", () => {
  chrome.storage.local.set({ songId: songSel.value });
});

btn.addEventListener("click", () => {
  chrome.storage.local.get({ enabled: false }, (s) => {
    const next = !s.enabled;
    chrome.storage.local.set({ enabled: next });
    render(next);
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      chrome.runtime.sendMessage(
        { type: next ? "START" : "STOP", tabId: tab?.id, songId: songSel.value },
        (resp) => {
          if (chrome.runtime.lastError) {
            status.textContent = "Error: " + chrome.runtime.lastError.message;
          } else if (resp && resp.ok === false) {
            status.textContent = "Error: " + resp.error;
          } else {
            status.textContent = next ? "Tripping this tab." : "Stopped.";
          }
        },
      );
    });
  });
});
