const koffi = require('koffi');
const user32 = koffi.load('user32.dll');

const HANDLE = koffi.pointer('HANDLE', koffi.opaque());
const HWND = koffi.alias('HWND', HANDLE);
const getForegroundWindow = user32.func('HWND __stdcall GetForegroundWindow(void)');
const getWindowText = user32.func('int __stdcall GetWindowTextW(HWND hWnd, _Out_ uint16_t *lpString, int nMaxCount)');
const setForegroundWindow = user32.func('bool __stdcall SetForegroundWindow(HWND hWnd)');

function foregroundInfo() {
  const hwnd = getForegroundWindow();
  if (!hwnd) return null;
  const titleBuffer = Buffer.alloc(1024);
  const titleChars = getWindowText(hwnd, titleBuffer, titleBuffer.length / 2);
  const title = titleBuffer.toString('utf16le', 0, Math.max(0, titleChars) * 2);
  return { hwnd, title };
}

module.exports = { foregroundInfo, setForegroundWindow };
