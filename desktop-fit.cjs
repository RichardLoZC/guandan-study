'use strict';

// Keep the full desktop layout in CSS pixels. Chromium's page zoom scales
// text, cards, dialogs and input coordinates together.
const TABLE_WIDTH = 1600;
const TABLE_HEIGHT = 1000;

function zoomForContent(width, height) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return Math.min(1, width / TABLE_WIDTH, height / TABLE_HEIGHT);
}

function fitDesktopWindow(window) {
  const fit = () => {
    if (window.isDestroyed() || window.webContents.isDestroyed()) return;
    const zoom = zoomForContent(...window.getContentSize());
    if (zoom !== null && Math.abs(window.webContents.getZoomFactor() - zoom) > 0.00001) {
      window.webContents.setZoomFactor(zoom);
    }
  };
  for (const event of ['resize', 'enter-full-screen', 'leave-full-screen']) window.on(event, fit);
  // A restored per-origin zoom must not replace the fit after navigation.
  window.webContents.on('did-finish-load', fit);
  fit();
  return fit;
}

module.exports = { zoomForContent, fitDesktopWindow };
