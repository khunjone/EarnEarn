// ตรรกะล้วน (ไม่แตะฐานข้อมูล): สุ่มแบบมี seed, Circle Method, ตารางคะแนน

function newSeed() {
  return Array.from(crypto.getRandomValues(new Uint32Array(3)), n => n.toString(16).padStart(8, '0')).join('-');
}

// ตัวสุ่มที่ได้ผลเดิมเสมอเมื่อใช้ seed เดิม
function rngFrom(seed) {
  let x = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    x = Math.imul(x ^ seed.charCodeAt(i), 3432918353);
    x = (x << 13) | (x >>> 19);
  }
  let a = x >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(arr, seed) {
  const r = rngFrom(seed), a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// พบกันหมด: คืน rounds = [[ [a,b], ... ], ...] ทีมที่เจอบายไม่อยู่ในรอบนั้น
function roundRobin(ids) {
  const a = ids.length % 2 ? [...ids, null] : [...ids], n = a.length, rounds = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs = [];
    for (let i = 0; i < n / 2; i++) {
      const x = a[i], y = a[n - 1 - i];
      if (x && y) pairs.push((i === 0 ? r % 2 : (i + r) % 2) ? [y, x] : [x, y]);
    }
    rounds.push(pairs);
    a.splice(1, 0, a.pop());
  }
  return rounds;
}

// ตารางคะแนน ชนะ 3 เสมอ 1 แพ้ 0 เรียงตามเกณฑ์ tb (เช่น ['points','head_to_head',...])
// pos = {teamId: ลำดับจากการจับสลาก} ใช้เรียงเมื่อยังไม่มีผล
function standings(teams, matches, tb, pos = {}) {
  const S = new Map(teams.map(t => [t.id, {id: t.id, school: t.school, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0}]));
  const fin = matches.filter(m => m.status === 'finished' && S.has(m.team_a) && S.has(m.team_b));
  for (const m of fin) {
    const A = S.get(m.team_a), B = S.get(m.team_b);
    A.p++; B.p++; A.gf += m.score_a; A.ga += m.score_b; B.gf += m.score_b; B.ga += m.score_a;
    if (m.score_a > m.score_b) { A.w++; A.pts += 3; B.l++; }
    else if (m.score_a < m.score_b) { B.w++; B.pts += 3; A.l++; }
    else { A.d++; B.d++; A.pts++; B.pts++; }
  }
  const base = [...S.values()].sort((x, y) => (pos[x.id] ?? 1e9) - (pos[y.id] ?? 1e9));
  const h2h = ts => {
    const ids = new Set(ts.map(t => t.id)), v = {};
    ts.forEach(t => { v[t.id] = 0; });
    fin.filter(m => ids.has(m.team_a) && ids.has(m.team_b)).forEach(m => {
      if (m.score_a > m.score_b) v[m.team_a] += 3;
      else if (m.score_a < m.score_b) v[m.team_b] += 3;
      else { v[m.team_a]++; v[m.team_b]++; }
    });
    return t => v[t.id];
  };
  const rank = (ts, keys) => {
    if (ts.length < 2) return ts;
    const [k, ...rest] = keys;
    if (!k || k === 'draw') { if (ts.some(t => t.p)) ts.forEach(t => { t.tied = true; }); return ts; }
    const val = {points: t => t.pts, goal_diff: t => t.gf - t.ga, goals_for: t => t.gf, head_to_head: h2h(ts)}[k];
    const sorted = [...ts].sort((x, y) => val(y) - val(x)), out = [];
    for (let i = 0; i < sorted.length;) {
      let j = i + 1;
      while (j < sorted.length && val(sorted[j]) === val(sorted[i])) j++;
      out.push(...rank(sorted.slice(i, j), rest));
      i = j;
    }
    return out;
  };
  return rank(base, tb);
}

// ---------- แพ้คัดออก ----------
// ลำดับตำแหน่งมาตรฐาน เช่น 8 ทีม = 1,8,4,5,2,7,3,6 (1 พบ 8, 4 พบ 5, 2 พบ 7, 3 พบ 6)
function seedOrder(size) {
  let a = [1];
  while (a.length < size) { const n = a.length * 2; a = a.flatMap(s => [s, n + 1 - s]); }
  return a;
}

// สร้างแถว matches ของสายแพ้คัดออก ids เรียงตามลำดับจับสลาก (ลำดับ 1..N)
// ทีมลำดับต้น ๆ ได้บายเมื่อจำนวนทีมไม่ครบ 2^k (คู่ที่มีบายไม่สร้างเป็นนัด ทีมเลื่อนเข้ารอบถัดไปเลย)
function buildKnockout(sportId, ids, third) {
  const N = ids.length, R = Math.ceil(Math.log2(N)), size = 2 ** R;
  const order = seedOrder(size), at = s => (s <= N ? ids[s - 1] : null);
  const rounds = Array.from({length: R}, (_, k) =>
    Array.from({length: size / 2 ** (k + 1)}, (_, i) => ({id: crypto.randomUUID(), a: null, b: null})));
  rounds[0].forEach((m, i) => { m.a = at(order[2 * i]); m.b = at(order[2 * i + 1]); m.skip = !m.a || !m.b; });
  rounds[0].forEach((m, i) => { if (m.skip) rounds[1][i >> 1][i % 2 ? 'b' : 'a'] = m.a || m.b; });
  let c = 0;
  rounds.forEach(rd => rd.forEach(m => { if (!m.skip) m.code = String(++c).padStart(2, '0'); }));
  const name = k => { const t = size / 2 ** k; return t === 2 ? 'ชิงชนะเลิศ' : t === 4 ? 'รองชนะเลิศ' : `รอบ ${t} ทีม`; };
  const rows = [];
  rounds.forEach((rd, k) => rd.forEach((m, i) => {
    if (m.skip) return;
    const nx = rounds[k + 1]?.[i >> 1];
    const feed = j => { const f = rounds[k - 1]?.[2 * i + j]; return f && !f.skip ? `ผู้ชนะนัด ${f.code}` : null; };
    rows.push({id: m.id, sport_id: sportId, code: m.code, stage: 'knockout', round_label: name(k), round_no: k + 1, slot_no: i + 1,
      team_a: m.a, team_b: m.b, label_a: m.a ? null : feed(0), label_b: m.b ? null : feed(1),
      next_match: nx ? nx.id : null, next_slot: nx ? (i % 2 ? 'b' : 'a') : null});
  }));
  if (third && R >= 2 && rounds[R - 2].every(s => !s.skip)) {
    const [s1, s2] = rounds[R - 2];
    rows.push({id: crypto.randomUUID(), sport_id: sportId, code: String(++c).padStart(2, '0'), stage: 'knockout',
      round_label: 'ชิงที่ 3', round_no: R, slot_no: 2, team_a: null, team_b: null,
      label_a: `ผู้แพ้นัด ${s1.code}`, label_b: `ผู้แพ้นัด ${s2.code}`, next_match: null, next_slot: null});
  }
  return rows;
}
