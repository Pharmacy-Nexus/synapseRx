function uniqueStrings(values = []) {
  return Array.from(new Set(values.map(value => String(value || '').trim()).filter(Boolean)));
}

function getAliasIndex(data) {
  const index = [];
  const seen = new Set();
  const generics = new Set([
    ...Object.keys(data.aliases || {}),
    ...Object.keys(data.monographs || {})
  ]);

  for (const generic of generics) {
    const monographAliases = data.monographs?.[generic]?.aliases || [];
    const aliases = uniqueStrings([generic, ...(data.aliases?.[generic] || []), ...monographAliases]);
    for (const alias of aliases) {
      const normalizedAlias = String(alias).toLowerCase();
      const key = `${generic}::${normalizedAlias}`;
      if (!normalizedAlias || seen.has(key)) continue;
      seen.add(key);
      index.push({ generic, alias: normalizedAlias });
    }
  }

  index.sort((a, b) => b.alias.length - a.alias.length);
  return index;
}

function containsLoose(text, phrase) {
  const lower = String(text || '').toLowerCase();
  const escaped = String(phrase).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const ascii = /^[a-z0-9\-\s]+$/i.test(phrase);
  if (ascii) return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(lower);
  return lower.includes(String(phrase).toLowerCase());
}

function extractLocalDrugs(text = '', data) {
  const found = new Set();
  for (const item of getAliasIndex(data)) {
    if (containsLoose(text, item.alias)) found.add(item.generic);
  }
  return Array.from(found);
}

function normalizeDrugList(items = [], data) {
  const found = new Set();
  const aliasIndex = getAliasIndex(data);
  for (const value of items) {
    const text = String(value || '').toLowerCase().trim();
    if (!text) continue;
    if (data.monographs?.[text]) {
      found.add(text);
      continue;
    }
    const exact = aliasIndex.find(item => item.alias === text);
    if (exact) {
      found.add(exact.generic);
      continue;
    }
    const loose = aliasIndex.find(item => text.includes(item.alias) || item.alias.includes(text));
    if (loose) found.add(loose.generic);
  }
  return Array.from(found);
}

function getDrugClass(generic, data) {
  return data.monographs?.[generic]?.class || '';
}

module.exports = { getAliasIndex, containsLoose, extractLocalDrugs, normalizeDrugList, getDrugClass };
