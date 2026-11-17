'use strict';

// No backend, network calls or directory writes. Four-byte NFC UID only.
const HISTORY_KEY = 'dcs-card-reader-history-v1';
const MAX_HISTORY = 30;
const $ = (id) => document.getElementById(id);
let controller = null;
let scanning = false;
let recentUid = '';
let recentAt = 0;
let current = null;

function convertUid(serialNumber) {
  if (typeof serialNumber !== 'string') throw new Error('The NFC reader did not provide a card serial number.');
  const raw = serialNumber.trim().replace(/^(?:0x)/i, '').replace(/[\s:\-]/g, '');
  if (!/^[\da-f]+$/i.test(raw) || raw.length % 2 !== 0) throw new Error('The card UID contains invalid hexadecimal characters.');
  const bytes = Uint8Array.from(raw.match(/.{2}/g).map(pair => parseInt(pair, 16)));
  if (bytes.length !== 4) throw new Error(`This card has a ${bytes.length}-byte UID. Only 4-byte UIDs match the PowerShell script.`);
  const decimal = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, true).toString();
  const colon = Array.from(bytes, b => b.toString(16).padStart(2, '0').toUpperCase()).join(':');
  return { decimal, colon };
}

function loadHistory() {
  try {
    const entries = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    if (!Array.isArray(entries)) return [];
    return entries.filter(e => e && typeof e.colon === 'string' && /^([0-9A-F]{2}:){3}[0-9A-F]{2}$/.test(e.colon) && typeof e.decimal === 'string' && /^\d{1,10}$/.test(e.decimal) && Number.isFinite(e.time)).slice(0, MAX_HISTORY);
  } catch { return []; }
}
function saveHistory(record) {
  try {
    const entries = loadHistory();
    entries.unshift({ ...record, time: Date.now() });
    localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, MAX_HISTORY)));
  } catch { setStatus('Card read, but local history could not be saved.', true); }
  renderHistory();
}
function renderHistory() {
  const entries = loadHistory();
  const list = $('historyList');
  list.replaceChildren();
  $('historyEmpty').hidden = entries.length > 0;
  $('clearHistoryBtn').disabled = entries.length === 0;
  for (const e of entries) {
    const li = document.createElement('li');
    const left = document.createElement('div');
    left.className = 'history-main';
    const uid = document.createElement('div');
    uid.className = 'history-uid';
    uid.textContent = e.colon;
    const meta = document.createElement('small');
    meta.className = 'history-meta';
    meta.textContent = `${e.decimal} · ${new Date(e.time).toLocaleString()}`;
    left.append(uid, meta);
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Show';
    button.addEventListener('click', () => showResult(e));
    li.append(left, button);
    list.append(li);
  }
}
function setStatus(message, error = false) {
  $('status').textContent = message;
  $('status').classList.toggle('error', error);
}
function showResult(record) {
  current = { decimal: record.decimal, colon: record.colon };
  $('attr5').textContent = current.decimal;
  $('attr6').textContent = current.colon;
  $('resultPanel').hidden = false;
}
function setScanning(active) {
  scanning = active;
  $('scanBtn').hidden = active;
  $('stopBtn').hidden = !active;
  $('scanHeading').textContent = active ? 'Waiting for a card…' : 'Ready to scan';
}
function stopScanning() {
  if (controller) controller.abort();
  controller = null;
  setScanning(false);
  setStatus('Scanner stopped.');
}
async function startScanning() {
  if (scanning) return;
  if (!window.isSecureContext) return setStatus('Web NFC requires HTTPS.', true);
  if (!('NDEFReader' in window)) return setStatus('Web NFC is not supported. Use Chrome on a compatible Android phone.', true);
  controller = new AbortController();
  const activeController = controller;
  setScanning(true);
  setStatus('Allow NFC access if prompted, then present a card.');
  try {
    const reader = new NDEFReader();
    reader.addEventListener('reading', event => {
      if (!scanning || controller !== activeController) return;
      try {
        const result = convertUid(event.serialNumber);
        // NFC can deliver repeated reads while a card is held in place.
        const now = Date.now();
        if (recentUid === result.colon && now - recentAt < 2000) return;
        recentUid = result.colon;
        recentAt = now;
        showResult(result);
        saveHistory(result);
        setStatus('Card read successfully. Present another card or stop scanning.');
        if (navigator.vibrate) navigator.vibrate(80);
      } catch (error) { setStatus(error.message, true); }
    });
    reader.addEventListener('readingerror', () => setStatus('Card detected but could not be read. Try repositioning it; this card type may not support Web NFC.', true));
    await reader.scan({ signal: activeController.signal });
  } catch (error) {
    if (error.name === 'AbortError') return;
    setScanning(false);
    controller = null;
    const descriptions = {
      NotAllowedError: 'NFC permission denied. Allow NFC for this site in Chrome.',
      NotSupportedError: 'Web NFC is not available on this device or NFC is disabled.',
      NotReadableError: 'NFC hardware is busy or unavailable. Enable NFC and try again.',
      SecurityError: 'NFC access blocked. Open this page directly over HTTPS in Android Chrome.'
    };
    setStatus(descriptions[error.name] || `Unable to start NFC: ${error.message || error.name}`, true);
  }
}
async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value);
    setStatus('Copied to clipboard.');
  } catch { setStatus('Clipboard unavailable. Use the browser to select and copy the value.', true); }
}

$('scanBtn').addEventListener('click', startScanning);
$('stopBtn').addEventListener('click', stopScanning);
document.querySelectorAll('[data-copy]').forEach(button => button.addEventListener('click', () => {
  const field = button.dataset.copy;
  if (current && (field === 'attr5' || field === 'attr6')) copyText(field === 'attr5' ? current.decimal : current.colon);
}));
$('copyBothBtn').addEventListener('click', () => {
  if (current) copyText(`extensionAttribute5: ${current.decimal}\nextensionAttribute6: ${current.colon}`);
});
$('clearHistoryBtn').addEventListener('click', () => {
  if (!confirm('Clear all locally stored scan history on this device?')) return;
  try { localStorage.removeItem(HISTORY_KEY); renderHistory(); setStatus('History cleared.'); }
  catch { setStatus('Could not clear local history.', true); }
});
window.addEventListener('pagehide', () => { if (controller) controller.abort(); });
renderHistory();
if (!window.isSecureContext || !('NDEFReader' in window)) {
  $('supportChip').textContent = 'NFC unavailable';
  $('supportChip').classList.add('bad');
  $('scanBtn').disabled = true;
  setStatus(!window.isSecureContext ? 'Open over HTTPS to enable scanning.' : 'Use Chrome on an Android phone with Web NFC support.', true);
} else {
  $('supportChip').textContent = 'NFC ready';
  $('supportChip').classList.add('ok');
}
if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js').catch(() => {}));
}
