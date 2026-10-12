'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { zoomForContent, fitDesktopWindow } = require('../desktop-fit.cjs');

test('desktop fitting preserves a complete logical table at every window size', () => {
  for (const [width, height] of [[880,612],[1024,720],[1380,912],[1710,978],[1920,1052],[1920,612]]) {
    const zoom = zoomForContent(width, height);
    assert.ok(zoom > 0 && zoom <= 1);
    assert.ok(width / zoom >= 1600 - 1e-9);
    assert.ok(height / zoom >= 1000 - 1e-9);
    assert.ok(zoom === 1 || Math.abs(width / zoom - 1600) < 1e-9 || Math.abs(height / zoom - 1000) < 1e-9);
  }
  // Halving both axes halves every rendered dimension, not selected UI regions.
  assert.equal(zoomForContent(800,500),zoomForContent(1600,1000)/2);
});

test('small and invalid transient sizes never introduce invalid zoom', () => {
  assert.equal(zoomForContent(880,612),.55);
  assert.equal(zoomForContent(1920,612),.612);
  for (const size of [[0,600],[800,0],[-1,600],[NaN,600],[800,Infinity]]) assert.equal(zoomForContent(...size),null);
});

test('resize, fullscreen, navigation and reset fit actual content excluding the title bar', () => {
  const window=new EventEmitter(), contents=new EventEmitter();
  let size=[1380,912],zoom=1.5,closed=false,writes=0;
  window.webContents=contents;
  window.getContentSize=()=>size;
  window.isDestroyed=contents.isDestroyed=()=>closed;
  contents.getZoomFactor=()=>zoom;
  contents.setZoomFactor=value=>{zoom=value;writes++;};
  const restore=fitDesktopWindow(window);
  assert.equal(zoom,.8625);
  const initialWrites=writes;
  window.emit('resize');assert.equal(writes,initialWrites);
  size=[880,612];window.emit('resize');assert.equal(zoom,.55);
  size=[1710,1000];window.emit('enter-full-screen');assert.equal(zoom,1);
  size=[1380,912];window.emit('leave-full-screen');assert.equal(zoom,.8625);
  zoom=1.2;contents.emit('did-finish-load');assert.equal(zoom,.8625);
  zoom=.5;restore();assert.equal(zoom,.8625);
  size=[0,0];window.emit('resize');assert.equal(zoom,.8625);
  closed=true;restore();assert.equal(zoom,.8625);
});

test('desktop packages include the fitting module', async () => {
  const {ignoreRuntimeFile}=await import('../scripts/package-options.mjs');
  assert.equal(ignoreRuntimeFile('/desktop-fit.cjs'),false);
  assert.equal(ignoreRuntimeFile('/test/desktop-fit.test.cjs'),true);
});
