import { fetchRoles, setUserAgent, TickClient } from './api.js';

const $ = (id) => document.getElementById(id);
let roles = [];

function showMessage(msg, kind = 'error') {
  $('message').textContent = msg || '';
  $('message').className = msg ? `notice ${kind}` : '';
}
const showError = (msg) => showMessage(msg, 'error');

// Disables the button while connecting so it's clear something is happening.
async function withBusy(button, fn) {
  button.disabled = true;
  showMessage('Connecting to Tick…', 'info');
  try {
    await fn();
  } finally {
    button.disabled = false;
  }
}

async function renderStatus() {
  const { auth } = await chrome.storage.local.get('auth');
  $('status').textContent = auth?.apiToken
    ? `Connected: ${auth.company || `subscription ${auth.subscriptionId}`}${auth.email ? ` (${auth.email})` : ''}`
    : 'Not connected.';
  $('status').className = auth?.apiToken ? 'connected' : 'muted';
  if (auth?.subscriptionId) $('sub-id').value = auth.subscriptionId;
  if (auth?.email) $('email').value = auth.email;
}

// Try to find our own user_id (needed to show hours already logged).
// If this fails, the background worker fills it in after the first created entry.
async function findUserId(auth) {
  if (!auth.email) return undefined;
  try {
    const users = await new TickClient(auth).users();
    return users.find((u) => u.email?.toLowerCase() === auth.email.toLowerCase())?.id;
  } catch {
    return undefined;
  }
}

async function save(auth) {
  auth.userId = await findUserId(auth);
  await chrome.storage.local.set({ auth });
  showMessage(`✓ Connected${auth.company ? ` to ${auth.company}` : ''}. You can close this page and click the extension icon.`, 'success');
  renderStatus();
}

async function login() {
  showError('');
  const email = $('email').value.trim();
  const password = $('password').value;
  if (!email || !password) return showError('Enter your email and password.');

  // Second round: the user has already picked a company from the list.
  if (roles.length > 1 && !$('role-wrap').hidden) {
    const role = roles[$('role').value];
    return finishLogin(email, role);
  }

  try {
    await setUserAgent(email);
    roles = await fetchRoles(email, password);
  } catch (e) {
    return showError(e.message);
  }
  if (!roles.length) return showError("This account doesn't have access to any company in Tick.");
  if (roles.length === 1) return finishLogin(email, roles[0]);

  $('role').replaceChildren(...roles.map((r, i) => new Option(r.company, i)));
  $('role-wrap').hidden = false;
  $('login').textContent = 'Use selected company';
  showMessage('You have access to several companies – pick one and click again.', 'info');
}

async function finishLogin(email, role) {
  $('password').value = '';
  $('role-wrap').hidden = true;
  $('login').textContent = 'Fetch token';
  await save({ subscriptionId: role.subscription_id, apiToken: role.api_token, company: role.company, email });
}

async function saveManual() {
  showError('');
  const subscriptionId = $('sub-id').value.trim();
  const apiToken = $('token').value.trim();
  const email = $('email').value.trim();
  if (!subscriptionId || !apiToken || !email) return showError('Enter the Subscription ID, token and email.');
  try {
    await setUserAgent(email);
    await new TickClient({ subscriptionId, apiToken }).request('/projects.json?page=1');
  } catch (e) {
    return showError(`Couldn't connect: ${e.message}`);
  }
  await save({ subscriptionId, apiToken, email });
  $('token').value = '';
}

$('login').addEventListener('click', () => withBusy($('login'), login));
$('save-manual').addEventListener('click', () => withBusy($('save-manual'), saveManual));
$('logout').addEventListener('click', async () => {
  await chrome.storage.local.remove('auth');
  showMessage('Account disconnected.', 'info');
  renderStatus();
});

$('version').textContent = `v${chrome.runtime.getManifest().version}`;
renderStatus();
