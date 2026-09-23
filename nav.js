/* ============================================
   共通ハンバーガーナビゲーション制御
   ============================================ */
(function () {
  function init() {
    var btn = document.getElementById('hamburgerBtn');
    var drawer = document.getElementById('drawer');
    var overlay = document.getElementById('drawerOverlay');
    if (!btn || !drawer || !overlay) return;

    function open() {
      btn.classList.add('open');
      drawer.classList.add('open');
      overlay.classList.add('open');
    }
    function close() {
      btn.classList.remove('open');
      drawer.classList.remove('open');
      overlay.classList.remove('open');
    }
    function toggle() {
      if (drawer.classList.contains('open')) close();
      else open();
    }

    btn.addEventListener('click', toggle);
    overlay.addEventListener('click', close);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
