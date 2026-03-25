/* ============================================
   テニス ダブルス 組み合わせメーカー - ロジック
   ============================================ */

// --- グローバル変数 ---
let courtCount = 2;
let playerCount = 8;
let players = [];
let activePlayers = [];
let matches = [];
let scores = {};
const TOTAL_MATCHES = 30;

let memberChangeRound = -1;
let pendingActive = [];

// --- ステップ切り替え ---
function showStep(stepId) {
  document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
  document.getElementById(stepId).classList.add('active');
}

function goToStep1() { showStep('step1'); }

function goToStep2() {
  const courtInput = parseInt(document.getElementById('courtCount').value);
  const playerInput = parseInt(document.getElementById('playerCountInput').value);
  const infoEl = document.getElementById('step1Info');
  const errorEl = document.getElementById('step1Error');

  infoEl.classList.remove('visible'); infoEl.textContent = '';
  errorEl.classList.remove('visible'); errorEl.textContent = '';

  if (isNaN(courtInput) || courtInput < 1) {
    errorEl.textContent = 'コート数は1以上を入力してください。';
    errorEl.classList.add('visible'); return;
  }
  if (isNaN(playerInput) || playerInput < 4) {
    errorEl.textContent = '参加人数は4人以上を入力してください。';
    errorEl.classList.add('visible'); return;
  }

  courtCount = courtInput;
  playerCount = playerInput;
  const maxOnCourt = courtCount * 4;

  if (playerCount > maxOnCourt) {
    infoEl.textContent = 'ℹ️ ' + courtCount + 'コート(最大' + maxOnCourt + '人)に対して' + playerCount + '人です。毎ラウンド' + (playerCount - maxOnCourt) + '人が休みになります。';
    infoEl.classList.add('visible');
  } else if (playerCount < maxOnCourt) {
    const activeCourts = Math.floor(playerCount / 4);
    if (activeCourts < 1) {
      errorEl.textContent = 'ダブルスには最低4人必要です。';
      errorEl.classList.add('visible'); return;
    }
    infoEl.textContent = 'ℹ️ ' + playerCount + '人なので、実際に使用するコートは' + activeCourts + 'コートになります（' + (playerCount - activeCourts * 4) + '人が毎ラウンド休み）。';
    infoEl.classList.add('visible');
  }

  renderPlayerInputs();
  showStep('step2');
}

function goToStep2FromStep3() { showStep('step2'); }

function goToStep3() {
  players = [];
  for (let i = 0; i < playerCount; i++) {
    const input = document.getElementById('player-' + i);
    const name = input.value.trim() || ('プレイヤー' + (i + 1));
    players.push(name);
  }
  activePlayers = Array.from({ length: playerCount }, function(_, i) { return i; });
  showStep('step3');
}

function renderPlayerInputs() {
  const container = document.getElementById('playerInputs');
  container.innerHTML = '';
  for (let i = 0; i < playerCount; i++) {
    const group = document.createElement('div');
    group.className = 'player-input-group';
    group.innerHTML = '<span class="player-number">' + (i + 1) + '</span><input type="text" id="player-' + i + '" placeholder="プレイヤー' + (i + 1) + 'の名前">';
    container.appendChild(group);
  }
}

function generateMatches() {
  const firstMatchType = document.querySelector('input[name="firstMatch"]:checked').value;
  matches = [];
  scores = {};
  generateRoundsFrom(0, firstMatchType);
  renderMatchList();
  showStep('step4');
}

