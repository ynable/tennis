// =========================================================
// テニス共有 UI (share.js を使って共有バー・ロビー・モーダルを提供)
// window.TennisShareUI.setup({mode, getState, applyState, container, onGenerate}) で起動
// =========================================================
(function () {
  var state = {
    mode: null,
    sessionCode: null,
    unsubscribe: null,
    getState: null,
    applyState: null,
    onGenerate: null,           // オーナーが「生成」を押したときに呼ぶコールバック
    container: null,            // .container の参照 (ロビーセクション配置用)
    isApplyingRemote: false,
    isOwner: false,
    allowGuestEdit: false,
    role: "editor",             // 'editor' | 'viewer' - 派生値
    lastSyncedKey: null,
    pushTimer: null,
    // ロビー用
    expectedCount: 0,
    courtCount: 0,
    remotePlayers: [],
    mySlot: null,               // {index, name, role}
    lobbyVisible: false
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

  // ---- localStorage: 自分のスロット情報 ----
  function mySlotKey(code) { return "tennis:me:" + code.toUpperCase(); }
  function loadMySlot(code) {
    try {
      var raw = localStorage.getItem(mySlotKey(code));
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function saveMySlot(code, info) {
    try { localStorage.setItem(mySlotKey(code), JSON.stringify(info)); } catch (e) {}
  }
  function clearMySlot(code) {
    try { localStorage.removeItem(mySlotKey(code)); } catch (e) {}
  }

  // =========================================================
  // Setup
  // =========================================================
  async function setup(opts) {
    state.mode = opts.mode;
    state.getState = opts.getState;
    state.applyState = opts.applyState;
    state.onGenerate = opts.onGenerate || null;
    state.container = document.querySelector(".container");

    renderShareBar(opts.container);
    await whenReady();

    var codeFromUrl = window.TennisShare.getSessionCodeFromUrl();
    if (codeFromUrl) {
      state.sessionCode = codeFromUrl;
      state.isOwner = window.TennisShare.isOwned(codeFromUrl);
      state.mySlot = loadMySlot(codeFromUrl);
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
        '<button class="share-btn" id="shareCreateBtn">共有を作成</button>' +
      "</div>";
    container.appendChild(bar);

    document.getElementById("shareCreateBtn").addEventListener("click", handleCreateClick);
    document.getElementById("shareJoinBtn").addEventListener("click", openJoinModal);
  }

  // =========================================================
  // ロビー開始 (mode.js から呼ばれる)
  // =========================================================
  async function startLobby(params) {
    // params: { expectedCount, courtCount }
    await whenReady();
    if (state.sessionCode) {
      alert("既にセッションに参加中です。新しく作るにはリセットしてください。");
      return null;
    }
    try {
      var code = await window.TennisShare.createLobbySession(state.mode, {
        expectedCount: params.expectedCount,
        courtCount: params.courtCount
      });
      state.sessionCode = code;
      state.isOwner = true;
      state.allowGuestEdit = true;
      state.expectedCount = params.expectedCount;
      state.courtCount = params.courtCount;
      window.TennisShare.markOwned(code, state.mode);
      updateUrlWithCode(code);
      applyEffectiveRole();
      updateBarUI();
      startSubscription(code);
      openShareModal(code);
      return code;
    } catch (e) {
      alert("セッション開始に失敗しました: " + (e.message || e));
      return null;
    }
  }

  // =========================================================
  // 生成後にセッション化する (旧フロー)
  // =========================================================
  async function handleCreateClick() {
    if (state.sessionCode) {
      openShareModal(state.sessionCode);
      return;
    }
    var st = state.getState();
    if (!st || !st.matches || st.matches.length === 0) {
      alert("先に組み合わせを作成してから共有してください。\n(または Step 1 の「セッションを開始」から始めてください)");
      return;
    }
    try {
      var code = await window.TennisShare.createSession(state.mode, st);
      state.sessionCode = code;
      state.isOwner = true;
      state.allowGuestEdit = false;
      state.lastSyncedKey = computeKey(st);
      window.TennisShare.markOwned(code, state.mode);
      updateUrlWithCode(code);
      applyEffectiveRole();
      updateBarUI();
      startSubscription(code);
      openShareModal(code);
    } catch (e) {
      alert("セッション作成に失敗しました: " + (e.message || e));
    }
  }

  function updateUrlWithCode(code) {
    try {
      var url = new URL(window.location.href);
      url.searchParams.set("s", code);
      window.history.replaceState({}, "", url.toString());
    } catch (e) {}
  }

  function resetToInitialState() {
    if (state.unsubscribe) { state.unsubscribe(); state.unsubscribe = null; }
    var oldCode = state.sessionCode;
    state.sessionCode = null;
    state.isOwner = false;
    state.allowGuestEdit = false;
    state.lastSyncedKey = null;
    state.expectedCount = 0;
    state.courtCount = 0;
    state.remotePlayers = [];
    state.mySlot = null;
    hideLobby();
    document.body.classList.remove("view-only");
    applyEffectiveRole();
    updateBarUI();
    try {
      var url = new URL(window.location.href);
      url.searchParams.delete("s");
      window.history.replaceState({}, "", url.toString());
    } catch (e) {}
  }

  // =========================================================
  // Firestore 購読
  // =========================================================
  function startSubscription(code) {
    if (state.unsubscribe) state.unsubscribe();
    state.unsubscribe = window.TennisShare.joinSession(code, function (remote) {
      if (!remote) {
        showToast("セッションが見つかりません: " + code);
        if (state.isOwner) window.TennisShare.clearOwned(code);
        clearMySlot(code);
        resetToInitialState();
        return;
      }

      state.expectedCount = remote.expectedCount || 0;
      state.courtCount = remote.courtCount || state.courtCount || 0;
      state.remotePlayers = (remote.players || []).slice();

      var newAllow = !!remote.allowGuestEdit;
      var allowChanged = newAllow !== state.allowGuestEdit;
      state.allowGuestEdit = newAllow;

      // ロビー状態か試合状態かを判定
      var inLobby = !Array.isArray(remote.matches) || remote.matches.length === 0;

      if (inLobby) {
        // 自分のスロット確認 - localStorage の情報が remote と一致するかチェック
        var stored = loadMySlot(code);
        if (stored) {
          if (state.remotePlayers[stored.index] === stored.name) {
            state.mySlot = stored;
          } else {
            // 名前が別人に上書きされてる (異常) → クリア
            clearMySlot(code);
            state.mySlot = null;
          }
        } else {
          state.mySlot = null;
        }
        // ロビーを表示
        showLobby();
      } else {
        // 試合状態: 通常の同期処理
        hideLobby();

        if (allowChanged || state.role !== computeEffectiveRoleValue()) {
          applyEffectiveRole();
          syncShareModalPermission();
        }

        var key = computeKey(remote);
        if (key === state.lastSyncedKey) return; // 自分の echo
        state.lastSyncedKey = key;
        state.isApplyingRemote = true;
        try {
          state.applyState(remote);
        } finally {
          state.isApplyingRemote = false;
        }
      }

      updateBarUI();
    });
  }

  // =========================================================
  // ロビー UI
  // =========================================================
  function showLobby() {
    var section = document.getElementById("shareLobby") || createLobbySection();
    // 他の step を隠す
    document.querySelectorAll(".container .step").forEach(function (s) { s.classList.remove("active"); });
    section.classList.add("active");
    state.lobbyVisible = true;
    updateLobbyContent();
  }

  function hideLobby() {
    var section = document.getElementById("shareLobby");
    if (section) section.classList.remove("active");
    state.lobbyVisible = false;
  }

  function createLobbySection() {
    var section = document.createElement("section");
    section.className = "step lobby-step";
    section.id = "shareLobby";
    section.innerHTML =
      '<h2>🎾 参加者を待っています</h2>' +
      '<div class="lobby-summary">' +
        '<div class="lobby-code-row">' +
          '<span class="lobby-code-label">コード</span>' +
          '<span class="share-bar-code" id="lobbyCode"></span>' +
          '<button class="share-btn secondary" id="lobbyShareBtn">🔗 共有</button>' +
        '</div>' +
        '<p class="lobby-progress"><span id="lobbyFilled">0</span> / <span id="lobbyTotal">0</span> 人</p>' +
      '</div>' +
      '<div id="lobbySlots" class="lobby-slots"></div>' +
      '<div id="lobbyJoinForm" class="lobby-join-form" style="display:none">' +
        '<h3>あなたも参加する</h3>' +
        '<div class="lobby-join-row">' +
          '<input type="text" id="lobbyJoinName" placeholder="あなたの名前" maxlength="20">' +
        '</div>' +
        '<div class="lobby-role-select">' +
          '<label><input type="radio" name="lobbyRole" value="viewer" checked> 👀 閲覧のみ</label>' +
          '<label><input type="radio" name="lobbyRole" value="editor"> 🖊️ 得点入力あり</label>' +
        '</div>' +
        '<button class="btn primary" id="lobbyJoinBtn">🎲 参加する</button>' +
      '</div>' +
      '<div id="lobbyMyInfo" class="lobby-my-info" style="display:none">' +
        '<div class="lobby-my-number">あなたは <span class="lobby-number-big" id="lobbyMyNumber">?</span> 番！</div>' +
        '<p class="lobby-role-badge" id="lobbyMyRole"></p>' +
        '<p class="lobby-wait-msg">オーナーが組み合わせを作成するのを待っています...</p>' +
        '<button class="btn secondary btn-small" id="lobbyLeaveBtn">参加をやめる (別の名前にする)</button>' +
      '</div>' +
      '<div id="lobbyOwnerActions" class="lobby-owner-actions" style="display:none">' +
        '<button class="btn primary" id="lobbyGenerateBtn">組み合わせを生成 →</button>' +
        '<p class="lobby-generate-hint" id="lobbyGenerateHint"></p>' +
      '</div>';
    state.container.appendChild(section);

    document.getElementById("lobbyShareBtn").addEventListener("click", function () {
      if (state.sessionCode) openShareModal(state.sessionCode);
    });
    document.getElementById("lobbyJoinBtn").addEventListener("click", handleSelfJoin);
    document.getElementById("lobbyJoinName").addEventListener("keydown", function (e) {
      if (e.key === "Enter") handleSelfJoin();
    });
    document.getElementById("lobbyLeaveBtn").addEventListener("click", handleLeaveSlot);
    document.getElementById("lobbyGenerateBtn").addEventListener("click", handleGenerate);
    return section;
  }

  function updateLobbyContent() {
    if (!state.lobbyVisible) return;
    var section = document.getElementById("shareLobby");
    if (!section) return;

    document.getElementById("lobbyCode").textContent = state.sessionCode || "";
    var filled = state.remotePlayers.filter(function (p) { return p != null && p !== ""; }).length;
    var total = state.expectedCount;
    document.getElementById("lobbyFilled").textContent = filled;
    document.getElementById("lobbyTotal").textContent = total;

    // スロット表示
    var slotsEl = document.getElementById("lobbySlots");
    slotsEl.innerHTML = "";
    for (var i = 0; i < total; i++) {
      var p = state.remotePlayers[i];
      var isEmpty = (p == null || p === "");
      var isMe = state.mySlot && state.mySlot.index === i;
      var div = document.createElement("div");
      div.className = "lobby-slot" + (isEmpty ? " empty" : " filled") + (isMe ? " me" : "");
      div.innerHTML =
        '<span class="lobby-slot-num">' + (i + 1) + '</span>' +
        '<span class="lobby-slot-name">' + (isEmpty ? "—" : escapeHtml(p)) + '</span>' +
        (isMe ? '<span class="lobby-slot-me-badge">YOU</span>' : "");
      slotsEl.appendChild(div);
    }

    // 自分の状態
    if (state.mySlot) {
      document.getElementById("lobbyJoinForm").style.display = "none";
      document.getElementById("lobbyMyInfo").style.display = "";
      document.getElementById("lobbyMyNumber").textContent = state.mySlot.index + 1;
      var roleLabel = state.mySlot.role === "editor" ? "🖊️ 得点入力あり" : "👀 閲覧のみ";
      document.getElementById("lobbyMyRole").textContent = "選択したロール: " + roleLabel;
    } else if (filled >= total) {
      document.getElementById("lobbyJoinForm").style.display = "none";
      document.getElementById("lobbyMyInfo").style.display = "none";
    } else {
      document.getElementById("lobbyJoinForm").style.display = "";
      document.getElementById("lobbyMyInfo").style.display = "none";
    }

    // オーナー操作
    var ownerActions = document.getElementById("lobbyOwnerActions");
    var generateBtn = document.getElementById("lobbyGenerateBtn");
    var hint = document.getElementById("lobbyGenerateHint");
    if (state.isOwner) {
      ownerActions.style.display = "";
      var minPlayers = state.mode === "singles" ? 2 : (state.mode === "doubles" ? 4 : 2);
      var canGenerate = filled >= minPlayers;
      generateBtn.disabled = !canGenerate;
      if (!canGenerate) {
        hint.textContent = "最低 " + minPlayers + " 人必要です (現在 " + filled + " 人)";
      } else if (filled < total) {
        hint.textContent = filled + " / " + total + " 人。今の人数で生成することもできます。";
      } else {
        hint.textContent = "全員揃いました！";
      }
    } else {
      ownerActions.style.display = "none";
    }
  }

  async function handleSelfJoin() {
    var nameInput = document.getElementById("lobbyJoinName");
    var name = nameInput.value.trim();
    if (!name) {
      showToast("名前を入力してください");
      nameInput.focus();
      return;
    }
    var roleEl = document.querySelector('input[name="lobbyRole"]:checked');
    var chosenRole = roleEl ? roleEl.value : "viewer";
    var btn = document.getElementById("lobbyJoinBtn");
    btn.disabled = true;
    btn.textContent = "参加中...";
    try {
      var idx = await window.TennisShare.claimSlot(state.sessionCode, name);
      state.mySlot = { index: idx, name: name, role: chosenRole };
      saveMySlot(state.sessionCode, state.mySlot);
      showToast("🎲 あなたは " + (idx + 1) + " 番！");
      updateLobbyContent();
      applyEffectiveRole();
    } catch (e) {
      showToast("参加に失敗: " + (e.message || e));
      btn.disabled = false;
      btn.textContent = "🎲 参加する";
    }
  }

  async function handleLeaveSlot() {
    if (!state.mySlot) return;
    if (!confirm("参加をやめて別の名前で入り直しますか？")) return;
    var idx = state.mySlot.index;
    try {
      // 自分のスロットを空にする (トランザクションを使わず単純 update; 競合可能性は低い)
      var players = state.remotePlayers.slice();
      if (players[idx] === state.mySlot.name) {
        players[idx] = null;
        await window.TennisShare.updateSession(state.sessionCode, { players: players });
      }
    } catch (e) {}
    clearMySlot(state.sessionCode);
    state.mySlot = null;
    applyEffectiveRole();
    updateLobbyContent();
  }

  async function handleGenerate() {
    if (!state.isOwner) return;
    if (typeof state.onGenerate !== "function") {
      alert("生成コールバックが設定されていません");
      return;
    }
    var namedPlayers = state.remotePlayers.filter(function (p) { return p != null && p !== ""; });
    if (namedPlayers.length < 2) {
      alert("最低 2 人必要です");
      return;
    }
    var btn = document.getElementById("lobbyGenerateBtn");
    btn.disabled = true;
    btn.textContent = "生成中...";
    try {
      await state.onGenerate(namedPlayers, state.courtCount);
      // pushShareState は mode.js 内で呼ばれる想定
    } catch (e) {
      alert("生成に失敗: " + (e.message || e));
      btn.disabled = false;
      btn.textContent = "組み合わせを生成 →";
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // =========================================================
  // Push (デバウンス + echo 抑止)
  // =========================================================
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

  // =========================================================
  // ロール計算
  // =========================================================
  function computeEffectiveRoleValue() {
    if (!state.sessionCode) return "editor";
    if (state.isOwner) return "editor";
    // ロビー参加時の自己選択を優先
    if (state.mySlot && state.mySlot.role) return state.mySlot.role;
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
      createBtn.textContent = "共有を作成";
      joinBtn.style.display = "";
      indicator.style.display = "none";
    }
  }

  // =========================================================
  // 共有モーダル
  // =========================================================
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
        '<p class="share-desc">下のコード / URL を共有すると、他の人が参加できます。</p>' +
        '<div class="share-code-display" id="shareCodeDisplay"></div>' +
        '<div class="share-url-row">' +
          '<input type="text" id="shareUrlInput" readonly>' +
          '<button id="shareCopyBtn">コピー</button>' +
        "</div>" +
        '<div class="share-permission-section" id="sharePermissionSection">' +
          '<label class="share-permission-label">' +
            '<input type="checkbox" id="sharePermissionCheckbox">' +
            '<span><b>参加者にも得点入力を許可する</b><br><small>ロビーで選ばれた個別ロールも優先されます。</small></span>' +
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
        navigator.clipboard.writeText(text).then(done, function () { document.execCommand("copy"); done(); });
      } else { document.execCommand("copy"); done(); }
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
    startLobby: startLobby,
    pushState: pushState,
    isRemote: function () { return state.isApplyingRemote; },
    isActive: function () { return !!state.sessionCode; },
    isViewer: function () { return state.role === "viewer"; },
    isOwner: function () { return state.isOwner; },
    isInLobby: function () { return state.lobbyVisible; }
  };
})();
