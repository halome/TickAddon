// Tick API v2 client: https://github.com/tick/tick-api
const BASE = 'https://www.tickspot.com';

function base64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}

async function parse(res) {
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (res.status === 401) throw new Error('Unauthorized (401) – check your token / credentials.');
    throw new Error(`Tick HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

// Tick API rejects (401) the browser's User-Agent and requires the "App (email)" format.
// fetch() can't set it, so we override it with a DNR rule (dynamic rules survive
// extension reloads, so setting it when settings are saved is enough).
export function setUserAgent(email) {
  return chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [1],
    addRules: [
      {
        id: 1,
        priority: 1,
        action: {
          type: 'modifyHeaders',
          requestHeaders: [{ header: 'user-agent', operation: 'set', value: `TickAddon (${email})` }],
        },
        condition: {
          urlFilter: '||www.tickspot.com/*api/v2/',
          resourceTypes: ['xmlhttprequest'],
        },
      },
    ],
  });
}

// Returns [{ subscription_id, company, api_token }] – one item per company.
export async function fetchRoles(email, password) {
  const res = await fetch(`${BASE}/api/v2/roles.json`, {
    credentials: 'omit',
    headers: { Authorization: `Basic ${base64(`${email}:${password}`)}` },
  });
  return parse(res);
}

export class TickClient {
  constructor({ subscriptionId, apiToken }) {
    this.root = `${BASE}/${subscriptionId}/api/v2`;
    this.apiToken = apiToken;
  }

  async request(path, { method = 'GET', body } = {}) {
    const res = await fetch(`${this.root}${path}`, {
      method,
      credentials: 'omit',
      headers: {
        Authorization: `Token token=${this.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return parse(res);
  }

  // Tick paginates lists (?page=N). Stop when a page brings no new records.
  async paged(path) {
    const byId = new Map();
    const sep = path.includes('?') ? '&' : '?';
    for (let page = 1; page <= 50; page++) {
      const items = await this.request(`${path}${sep}page=${page}`);
      const before = byId.size;
      items.forEach((item) => byId.set(item.id, item));
      if (!items.length || byId.size === before) break;
    }
    return [...byId.values()];
  }

  projects() {
    return this.paged('/projects.json');
  }

  tasks(projectId) {
    return this.request(`/projects/${projectId}/tasks.json`);
  }

  users() {
    return this.request('/users.json');
  }

  entries({ startDate, endDate, userId }) {
    const params = new URLSearchParams({ start_date: startDate, end_date: endDate });
    if (userId) params.set('user_id', userId);
    return this.paged(`/entries.json?${params}`);
  }

  createEntry({ date, hours, notes, taskId }) {
    return this.request('/entries.json', {
      method: 'POST',
      body: { date, hours, notes, task_id: taskId },
    });
  }
}
