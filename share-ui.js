// =========================================================
// テニス共有 UI (share.js を使って共有バー・モーダルを提供)
// window.TennisShareUI.setup({mode, getState, applyState, container}) で起動
// =========================================================
(function () {
  var state = {
    mode: null,
    sessionCode: null,
    unsubscribe: null,
    getState: null,
    applyState: null,
    isApplyingRemote: false,
    isOwner: false,            // セッション作成者か
    allowGuestEdit: false,     // 参加者に編集を許可するか (オーナー設定)
    role: "viewer",            // 有効ロール ('editor' | 'viewer') - 派生値
    lastSyncedKey: null,
    pushTimer: null
  };

  // ---- キー順に依存しない JSON 文字列化 (echo 判定用) ----
  function stableStringify(v) {
    if (v === null || typeof v !== "object") return JSON.stringify(v);
    if (Array.isArray(v)) return "[" + v.map(stableStringify).join(",") + "]";
    var keys = Object.keys(v).sort();
    return "{" + keys.map(function (k) {
      return JSON.stringify(k) + ":" + stableStringify(v[k]);
    }).join(",") + "}";
  }

  function computeKey(s) {
    return stableStringify({
      players: s.players || [],
      matches: s.matches || [],
      scores: s.scores || {}
    });
  }

  function whenReady() {
    if (window.TennisShare) return Promise.resolve();
    return new Promise(function (res) {
      window.addEventListener("tennisShareReady", res, { once: true });
    });
  }

  async function setup(opts) {
    state.mode = opts.mode;
    state.getState = opts.getState;
    state.applyState = opts.applyState;

    renderShareBar(opts.container);
    await whenReady();

    var codeFromUrl = window.TennisShare.getSessionCodeFromUrl();
    if (codeFromUrl) {
      state.sessionCode = codeFromUrl;
      state.isOwner = false;
      applyEffectiveRole();
      updateBarUI();
      startSubscription(codeFromUrl);
      if (opts.onAutoJoin) opts.onAutoJoin();
    }
  }

  function renderShareBar(container) {
    if (!container) return;
    if (document.getElementById("shareBar")) return;
    var bar = document.createElement("div");
    bar.className = "share-bar";
    bar.id = "shareBar";
    bar.innerHTML =
      '<div class="share-bar-status">' +
        '<span class="status-dot"></span>' +
        '<span id="shareBarLabel">共有はオフです</span>' +
      "</div>" +
      '<div class="share-bar-controls">' +
        '<span class="share-role-indicator" id="shareRoleIndicator" style="display:none"></span>' +
        '<button class="share-btn secondary" id="shareJoinBtn">参加</button>' +
        '<button class="share-btn" id="shareCreateBtn">セッションを作成</button>' +
      "</div>";
    container.appendChild(bar);

    document.getElementById("shareCreateBtn").addEventListener("click", handleCreateClick);
    document.getElementById("shareJoinBtn").addEventListener("click", openJoinModal);
  }

  async function handleCreateClick() {
    if (state.sessionCode) {
      openShareModal(state.sessionCode);
      return;
    }
    var st = state.getState();
    if (!st || !st.matches || st.matches.length === 0) {
      alert("先に組み合わせを作成してから共有してください。");
      return;
    }
    try {
      var code = await window.TennisShare.createSession(state.mode, st);
      state.sessionCode = code;
      state.isOwner = true;
      state.allowGuestEdit = false; // デフォルト: 参加者は閲覧のみ
      state.lastSyncedKey = computeKey(st);
      applyEffectiveRole();
      updateBarUI();
      startSubscription(code);
      openShareModal(code);
    } catch (e) {
      alert("セッション作成に失敗しました: " + (e.message || e));
    }
  }

  function startSubscription(code) {
    if (state.unsubscribe) state.unsubscribe();
    state.unsubscribe = window.TennisShare.joinSession(code, function (remote) {
      if (!remote) {
        showToast("セッションが見つかりません: " + code);
        return;
      }

      // allowGuestEdit を反映 (参加者側は役割が変わる)
      var newAllow = !!remote.allowGuestEdit;
      var allowChanged = newAllow !== state.allowGuestEdit;
      state.allowGuestEdit = newAllow;
      if (allowChanged || state.role !== computeEffectiveRoleValue()) {
        applyEffectiveRole();
        syncShareModalPermission();
      }

      var key = computeKey(remote);
      // 自分の書き込みの echo なら再描画をスキップ (フォーカス保護)
      if (key === state.lastSyncedKey) return;
      state.lastSyncedKey = key;
      state.isApplyingRemote = true;
      try {
        state.applyState(remote);
      } finally {
        state.isApplyingRemote = false;
      }
    });
  }

  function pushState() {
    if (!state.sessionCode || state.isApplyingRemote) return;
    if (state.role === "viewer") return;
    clearTimeout(state.pushTimer);
    state.pushTimer = setTimeout(async function () {
      var st = state.getState();
      var pushData = {
        players: st.players,
        matches: st.matches,
        scores: st.scores
      };
      state.lastSyncedKey = computeKey(pushData);
      try {
        await window.TennisShare.updateSession(state.sessionCode, pushData);
      } catch (e) {
        console.error("[TennisShareUI] push failed", e);
        showToast("同期に失敗しました");
      }
    }, 300);
  }

  // ---- ロール計算 ----
  function computeEffectiveRoleValue() {
    if (!state.sessionCode) return "editor"; // 未接続時はローカル編集を許可
    if (state.isOwner) return "editor";
    return state.allowGuestEdit ? "editor" : "viewer";
  }

  function applyEffectiveRole() {
    var next = computeEffectiveRoleValue();
    state.role = next;
    document.body.classList.toggle("view-only", next === "viewer");
    updateBarUI();
  }

  async function setAllowGuestEditByOwner(value) {
    if (!state.isOwner || !state.sessionCode) return;
    state.allowGuestEdit = value;
    applyEffectiveRole();
    try {
      await window.TennisShare.updateSession(state.sessionCode, { allowGuestEdit: value });
    } catch (e) {
      console.error("[TennisShareUI] setAllowGuestEdit failed", e);
      showToast("権限設定の変更に失敗しました");
    }
  }

  function updateBarUI() {
    var bar = document.getElementById("shareBar");
    if (!bar) return;
    var indicator = document.getElementById("shareRoleIndicator");
    var joinBtn = document.getElementById("shareJoinBtn");
    var createBtn = document.getElementById("shareCreateBtn");

    if (state.sessionCode) {
      bar.classList.add("connected");
      var codeHtml = '<span class="share-bar-code">' + state.sessionCode + "</span>";
      var roleLabel = state.isOwner ? "オーナー" : (state.role === "editor" ? "編集可" : "閲覧のみ");
      document.getElementById("shareBarLabel").innerHTML = "同期中 " + codeHtml;
      createBtn.textContent = "共有情報を表示";
      joinBtn.style.display = "none";
      indicator.style.display = "";
      indicator.textContent = (state.isOwner ? "👑 " : (state.role === "editor" ? "🖊️ " : "👀 ")) + roleLabel;
      indicator.classList.toggle("viewer", state.role === "viewer");
      indicator.classList.toggle("owner", state.isOwner);
    } else {
      bar.classList.remove("connected");
      document.getElementById("shareBarLabel").textContent = "共有はオフです";
      createBtn.textContent = "セッションを作成";
      joinBtn.style.display = "";
      indicator.style.display = "none";
    }
  }

  function openShareModal(code) {
    var url = window.TennisShare.buildShareUrl(code);
    var modal = document.getElementById("shareModalOverlay") || createShareModal();
    document.getElementById("shareCodeDisplay").textContent = code;
    document.getElementById("shareUrlInput").value = url;
    syncShareModalPermission();
    modal.classList.add("show");
  }

  function syncShareModalPermission() {
    var wrap = document.getElementById("sharePermissionSection");
    if (!wrap) return;
    if (state.isOwner) {
      wrap.style.display = "";
      var cb = document.getElementById("sharePermissionCheckbox");
      if (cb) cb.checked = state.allowGuestEdit;
    } else {
      wrap.style.display = "none";
    }
  }

  function createShareModal() {
    var overlay = document.createElement("div");
    overlay.className = "share-modal-overlay";
    overlay.id = "shareModalOverlay";
    overlay.innerHTML =
      '<div class="share-modal">' +
        "<h3>🔗 セッションを共有</h3>" +
        '<p class="share-desc">下のコードまたは URL を共有すると、他の人が同じ画面をリアルタイムで見られます。</p>' +
        '<div class="share-code-display" id="shareCodeDisplay"></div>' +
        '<div class="share-url-row">' +
          '<input type="text" id="shareUrlInput" readonly>' +
          '<button id="shareCopyBtn">コピー</button>' +
        "</div>" +
        '<div class="share-permission-section" id="sharePermissionSection">' +
          '<label class="share-permission-label">' +
            '<input type="checkbox" id="sharePermissionCheckbox">' +
            '<span><b>参加者にも得点入力を許可する</b><br><small>オフの間、参加者は閲覧のみになります。</small></span>' +
          "</label>" +
        "</div>" +
        '<div class="share-modal-actions">' +
          '<button class="close-btn" id="shareCloseBtn">閉じる</button>' +
        "</div>" +
      "</div>";
    document.body.appendChild(overlay);

    document.getElementById("sharePermissionCheckbox").addEventListener("change", function (e) {
      setAllowGuestEditByOwner(e.target.checked);
    });

    document.getElementById("shareCopyBtn").addEventListener("click", function () {
      var input = document.getElementById("shareUrlInput");
      input.select();
      var text = input.value;
      var done = function () { showToast("URL をコピーしました"); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, function () {
          document.execCommand("copy"); done();
        });
      } else {
        document.execCommand("copy"); done();
      }
    });
    document.getElementById("shareCloseBtn").addEventListener("click", function () {
      overlay.classList.remove("show");
    });
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) overlay.classList.remove("show");
    });
    return overlay;
  }

  function openJoinModal() {
    var modal = document.getElementById("joinModalOverlay") || createJoinModal();
    document.getElementById("joinCodeInput").value = "";
    document.getElementById("joinError").textContent = "";
    modal.classList.add("show");
    setTimeout(function () { document.getElementById("joinCodeInput").focus(); }, 50);
  }

  function createJoinModal() {
    var overlay = document.createElement("div");
    overlay.className = "join-modal-overlay";
    overlay.id = "joinModalOverlay";
    overlay.innerHTML =
      '<div class="join-modal">' +
        "<h3>セッションに参加</h3>" +
        '<p class="share-desc">参加後の得点入力の可否はオーナーの設定に従います。</p>' +
        '<input type="text" id="joinCodeInput" maxlength="6" placeholder="ABC123" autocomplete="off">' +
        '<p class="error" id="joinError"></p>' +
        '<div class="share-modal-actions">' +
          '<button class="close-btn" id="joinCloseBtn">キャンセル</button>' +
          '<button class="share-btn" id="joinSubmitBtn">参加</button>' +
        "</div>" +
      "</div>";
    document.body.appendChild(overlay);

    var submit = function () {
      var code = document.getElementById("joinCodeInput").value.trim().toUpperCase();
      if (code.length !== 6) {
        document.getElementById("joinError").textContent = "6桁のコードを入力してください。";
        return;
      }
      overlay.classList.remove("show");
      var url = new URL(window.location.href);
      url.searchParams.set("s", code);
      window.location.href = url.toString();
    };
    document.getElementById("joinSubmitBtn").addEventListener("click", submit);
    document.getElementById("joinCodeInput").addEventListener("keydown", function (e) {
      if (e.key === "Enter") submit();
    });
    document.getElementById("joinCloseBtn").addEventListener("click", function () {
      overlay.classList.remove("show");
    });
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) overlay.classList.remove("show");
    });
    return overlay;
  }

  function showToast(msg) {
    var toast = document.getElementById("shareToast");
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "share-toast";
      toast.id = "shareToast";
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add("show");
    setTimeout(function () { toast.classList.remove("show"); }, 2200);
  }

  window.TennisShareUI = {
    setup: setup,
    pushState: pushState,
    isRemote: function () { return state.isApplyingRemote; },
    isActive: function () { return !!state.sessionCode; },
    isViewer: function () { return state.role === "viewer"; },
    isOwner: function () { return state.isOwner; }
  };
})();
