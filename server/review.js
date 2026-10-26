const color = /^(?:#[0-9a-f]{3,8}|rgba?\([\d.,%\s]+\))$/i;
const coordinate = /^(?:\d+(?:\.\d+)?)(?:%|px)$/;
function text(value, max = 2000) { return typeof value === 'string' && value.length <= max; }
function validateReview(body, homework, previous) {
  const scores = body.scores === undefined ? [] : body.scores;
  if (!['accepted', 'rework'].includes(body.verdict) || !text(body.verdictText || '') || !Array.isArray(scores)) throw new Error('Некорректное ревью');
  const seen = new Set();
  const normalizedScores = scores.map(score => {
    const criterion = score && homework && homework.criteria.find(item => item.id === score.criterionId);
    if (!criterion || seen.has(score.criterionId) || typeof score.v !== 'number' || !Number.isFinite(score.v) || score.v < 0 || score.v > 100) throw new Error('Некорректная оценка');
    seen.add(score.criterionId);
    return { criterionId: criterion.id, t: criterion.t, v: score.v };
  });
  let comments = body.comments === undefined ? (previous && previous.comments || []) : body.comments;
  if (!Array.isArray(comments) || comments.length > 100) throw new Error('Некорректные замечания');
  if (body.comments !== undefined) comments = comments.map(c => {
    if (!c || !Number.isSafeInteger(c.n) || c.n < 1 || !text(c.top, 20) || !coordinate.test(c.top) || !text(c.left, 20) || !coordinate.test(c.left) || !text(c.sc, 80) || !color.test(c.sc) || !text(c.svBg, 80) || !color.test(c.svBg) || !text(c.tag) || !text(c.sev) || !text(c.text)) throw new Error('Некорректное замечание');
    return { n: c.n, top: c.top, left: c.left, sc: c.sc, svBg: c.svBg, tag: c.tag, sev: c.sev, text: c.text };
  });
  return { scores: normalizedScores, verdict: body.verdict, verdictText: body.verdictText || '', comments };
}
module.exports = { validateReview };
