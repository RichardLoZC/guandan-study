'use strict';
(() => {
  const native = window.GuandanPadNative;
  if (native?.exportText) {
    downloadText = (filename, text) => {
      try { native.exportText(filename, text); }
      catch { toast('无法打开保存位置，请重试。'); }
    };
  }
  const note = document.createElement('span');
  note.className = 'pad-touch-note';
  note.textContent = '点击牌面选牌';
  byId('hand-count').after(document.createTextNode(' '), note);
  byId('hand-scroll').setAttribute('aria-label', '双层手牌；点击选牌，自由理牌可拖动换位，空白处左右滚动');

  let gesture = null, suppressClickUntil = 0;
  const hand = byId('hand-cards');
  const buttonAt = (x, y) => document.elementFromPoint(x, y)?.closest('.playing-card');
  function paint(button) {
    if (!gesture || !button || button.disabled || !hand.contains(button)) return;
    const id = button.dataset.id;
    if (gesture.visited.has(id)) return;
    gesture.visited.add(id);
    if (gesture.select) selected.add(id); else selected.delete(id);
    playKey = null; clearToast(); updateSelection();
  }
  function cancelGesture() {
    if (gesture?.dragging && liveRound?.revision === gesture.revision) {
      selected = new Set(gesture.before); playKey = gesture.beforePlayKey; updateSelection();
    }
    if (gesture?.dragging) suppressClickUntil = performance.now() + 500;
    gesture = null;
  }
  hand.addEventListener('pointerdown', event => {
    if (handEditor?.editing || event.pointerType === 'mouse' || !event.isPrimary || !canPlay() || liveRound.phase !== 'playing') return;
    const card = event.target.closest('.playing-card');
    if (!card || card.disabled) return;
    gesture = { pointer: event.pointerId, x: event.clientX, y: event.clientY, lastX: event.clientX,
      lastY: event.clientY, card, before: new Set(selected), beforePlayKey: playKey, select: !selected.has(card.dataset.id),
      visited: new Set(), revision: liveRound.revision, dragging: false };
  });
  hand.addEventListener('pointermove', event => {
    if (!gesture || event.pointerId !== gesture.pointer) return;
    if (handEditor?.editing || !canPlay() || liveRound.revision !== gesture.revision) { cancelGesture(); return; }
    if (!gesture.dragging) {
      const dx = Math.abs(event.clientX - gesture.x), dy = Math.abs(event.clientY - gesture.y);
      if (dy > dx && dy > 10) { gesture = null; return; }
      if (dx < 10) return;
      gesture.dragging = true; paint(gesture.card);
    }
    // Sample the traversed strip so quick swipes do not skip narrow cards.
    const steps = Math.max(1, Math.ceil(Math.hypot(event.clientX-gesture.lastX, event.clientY-gesture.lastY) / 12));
    for (let i = 1; i <= steps; i++) {
      paint(buttonAt(gesture.lastX + (event.clientX-gesture.lastX)*i/steps,
        gesture.lastY + (event.clientY-gesture.lastY)*i/steps));
    }
    gesture.lastX = event.clientX; gesture.lastY = event.clientY;
  });
  window.addEventListener('pointerup', event => {
    if (!gesture || event.pointerId !== gesture.pointer) return;
    if (gesture.dragging) suppressClickUntil = performance.now() + 500;
    gesture = null;
  });
  window.addEventListener('pointercancel', cancelGesture);
  hand.addEventListener('click', event => {
    if (event.detail && performance.now() < suppressClickUntil) {
      event.preventDefault(); event.stopImmediatePropagation();
    }
  }, true);
  let suspended = false;
  const scheduleWhenVisible = scheduleBots;
  scheduleBots = () => { if (!suspended) scheduleWhenVisible(); };
  window.guandanPad = {
    back() {
      const dialog = [...document.querySelectorAll('dialog[open]')].at(-1);
      if (dialog) { closeDialog(dialog); return true; }
      if (dealMotion.active) { dealMotion.finish(); return true; }
      if (handEditor?.editing) { handEditor.setEditing(false); return true; }
      if (selected.size) { byId('clear-selection').click(); return true; }
      return false;
    },
    suspend() {
      if (suspended) return;
      suspended = true; cancelGesture(); handEditor?.cancel(); dealMotion.finish(); stopBots();
      if (activeTask) {
        workEpoch++; activeTask = null; model.cancel();
        if (byId('analysis-dialog').open) closeDialog(byId('analysis-dialog'));
      }
      byId('recheck-model').disabled = false;
      if (typeof stopReplay === 'function') stopReplay();
    },
    resume() {
      if (!suspended) return;
      suspended = false; renderGame();
      if (!model.ready && !activeTask && !fault) checkModel(); else scheduleBots();
    },
    notice: toast
  };
  window.addEventListener('resize', cancelGesture);
})();