function generateRoundsFrom(fromRound, firstMatchType) {
  var totalPlayers = players.length;
  var currentActive = activePlayers.slice();
  if (currentActive.length < 4) return;

  var pairCount = [];
  var oppCount = [];
  var lastPlayedRound = [];
  var playCountArr = [];
  var i, j;
  for (i = 0; i < totalPlayers; i++) {
    pairCount[i] = [];
    oppCount[i] = [];
    for (j = 0; j < totalPlayers; j++) {
      pairCount[i][j] = 0;
      oppCount[i][j] = 0;
    }
    lastPlayedRound[i] = -2;
    playCountArr[i] = 0;
  }

  if (fromRound > 0 && matches.length > 0) {
    for (i = 0; i < matches.length; i++) {
      var m = matches[i];
      var r0 = m.round - 1;
      pairCount[m.team1[0]][m.team1[1]]++;
      pairCount[m.team1[1]][m.team1[0]]++;
      pairCount[m.team2[0]][m.team2[1]]++;
      pairCount[m.team2[1]][m.team2[0]]++;
      var t1 = m.team1, t2 = m.team2;
      for (var a = 0; a < t1.length; a++) {
        for (var b = 0; b < t2.length; b++) {
          oppCount[t1[a]][t2[b]]++;
          oppCount[t2[b]][t1[a]]++;
        }
      }
      var all = t1.concat(t2);
      for (var k = 0; k < all.length; k++) {
        lastPlayedRound[all[k]] = r0;
        playCountArr[all[k]]++;
      }
    }
  }

  var matchIndex = matches.length;
  var activeCourts = Math.min(courtCount, Math.floor(currentActive.length / 4));
  if (activeCourts < 1) return;
  var matchesPerRound = activeCourts;
  var totalRounds = Math.ceil(TOTAL_MATCHES / matchesPerRound);

  for (var round = fromRound; round < totalRounds; round++) {
    var roundNumber = round + 1;
    var roundActiveCourts = Math.min(courtCount, Math.floor(currentActive.length / 4));
    if (roundActiveCourts < 1) break;
    var roundPlayersPerRound = roundActiveCourts * 4;

    var roundPlayers;
    if (round === 0 && firstMatchType === 'sequential') {
      roundPlayers = currentActive.slice(0, roundPlayersPerRound);
    } else {
      roundPlayers = selectPlayersForRound(currentActive, roundPlayersPerRound, lastPlayedRound, round, playCountArr);
    }

    var roundMatchups;
    if (round === 0 && firstMatchType === 'sequential') {
      roundMatchups = [];
      for (var c = 0; c < roundActiveCourts; c++) {
        var base = c * 4;
        roundMatchups.push({ team1: [roundPlayers[base], roundPlayers[base+1]], team2: [roundPlayers[base+2], roundPlayers[base+3]] });
      }
    } else {
      roundMatchups = assignTeams(roundPlayers, roundActiveCourts, pairCount, oppCount);
    }

    for (var mi = 0; mi < roundMatchups.length; mi++) {
      if (matchIndex >= TOTAL_MATCHES) break;
      var matchup = roundMatchups[mi];
      matches.push({ round: roundNumber, court: mi + 1, team1: matchup.team1, team2: matchup.team2 });
      pairCount[matchup.team1[0]][matchup.team1[1]]++;
      pairCount[matchup.team1[1]][matchup.team1[0]]++;
      pairCount[matchup.team2[0]][matchup.team2[1]]++;
      pairCount[matchup.team2[1]][matchup.team2[0]]++;
      for (var a2 = 0; a2 < matchup.team1.length; a2++) {
        for (var b2 = 0; b2 < matchup.team2.length; b2++) {
          oppCount[matchup.team1[a2]][matchup.team2[b2]]++;
          oppCount[matchup.team2[b2]][matchup.team1[a2]]++;
        }
      }
      var allM = matchup.team1.concat(matchup.team2);
      for (var k2 = 0; k2 < allM.length; k2++) {
        lastPlayedRound[allM[k2]] = round;
        playCountArr[allM[k2]]++;
      }
      matchIndex++;
    }
    if (matchIndex >= TOTAL_MATCHES) break;
  }
}

