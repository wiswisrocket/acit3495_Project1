'use strict';

// Turns the raw documents in the `stats` collection into the shape the page needs.
function shapeStats(docs) {
  const clean = (d) => ({
    count: d.count,
    min: d.min,
    max: d.max,
    avg: d.avg,
    updated_at: d.updated_at instanceof Date ? d.updated_at.toISOString() : d.updated_at || null,
  });
  const overallDoc = docs.find((d) => d._id === 'overall');
  const users = docs
    .filter((d) => d.scope === 'user' && typeof d.username === 'string')
    .map((d) => ({ username: d.username, ...clean(d) }))
    .sort((a, b) => a.username.localeCompare(b.username));
  return { overall: overallDoc ? clean(overallDoc) : null, users };
}

module.exports = { shapeStats };
