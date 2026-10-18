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
  byId('hand-scroll').setAttribute('aria-label', window.GuandanPhone?.active ? '同点数叠放；点击牌头选牌，滑动查看全部手牌' : '双层手牌；点击选牌，按住拖动理牌，空白处左右滚动');
  // The shared editor handles mouse, touch and pen. A separate swipe-select
  // recognizer would compete with immediate dragging on the same cards.
  let suspended = false;
  const scheduleWhenVisible = scheduleBots;
  scheduleBots = () => { if (!suspended) scheduleWhenVisible(); };
  window.guandanPad = {
    back() {
      const dialog = [...document.querySelectorAll('dialog[open]')].at(-1);
      if (dialog) { closeDialog(dialog); return true; }
      if (dealMotion.active) { dealMotion.finish(); return true; }
      if (handEditor?.active) { handEditor.cancel(); return true; }
      if (selected.size) { byId('clear-selection').click(); return true; }
      return false;
    },
    suspend() {
      if (suspended) return;
      suspended = true; handEditor?.cancel(); dealMotion.finish(); stopBots();
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
})();
