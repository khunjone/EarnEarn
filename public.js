// หน้าสำหรับผู้ชม: ตารางแข่ง และ ผล-คะแนน (ใช้ h, must, opt, lab, sportName, SYS จาก admin.js)
let pubSport = null;

function standingsTable(rows) {
  const heads = ['ทีม', 'แข่ง', 'ชนะ', 'เสมอ', 'แพ้', 'ผลต่าง', 'แต้ม'];
  const diff = r => (r.gf - r.ga > 0 ? '+' : '') + (r.gf - r.ga);
  return h('div', {},
    h('div', {class: 'tw'}, h('table', {},
      h('thead', {}, h('tr', {}, h('th', {}, '#'), ...heads.map((t, i) => h('th', {class: i ? '' : 'tl'}, t)))),
      h('tbody', {}, ...rows.map((r, i) => h('tr', {},
        h('td', {}, i + 1), h('td', {class: 'tl'}, r.school + (r.tied ? ' *' : '')),
        h('td', {}, r.p), h('td', {}, r.w), h('td', {}, r.d), h('td', {}, r.l), h('td', {}, diff(r)), h('td', {}, h('b', {}, r.pts))))))),
    rows.some(r => r.tied) ? h('p', {class: 'mut'}, '* เท่ากันทุกเกณฑ์ ต้องจับสลากตัดสิน') : null);
}

async function renderPublic() {
  const sc = document.getElementById('schedule'), rs = document.getElementById('results'), br = document.getElementById('bracket');
  try {
    const [sports, teams, matches, dr] = (await Promise.all([
      db.from('sports').select('*').order('name').order('age_group'),
      db.from('teams').select('id,school,sport_id'),
      db.from('matches').select('*').order('round_no').order('slot_no'),
      db.from('draw_results').select('team_id,position')])).map(must);
    const active = sports.filter(s => matches.some(m => m.sport_id === s.id));
    if (!active.length) {
      const empty = t => h('div', {class: 'card'}, h('h2', {}, t), h('p', {class: 'mut'}, 'ยังไม่มีข้อมูล ส่วนนี้จะเปิดใช้เมื่อสร้างตารางแข่งขันแล้ว'));
      sc.replaceChildren(empty('ตารางแข่ง')); rs.replaceChildren(empty('ผล-คะแนน')); br.replaceChildren(empty('สายน็อกเอาต์'));
      return;
    }
    if (!active.some(s => s.id === pubSport)) pubSport = active[0].id;
    const cur = active.find(s => s.id === pubSport);
    const ts = teams.filter(t => t.sport_id === cur.id), ms = matches.filter(m => m.sport_id === cur.id);
    const tn = Object.fromEntries(ts.map(t => [t.id, t.school]));
    const pos = Object.fromEntries(dr.map(d => [d.team_id, d.position]));
    const picker = () => h('div', {class: 'card'}, lab('รายการแข่ง', h('select', {onchange: e => { pubSport = e.target.value; renderPublic(); }},
      ...active.map(s => opt(s.id, sportName(s), pubSport)))));
    const side = (id, lb, sc2) => h('div', {class: 'sc'}, h('span', {}, tn[id] ?? lb ?? '—'), h('b', {}, sc2));
    const card = m => h('div', {class: 'm'}, side(m.team_a, m.label_a, m.score_a), side(m.team_b, m.label_b, m.score_b),
      h('div', {class: 'mut'}, m.status === 'finished' ? 'จบการแข่งขัน' : 'ยังไม่แข่ง'));
    const ko = cur.system === 'knockout';
    const rounds = [...new Set(ms.map(m => (ko ? m.round_label : m.round_no)))];
    const inRound = (m, r) => (ko ? m.round_label : m.round_no) === r;
    sc.replaceChildren(picker(), h('div', {class: 'card'}, h('h2', {}, sportName(cur)), h('p', {class: 'mut'}, SYS[cur.system]),
      ...rounds.flatMap(r => {
        const rest = ts.filter(t => !ms.some(m => inRound(m, r) && (m.team_a === t.id || m.team_b === t.id)));
        return [h('h3', {}, ko ? r : `รอบที่ ${r}`), ...ms.filter(m => inRound(m, r)).map(card),
          !ko && rest.length ? h('p', {class: 'mut'}, 'พัก: ' + rest.map(t => t.school).join(', ')) : null];
      })));
    rs.replaceChildren(picker(), h('div', {class: 'card'}, h('h2', {}, 'ตารางคะแนน ' + sportName(cur)),
      cur.system === 'round_robin' ? standingsTable(standings(ts, ms, cur.tiebreak, pos)) : h('p', {class: 'mut'}, ko ? 'ระบบแพ้คัดออกไม่มีตารางคะแนน ดูผลที่แท็บ "สายน็อกเอาต์"' : 'ระบบนี้ยังไม่มีตารางคะแนน')));
    br.replaceChildren(picker(), h('div', {class: 'card'}, h('h2', {}, 'สายน็อกเอาต์ ' + sportName(cur)),
      ko ? bracketView(ms, tn) : h('p', {class: 'mut'}, 'รายการนี้ไม่มีรอบแพ้คัดออก')));
  } catch (e) {
    sc.replaceChildren(h('p', {class: 'err'}, 'โหลดข้อมูลไม่สำเร็จ: ' + e.message));
  }
}

// ผังสายแพ้คัดออก: คอลัมน์ตามรอบ เลื่อนดูแนวนอนได้
function bracketView(ms, tn) {
  const main = ms.filter(m => m.round_label !== 'ชิงที่ 3'), third = ms.find(m => m.round_label === 'ชิงที่ 3');
  const rounds = [...new Set(main.map(m => m.round_no))];
  const box = m => {
    const side = (id, lb, s) => h('div', {class: id && m.winner === id ? 'w' : ''}, h('span', {}, tn[id] ?? lb ?? '—'), h('span', {}, s ?? ''));
    return h('div', {class: 'bm'}, h('small', {class: 'mut'}, 'นัด ' + m.code), side(m.team_a, m.label_a, m.score_a), side(m.team_b, m.label_b, m.score_b));
  };
  const fin = main.find(m => m.round_label === 'ชิงชนะเลิศ');
  return h('div', {},
    fin && fin.winner ? h('p', {}, h('b', {}, 'ชนะเลิศ: ' + tn[fin.winner])) : null,
    h('div', {class: 'br'}, ...rounds.map(r => h('div', {class: 'col'}, h('h3', {}, main.find(m => m.round_no === r).round_label),
      ...main.filter(m => m.round_no === r).map(box)))),
    third ? h('div', {}, h('h3', {}, 'ชิงที่ 3'), box(third)) : null);
}