function selectPlayersForRound(activePlayersList, needed, lastPlayedRound, currentRound, playCountArr) {
  var totalActive = activePlayersList.length;
  var restCount = totalActive - needed;
  if (restCount <= 0) return activePlayersList.slice();

  var allPlayers = activePlayersList.slice();
  var consecutiveRest = {};
  for (var i = 0; i < allPlayers.length; i++) {
    var p = allPlayers[i];
    var gap = currentRound - 1 - lastPlayedRound[p];
    consecutiveRest[p] = gap > 0 ? gap : 0;
  }

  var prevPlayedSet = {};
  if (currentRound > 0) {
    for (var i2 = 0; i2 < allPlayers.length; i2++) {
      if (lastPlayedRound[allPlayers[i2]] === currentRound - 1) prevPlayedSet[allPlayers[i2]] = true;
    }
  }

  var prevPlayed = allPlayers.filter(function(x) { return prevPlayedSet[x]; });
  var prevRested = allPlayers.filter(function(x) { return !prevPlayedSet[x]; });
  shuffleArray(prevPlayed);
  shuffleArray(prevRested);

  var sortByPriority = function(a, b) {
    var rd = (consecutiveRest[b] || 0) - (consecutiveRest[a] || 0);
    if (rd !== 0) return rd;
    var cd = playCountArr[a] - playCountArr[b];
    if (cd !== 0) return cd;
    return 0;
  };
  prevPlayed.sort(sortByPriority);
  prevRested.sort(sortByPriority);

  var selected = [];
  var urgent = prevRested.filter(function(p) { return consecutiveRest[p] >= 2; });
  var urgentToAdd = urgent.slice(0, Math.min(urgent.length, needed));
  for (var u = 0; u < urgentToAdd.length; u++) selected.push(urgentToAdd[u]);

  var remaining = needed - selected.length;
  if (remaining > 0) {
    var selectedSet = {};
    for (var s = 0; s < selected.length; s++) selectedSet[selected[s]] = true;
    var nonUrgentRested = prevRested.filter(function(p) { return !selectedSet[p]; });

    var restedAvailable = nonUrgentRested.length;
    var playedAvailable = prevPlayed.length;
    var fromRestedCount, fromPlayedCount;

    if (urgent.length >= needed - 1) {
      fromRestedCount = Math.min(restedAvailable, remaining);
      fromPlayedCount = remaining - fromRestedCount;
    } else if (restedAvailable >= remaining && playedAvailable > 0) {
      var maxFromPlayed;
      if (restCount > needed && restedAvailable > remaining) {
        maxFromPlayed = Math.min(1, playedAvailable);
      } else {
        maxFromPlayed = Math.min(Math.ceil(remaining * 0.5), playedAvailable);
      }
      var minFromPlayed = Math.min(1, playedAvailable);
      var range = Math.max(maxFromPlayed - minFromPlayed, 0);
      fromPlayedCount = minFromPlayed + Math.floor(Math.random() * (range + 1));
      fromRestedCount = remaining - fromPlayedCount;
    } else if (restedAvailable >= remaining) {
      fromRestedCount = remaining;
      fromPlayedCount = 0;
    } else {
      fromRestedCount = restedAvailable;
      fromPlayedCount = remaining - fromRestedCount;
    }

    for (var r = 0; r < fromRestedCount; r++) selected.push(nonUrgentRested[r]);
    for (var p2 = 0; p2 < fromPlayedCount; p2++) selected.push(prevPlayed[p2]);
  }
  return selected;
}

function assignTeams(roundPlayers, courts, pairCount, oppCount) {
  var shuffled = roundPlayers.slice();
  shuffleArray(shuffled);
  var bestMatchups = null;
  var bestScore = Infinity;

  for (var attempt = 0; attempt < 50; attempt++) {
    var candidate = shuffled.slice();
    shuffleArray(candidate);
    var matchups = [];
    var totalScore = 0;
    for (var c = 0; c < courts; c++) {
      var base = c * 4;
      var p1 = candidate[base], p2 = candidate[base+1], p3 = candidate[base+2], p4 = candidate[base+3];
      var ps = pairCount[p1][p2] + pairCount[p3][p4];
      var os = oppCount[p1][p3] + oppCount[p1][p4] + oppCount[p2][p3] + oppCount[p2][p4];
      totalScore += ps * 3 + os;
      matchups.push({ team1: [p1, p2], team2: [p3, p4] });
    }
    if (totalScore < bestScore) { bestScore = totalScore; bestMatchups = matchups; }
  }
  return bestMatchups;
}

function shuffleArray(arr) {
  for (var i = arr.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
  }
}

