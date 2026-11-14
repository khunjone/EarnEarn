// แท็บ "แข่งขัน" ของผู้จัด: จับสลาก สร้างคู่ กรอกผล (ระบบพบกันหมด)
async function viewPlay(body) {
  const sports = must(await db.from('sports').select('*').order('name').order('age_group'));
  if (!sports.length) return body.append(h('p', {class: 'mut'}, 'ยังไม่มีรายการแข่ง เพิ่มที่แท็บ "รายการแข่ง" ก่อน'));
  if (!sports.some(s => s.id === curSport)) curSport = sports[0].id;
  const cur = sports.find(s => s.id === curSport);
  const [teams, matches, dr, log] = (await Promise.all([
    db.from('teams').select('id,school').eq('sport_id', cur.id),
    db.from('matches').select('*').eq('sport_id', cur.id).order('round_no').order('slot_no'),
    db.from('draw_results').select('team_id,position').eq('sport_id', cur.id),
    db.from('draw_log').select('seed').eq('sport_id', cur.id).order('created_at', {ascending: false}).limit(1)])).map(must);
  const picker = h('div', {class: 'card'}, lab('รายการแข่ง', h('select', {onchange: ev => { curSport = ev.target.value; flash(''); render(); }},
    ...sports.map(s => opt(s.id, sportName(s), curSport)))));
  if (cur.system !== 'round_robin')
    return body.append(picker, h('p', {class: 'mut'}, `ระบบ "${SYS[cur.system]}" จะเปิดใช้ในขั้นถัดไป`));

  const tn = Object.fromEntries(teams.map(t => [t.id, t.school]));
  const pos = Object.fromEntries(dr.map(d => [d.team_id, d.position]));
  const drawn = dr.length > 0, locked = cur.draw_locked;

  const draw = async () => {
    if (teams.length < 2) return flash('ต้องมีอย่างน้อย 2 ทีม', true);
    if ((drawn || matches.length) && !confirm(matches.some(m => m.status === 'finished')
      ? 'จับสลากใหม่จะลบคู่แข่งและผลการแข่งที่กรอกไว้ทั้งหมด ต้องการทำต่อ?' : 'จับสลากใหม่แทนผลเดิม?')) return;
    const seed = newSeed();
    const order = shuffle([...teams].sort((a, b) => a.id < b.id ? -1 : 1), seed);
    const rows = [];
    roundRobin(order.map(t => t.id)).forEach((r, ri) => r.forEach(([a, b], i) => rows.push({
      sport_id: cur.id, stage: 'group', round_label: `รอบที่ ${ri + 1}`, round_no: ri + 1, slot_no: i + 1,
      code: String(rows.length + 1).padStart(2, '0'), team_a: a, team_b: b})));
    try {
      must(await db.from('matches').delete().eq('sport_id', cur.id));
      must(await db.from('draw_results').delete().eq('sport_id', cur.id));
      must(await db.from('draw_results').insert(order.map((t, i) => ({team_id: t.id, sport_id: cur.id, position: i + 1}))));
      must(await db.from('draw_log').insert({sport_id: cur.id, seed}));
      must(await db.from('matches').insert(rows));
    } catch (e) { return fail(e); }
    flash(`จับสลากแล้ว สร้างคู่แข่ง ${rows.length} นัด`); refresh();
  };
  const setLock = async v => {
    if (!confirm(v ? 'ล็อกแล้วจะเพิ่ม-ลบทีมและจับสลากใหม่ไม่ได้ จนกว่าจะปลดล็อก' : 'ปลดล็อกแล้วจะจับสลากใหม่ได้ ซึ่งลบผลการแข่งที่กรอกไว้ ต้องการปลดล็อก?')) return;
    const {error} = await db.from('sports').update({draw_locked: v}).eq('id', cur.id);
    if (error) return fail(error);
    flash(v ? 'ล็อกผลจับสลากแล้ว' : 'ปลดล็อกแล้ว'); refresh();
  };
  const saveScore = async (m, ia, ib) => {
    const a = ia.value.trim(), b = ib.value.trim();
    let patch = {score_a: null, score_b: null, winner: null, status: 'scheduled'};
    if (a !== '' || b !== '') {
      if (!/^\d{1,3}$/.test(a) || !/^\d{1,3}$/.test(b)) return flash('กรอกคะแนนเป็นจำนวนเต็มทั้งสองฝั่ง', true);
      const x = +a, y = +b;
      patch = {score_a: x, score_b: y, winner: x > y ? m.team_a : y > x ? m.team_b : null, status: 'finished'};
    }
    const {error} = await db.from('matches').update(patch).eq('id', m.id);
    if (error) return fail(error);
    flash('บันทึกผลแล้ว'); refresh();
  };
  const matchEdit = m => {
    const mk = v => h('input', {type: 'number', min: 0, inputMode: 'numeric', value: v ?? ''});
    const ia = mk(m.score_a), ib = mk(m.score_b);
    return h('div', {class: 'm'},
      h('div', {class: 'sc'}, h('span', {}, tn[m.team_a] ?? '—'), ia),
      h('div', {class: 'sc'}, h('span', {}, tn[m.team_b] ?? '—'), ib),
      h('button', {class: 'sm', onclick: () => saveScore(m, ia, ib)}, 'บันทึกผล'));
  };

  const rounds = [...new Set(matches.map(m => m.round_no))];
  const ordered = teams.filter(t => pos[t.id]).sort((a, b) => pos[a.id] - pos[b.id]);
  body.append(picker,
    h('div', {class: 'card'}, h('h2', {}, 'จับสลาก'),
      h('p', {class: 'mut'}, `${teams.length} ทีม, ` + (!drawn ? 'ยังไม่จับสลาก' : locked ? 'ผลจับสลากถูกล็อกแล้ว' : 'จับสลากแล้ว ยังไม่ล็อก')),
      drawn && dr.length !== teams.length ? h('p', {class: 'err'}, 'จำนวนทีมเปลี่ยนไปหลังจับสลาก ควรจับสลากใหม่') : null,
      locked ? null : h('button', {class: 'btn', onclick: draw}, drawn ? 'จับสลากใหม่และสร้างคู่' : 'จับสลากและสร้างคู่'),
      drawn && !locked ? h('button', {class: 'btn alt', style: 'margin-top:8px', onclick: () => setLock(true)}, 'ล็อกผลจับสลาก') : null,
      locked ? h('button', {class: 'btn alt', onclick: () => setLock(false)}, 'ปลดล็อก') : null,
      log[0] ? h('p', {class: 'mut'}, 'seed การสุ่มล่าสุด: ' + log[0].seed) : null,
      ...ordered.map((t, i) => h('div', {class: 'row'}, h('span', {}, `${i + 1}. ${t.school}`)))),
    drawn ? h('div', {class: 'card'}, h('h2', {}, 'ตารางคะแนน'),
      standingsTable(standings(teams, matches, cur.tiebreak, pos))) : null,
    matches.length ? h('div', {class: 'card'}, h('h2', {}, 'กรอกผลการแข่ง'), ...rounds.flatMap(r => {
      const rest = teams.filter(t => !matches.some(m => m.round_no === r && (m.team_a === t.id || m.team_b === t.id)));
      return [h('h3', {}, `รอบที่ ${r}`), ...matches.filter(m => m.round_no === r).map(matchEdit),
        rest.length ? h('p', {class: 'mut'}, 'พัก: ' + rest.map(t => t.school).join(', ')) : null];
    })) : null);
}
