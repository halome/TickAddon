// Entries are submitted here so that closing the popup doesn't interrupt the job.
// Progress is written to chrome.storage.session under the "job" key.
import { TickClient } from './api.js';

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'submit') {
    submit(msg.payload);
    sendResponse({ ok: true });
  }
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function submit({ dates, taskId, hours, notes }) {
  const { auth } = await chrome.storage.local.get('auth');
  const client = new TickClient(auth);
  const job = { running: true, total: dates.length, results: [] };
  await chrome.storage.session.set({ job });

  for (const date of dates) {
    try {
      const entry = await client.createEntry({ date, hours, notes, taskId });
      job.results.push({ date, ok: true });
      // Remember our own user_id so the popup can show hours already logged.
      if (entry?.user_id && auth.userId !== entry.user_id) {
        auth.userId = entry.user_id;
        await chrome.storage.local.set({ auth });
      }
    } catch (e) {
      job.results.push({ date, ok: false, error: e.message });
    }
    await chrome.storage.session.set({ job });
    await sleep(150);
  }

  job.running = false;
  await chrome.storage.session.set({ job });
}