function renderMatchList() {
  var container = document.getElementById('matchList');
  container.innerHTML = '';
  var currentRound = 0;

  for (var idx = 0; idx < matches.length; idx++) {
    var match = matches[idx];
    if (match.round !== currentRound) {
      currentRound = match.round;

      if (currentRound > 1) {
        var changeDiv = document.createElement('div');
        changeDiv.className = 'member-change-area';
        changeDiv.innerHTML = '<button class="btn member-change-btn" onclick="openMemberModal(' + currentRound + ')">👥 第' + currentRound + 'ラウンドからメンバー変更</button>';
        container.appendChild(changeDiv);
      }

      var roundHeader = document.createElement('div');
      roundHeader.className = 'match-round-header';
      roundHeader.textContent = '第' + currentRound + 'ラウンド';
      container.appendChild(roundHeader);

      var playingPlayers = {};
      for (var j = 0; j < matches.length; j++) {
        if (matches[j].round === currentRound) {
          matches[j].team1.forEach(function(p) { playingPlayers[p] = true; });
          matches[j].team2.forEach(function(p) { playingPlayers[p] = true; });
        }
      }
      var restNames = [];
      for (var k = 0; k < activePlayers.length; k++) {
        if (!playingPlayers[activePlayers[k]]) restNames.push(players[activePlayers[k]]);
      }
      if (restNames.length > 0) {
        var restCard = document.createElement('div');
        restCard.className = 'rest-card';
        restCard.textContent = '☕ 休み: ' + restNames.join(', ');
        container.appendChild(restCard);
      }
    }

    var savedScore = scores[idx];
    var card = document.createElement('div');
    card.className = 'match-card' + (savedScore ? ' completed' : '');
    card.id = 'match-' + idx;
    card.innerHTML = '<div class="match-header"><span class="match-number">' + (savedScore ? '✅ ' : '') + '第' + (idx + 1) + '試合</span><span class="court-label">コート ' + match.court + '</span></div><div class="match-teams"><span class="team">' + players[match.team1[0]] + ' ・ ' + players[match.team1[1]] + '</span><span class="vs">VS</span><span class="team">' + players[match.team2[0]] + ' ・ ' + players[match.team2[1]] + '</span></div><div class="score-area"><input type="number" id="score1-' + idx + '" placeholder="得点" min="0" value="' + (savedScore ? savedScore.score1 : '') + '" oninput="onScoreInput(' + idx + ')"><span class="score-dash">−</span><input type="number" id="score2-' + idx + '" placeholder="得点" min="0" value="' + (savedScore ? savedScore.score2 : '') + '" oninput="onScoreInput(' + idx + ')"></div>';
    container.appendChild(card);
  }

  if (matches.length > 0 && matches.length < TOTAL_MATCHES) {
    var lastRound = matches[matches.length - 1].round;
    var changeDiv2 = document.createElement('div');
    changeDiv2.className = 'member-change-area';
    changeDiv2.innerHTML = '<button class="btn member-change-btn" onclick="openMemberModal(' + (lastRound + 1) + ')">👥 第' + (lastRound + 1) + 'ラウンドからメンバー変更</button>';
    container.appendChild(changeDiv2);
  }

  document.getElementById('aggregateArea').classList.add('visible');
}

function openMemberModal(fromRound) {
  memberChangeRound = fromRound;
  pendingActive = activePlayers.slice();
  document.getElementById('memberModalDesc').textContent = '第' + fromRound + 'ラウンド以降のメンバーを変更します。';
  renderMemberList();
  document.getElementById('memberModal').style.display = 'flex';
}

function closeMemberModal() {
  document.getElementById('memberModal').style.display = 'none';
}

function renderMemberList() {
  var container = document.getElementById('memberList');
  container.innerHTML = '';
  for (var i = 0; i < players.length; i++) {
    var isActive = pendingActive.indexOf(i) >= 0;
    var item = document.createElement('div');
    item.className = 'member-item ' + (isActive ? 'active' : 'inactive');
    item.innerHTML = '<span class="member-name">' + players[i] + '</span><button class="btn ' + (isActive ? 'member-leave-btn' : 'member-join-btn') + '" onclick="toggleMember(' + i + ')">' + (isActive ? '離脱' : '参加') + '</button>';
    container.appendChild(item);
  }
}

function toggleMember(idx) {
  var pos = pendingActive.indexOf(idx);
  if (pos >= 0) pendingActive.splice(pos, 1);
  else pendingActive.push(idx);
  renderMemberList();
}

function addNewPlayer() {
  var input = document.getElementById('newPlayerName');
  var name = input.value.trim();
  if (!name) return;
  var newIdx = players.length;
  players.push(name);
  pendingActive.push(newIdx);
  input.value = '';
  renderMemberList();
}

function applyMemberChange() {
  if (pendingActive.length < 4) { alert('ダブルスには最低4人必要です。'); return; }
  activePlayers = pendingActive.slice();
  closeMemberModal();
  var fromRound = memberChangeRound;
  matches = matches.filter(function(m) { return m.round < fromRound; });
  var remainingCount = matches.length;
  Object.keys(scores).forEach(function(key) {
    if (parseInt(key) >= remainingCount) delete scores[key];
  });
  generateRoundsFrom(fromRound - 1, 'random');
  renderMatchList();
}

