// แท็บ "แข่งขัน" ของผู้จัด สำหรับระบบแพ้คัดออก (เรียกจาก viewPlay ใน play.js)
async function viewKnockout(body, picker, cur, teams, matches, dr, log) {
  const tn = Object.fromEntries(teams.map(t => [t.id, t.school]));
  const drawn = dr.length > 0, locked = cur.draw_locked;
  const pos = Object.fromEntries(dr.map(d => [d.team_id, d.position]));

  const draw = async () => {
    if (teams.length < 2) return flash('ต้องมีอย่างน้อย 2 ทีม', true);
    if ((drawn || matches.length) && !confirm(matches.some(m => m.status === 'finished')
      ? 'จับสลากใหม่จะลบคู่แข่งและผลการแข่งที่กรอกไว้ทั้งหมด ต้องการทำต่อ?' : 'จับสลากใหม่แทนผลเดิม?')) return;
    const seed = newSeed();
    const order = shuffle([...teams].sort((a, b) => a.id < b.id ? -1 : 1), seed);
    const rows = buildKnockout(cur.id, order.map(t => t.id), cur.third_place);
    try {
      must(await db.from('matches').delete().eq('sport_id', cur.id));
      must(await db.from('draw_results').delete().eq('sport_id', cur.id));
      must(await db.from('draw_results').insert(order.map((t, i) => ({team_id: t.id, sport_id: cur.id, position: i + 1}))));
      must(await db.from('draw_log').insert({sport_id: cur.id, seed}));
      must(await db.from('matches').insert(rows));
    } catch (e) { return fail(e); }
    const noThird = cur.third_place && !rows.some(r => r.round_label === 'ชิงที่ 3');
    flash(`จับสลากแล้ว สร้างคู่แข่ง ${rows.length} นัด` + (noThird ? ' (ไม่จัดนัดชิงที่ 3 เพราะจำนวนทีมน้อยเกินไป)' : '')); refresh();
  };
  const setLock = async v => {
    if (!confirm(v ? 'ล็อกแล้วจะเพิ่ม-ลบทีมและจับสลากใหม่ไม่ได้ จนกว่าจะปลดล็อก' : 'ปลดล็อกแล้วจะจับสลากใหม่ได้ ซึ่งลบผลการแข่งที่กรอกไว้ ต้องการปลดล็อก?')) return;
    const {error} = await db.from('sports').update({draw_locked: v}).eq('id', cur.id);
    if (error) return fail(error);
    flash(v ? 'ล็อกผลจับสลากแล้ว' : 'ปลดล็อกแล้ว'); refresh();
  };

  // บันทึกผล แล้วเลื่อนผู้ชนะเข้านัดถัดไป (และผู้แพ้รอบรองฯ เข้านัดชิงที่ 3)
  const saveKo = async (m, ia, ib, sel) => {
    const a = ia.value.trim(), b = ib.value.trim();
    let patch = {score_a: null, score_b: null, winner: null, status: 'scheduled'};
    if (a !== '' || b !== '') {
      if (!/^\d{1,3}$/.test(a) || !/^\d{1,3}$/.test(b)) return flash('กรอกคะแนนเป็นจำนวนเต็มทั้งสองฝั่ง', true);
      const x = +a, y = +b, w = x > y ? m.team_a : y > x ? m.team_b : sel.value;
      if (!w) return flash('คะแนนเท่ากัน ให้เลือกผู้ชนะ (ต่อเวลา/จุดโทษ)', true);
      patch = {score_a: x, score_b: y, winner: w, status: 'finished'};
    }
    const loser = patch.winner ? (patch.winner === m.team_a ? m.team_b : m.team_a) : null;
    const R = Math.max(...matches.map(x => x.round_no)), moves = [];
    const nx = matches.find(x => x.id === m.next_match);
    if (nx) moves.push([nx, m.next_slot === 'a' ? 'team_a' : 'team_b', patch.winner]);
    const th = matches.find(x => x.round_label === 'ชิงที่ 3');
    if (th && m.round_no === R - 1) moves.push([th, m.slot_no === 1 ? 'team_a' : 'team_b', loser]);
    for (const [t, key, id] of moves)
      if (t[key] !== id && t.status === 'finished') return flash('นัดถัดไปมีผลแล้ว ให้ล้างคะแนนนัดถัดไปก่อนแก้ผลนัดนี้', true);
    const r = await db.from('matches').update(patch).eq('id', m.id);
    if (r.error) return fail(r.error);
    for (const [t, key, id] of moves) {
      if (t[key] === id) continue;
      const e = await db.from('matches').update({[key]: id}).eq('id', t.id);
      if (e.error) return fail(e.error);
    }
    flash('บันทึกผลแล้ว'); refresh();
  };

  const matchEdit = m => {
    const ready = m.team_a && m.team_b;
    const mk = v => h('input', {type: 'number', min: 0, inputMode: 'numeric', value: v ?? '', disabled: !ready});
    const ia = mk(m.score_a), ib = mk(m.score_b);
    const tie = (m.score_a != null && m.score_a === m.score_b ? m.winner : '') ?? '';
    const sel = ready ? h('select', {}, opt('', 'ผู้ชนะเมื่อคะแนนเท่ากัน (ต่อเวลา/จุดโทษ)', tie),
      opt(m.team_a, tn[m.team_a], tie), opt(m.team_b, tn[m.team_b], tie)) : null;
    return h('div', {class: 'm'}, h('small', {class: 'mut'}, 'นัด ' + m.code),
      h('div', {class: 'sc'}, h('span', {}, tn[m.team_a] ?? m.label_a ?? '—'), ia),
      h('div', {class: 'sc'}, h('span', {}, tn[m.team_b] ?? m.label_b ?? '—'), ib),
      sel,
      ready ? h('button', {class: 'sm', onclick: () => saveKo(m, ia, ib, sel)}, 'บันทึกผล') : h('p', {class: 'mut'}, 'รอผลนัดก่อนหน้า'));
  };

  const groups = [];
  matches.forEach(m => {
    let g = groups.find(x => x.label === m.round_label);
    if (!g) groups.push(g = {label: m.round_label, ms: []});
    g.ms.push(m);
  });
  const ordered = teams.filter(t => pos[t.id]).sort((a, b) => pos[a.id] - pos[b.id]);
  body.append(picker,
    h('div', {class: 'card'}, h('h2', {}, 'จับสลาก'),
      h('p', {class: 'mut'}, `${teams.length} ทีม, ` + (!drawn ? 'ยังไม่จับสลาก' : locked ? 'ผลจับสลากถูกล็อกแล้ว' : 'จับสลากแล้ว ยังไม่ล็อก')),
      h('p', {class: 'mut'}, 'ลำดับจากการจับสลากกำหนดตำแหน่งในสาย ถ้าจำนวนทีมไม่ครบ 2, 4, 8, 16 ทีมลำดับต้น ๆ จะได้บาย'),
      drawn && dr.length !== teams.length ? h('p', {class: 'err'}, 'จำนวนทีมเปลี่ยนไปหลังจับสลาก ควรจับสลากใหม่') : null,
      locked ? null : h('button', {class: 'btn', onclick: draw}, drawn ? 'จับสลากใหม่และสร้างสาย' : 'จับสลากและสร้างสาย'),
      drawn && !locked ? h('button', {class: 'btn alt', style: 'margin-top:8px', onclick: () => setLock(true)}, 'ล็อกผลจับสลาก') : null,
      locked ? h('button', {class: 'btn alt', onclick: () => setLock(false)}, 'ปลดล็อก') : null,
      log[0] ? h('p', {class: 'mut'}, 'seed การสุ่มล่าสุด: ' + log[0].seed) : null,
      ...ordered.map((t, i) => h('div', {class: 'row'}, h('span', {}, `${i + 1}. ${t.school}`)))),
    matches.length ? h('div', {class: 'card'}, h('h2', {}, 'สายแข่งขัน'), bracketView(matches, tn)) : null,
    matches.length ? h('div', {class: 'card'}, h('h2', {}, 'กรอกผลการแข่ง'),
      ...groups.flatMap(g => [h('h3', {}, g.label), ...g.ms.map(matchEdit)])) : null);
}
