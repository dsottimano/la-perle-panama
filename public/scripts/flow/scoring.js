// Psychographic scoring over the owner's 4 axes (see docs/quiz-owner-interview.md):
//   buzz     0 = calm + manicured   ↔ 1 = lively + walkable
//   modern   0 = character/cachet    ↔ 1 = modern/new
//   dwelling 0 = house               ↔ 1 = apartment
//   ocean    0 = ocean a weekly trip ↔ 1 = ocean nearby
//
// Each contribution is a value in [-1, +1]. Questions anchor (weight QW),
// swipes refine (weight SW; a "pass" contributes the negated vector). The final
// per-axis score is the weighted mean shifted into [0, 1] (0.5 = no signal).

const QW = 2; // explicit-question weight
const SW = 1; // swipe weight

function contribute(sum, cnt, vec, sign, w) {
  if (!vec) return;
  for (const k of Object.keys(vec)) {
    if (sum[k] === undefined) continue;
    sum[k] += sign * vec[k] * w;
    cnt[k] += w;
  }
}

// state = { answers: { [nodeId]: { optionIds?, value? } }, swipes: [{ liked, axes }] }
export function computeAxes(flow, state) {
  const ids = (flow.axes || []).map((a) => a.id);
  const sum = {}, cnt = {};
  ids.forEach((id) => { sum[id] = 0; cnt[id] = 0; });

  for (const node of flow.nodes || []) {
    const ans = state.answers ? state.answers[node.id] : null;
    if (!ans) continue;
    contribute(sum, cnt, node.axes, 1, QW);
    const chosen = ans.optionIds || [];
    for (const opt of node.options || []) {
      if (chosen.includes(opt.id)) contribute(sum, cnt, opt.axes, 1, QW);
    }
  }

  for (const sw of state.swipes || []) {
    contribute(sum, cnt, sw.axes, sw.liked ? 1 : -1, SW);
  }

  const axes = {};
  for (const id of ids) {
    const mean = cnt[id] > 0 ? sum[id] / cnt[id] : 0; // [-1, 1]
    axes[id] = Math.max(0, Math.min(1, (mean + 1) / 2)); // [0, 1]
  }
  return axes;
}

// Nearest named profile (Euclidean distance over the axes); a missing target
// axis on a profile is treated as neutral (0.5).
export function nearestProfile(flow, axes) {
  const profiles = flow.profiles || [];
  let best = profiles[0] || { id: null };
  let bestDist = Infinity;
  for (const pr of profiles) {
    let d = 0;
    for (const a of flow.axes || []) {
      const target = pr.axes && pr.axes[a.id] != null ? pr.axes[a.id] : 0.5;
      d += (axes[a.id] - target) ** 2;
    }
    if (d < bestDist) { bestDist = d; best = pr; }
  }
  return { id: best.id, distance: bestDist };
}