function goToStep5() {
  document.getElementById('aggregateArea').classList.remove('visible');
  showResults();
  showStep('step5');
}

function onScoreInput(idx) {
  var s1 = document.getElementById('score1-' + idx).value;
  var s2 = document.getElementById('score2-' + idx).value;
  var card = document.getElementById('match-' + idx);
  if (s1 !== '' && s2 !== '') {
    scores[idx] = { score1: parseInt(s1), score2: parseInt(s2) };
    if (card) {
      card.classList.add('completed');
      var numEl = card.querySelector('.match-number');
      if (numEl && numEl.textContent.indexOf('✅') === -1) numEl.textContent = '✅ ' + numEl.textContent;
    }
  } else {
    delete scores[idx];
    if (card) {
      card.classList.remove('completed');
      var numEl2 = card.querySelector('.match-number');
      if (numEl2) numEl2.textContent = numEl2.textContent.replace('✅ ', '');
    }
  }
}

function showResults() {
  var stats = [];
  for (var i = 0; i < players.length; i++) {
    stats.push({ index: i, name: players[i], wins: 0, losses: 0, draws: 0, pointsFor: 0, pointsAgainst: 0, diff: 0, matchCount: 0 });
  }

  for (var idx = 0; idx < matches.length; idx++) {
    var score = scores[idx];
    if (!score) continue;
    var s1 = score.score1, s2 = score.score2;
    var match = matches[idx];
    match.team1.forEach(function(p) {
      stats[p].pointsFor += s1; stats[p].pointsAgainst += s2;
      stats[p].diff += (s1 - s2); stats[p].matchCount++;
      if (s1 > s2) stats[p].wins++; else if (s1 < s2) stats[p].losses++; else stats[p].draws++;
    });
    match.team2.forEach(function(p) {
      stats[p].pointsFor += s2; stats[p].pointsAgainst += s1;
      stats[p].diff += (s2 - s1); stats[p].matchCount++;
      if (s2 > s1) stats[p].wins++; else if (s2 < s1) stats[p].losses++; else stats[p].draws++;
    });
  }

  var activeStats = stats.filter(function(s) { return s.matchCount > 0; });
  activeStats.sort(function(a, b) {
    if (b.diff !== a.diff) return b.diff - a.diff;
    if (b.wins !== a.wins) return b.wins - a.wins;
    return a.losses - b.losses;
  });
  for (var r = 0; r < activeStats.length; r++) activeStats[r].rank = r + 1;

  renderResults(activeStats);
  document.getElementById('resultArea').style.display = 'block';
}

function renderResults(stats) {
  var container = document.getElementById('resultTable');
  var html = '<table class="result-table"><thead><tr><th>順位</th><th>名前</th><th>試合数</th><th>勝</th><th>敗</th><th>分</th><th>得点</th><th>失点</th><th>得失点差</th></tr></thead><tbody>';

  for (var i = 0; i < stats.length; i++) {
    var s = stats[i];
    var rankClass = '', badgeClass = 'other';
    if (s.rank === 1) { rankClass = 'rank-1'; badgeClass = 'gold'; }
    else if (s.rank === 2) { rankClass = 'rank-2'; badgeClass = 'silver'; }
    else if (s.rank === 3) { rankClass = 'rank-3'; badgeClass = 'bronze'; }
    var diffDisplay = s.diff > 0 ? '+' + s.diff : '' + s.diff;
    html += '<tr class="' + rankClass + '"><td><span class="rank-badge ' + badgeClass + '">' + s.rank + '</span></td><td>' + s.name + '</td><td>' + s.matchCount + '</td><td>' + s.wins + '</td><td>' + s.losses + '</td><td>' + s.draws + '</td><td>' + s.pointsFor + '</td><td>' + s.pointsAgainst + '</td><td>' + diffDisplay + '</td></tr>';
  }

  html += '</tbody></table>';
  container.innerHTML = html;
}

function backToMatches() {
  document.getElementById('aggregateArea').classList.add('visible');
  showStep('step4');
}

function resetApp() {
  if (!confirm('すべてのデータをリセットしますか？')) return;
  players = []; activePlayers = []; matches = []; scores = {};
  document.getElementById('aggregateArea').classList.remove('visible');
  showStep('step1');
}
