const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const baseUrl = 'https://results.runc.run';
const entities = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function text(html) {
  return html.replace(/<[^>]*>/g, '').replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (entity, key) => {
    if (key.startsWith('#x')) return String.fromCodePoint(parseInt(key.slice(2), 16));
    if (key.startsWith('#')) return String.fromCodePoint(Number(key.slice(1)));
    assert.ok(Object.hasOwn(entities, key), `Unknown HTML entity: ${entity}`);
    return entities[key];
  }).replace(/\s+/g, ' ').trim();
}

function field(html, className) {
  const pattern = new RegExp('<(div|h5|span)\\b[^>]*class="[^"]*\\b' + className + '\\b[^"]*"[^>]*>([\\s\\S]*?)<\\/\\1>', 'g');
  const values = [...html.matchAll(pattern)].map(match => text(match[2]));
  assert.equal(values.length, 1, `Expected one ${className}, found ${values.length}`);
  return values[0];
}

function rows(html, className) {
  return [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)]
    .filter(match => new RegExp('class="' + className + '"').test(match[1]))
    .map(match => {
      const href = match[1].match(/\bhref="([^"]*)"/);
      assert.ok(href, 'Missing participant URL');
      return { html: match[2], resultUrl: new URL(text(href[1]), baseUrl).href };
    });
}

function numberOrText(value) {
  return /^\d+$/.test(value) ? Number(value) : value;
}

const results = [];
for (const [filename, participantClass] of [['elite.html', 'elite'], ['amateurs.html', 'amateur']]) {
  const html = fs.readFileSync(path.join(__dirname, filename), 'utf8');
  const desktop = rows(html, 'results-table__values');
  const mobile = rows(html, 'results-races-mobile-list__item');
  const expectedCount = Number(field(html, 'results-top__heading-count').replace(/[()]/g, ''));
  assert.equal(desktop.length, expectedCount, `${filename}: source count mismatch`);
  assert.equal(mobile.length, desktop.length, `${filename}: mobile count mismatch`);
  const urls = new Set();

  for (let i = 0; i < desktop.length; i++) {
    const row = desktop[i];
    const source = row.html;
    const countryGenderAge = field(source, 'results-table__values-item-country');
    const demographic = countryGenderAge.match(/^(.*),\s*([MF])(\d+)$/);
    assert.ok(demographic, `Unexpected country/gender/age: ${countryGenderAge}`);
    const result = {
      place: numberOrText(field(source, 'results-table__values-item-place')),
      name: field(source, 'results-table__values-item-name'),
      country: demographic[1],
      gender: demographic[2],
      age: Number(demographic[3]),
      bibNumber: field(source, 'results-table__col-number'),
      pace: field(source, 'results-table__col-pace'),
      finishTime: field(source, 'results-table__col-result'),
      resultUrl: row.resultUrl,
      class: participantClass,
    };

    // Both layouts repeat the same participants. Check every field before deduplicating.
    const duplicate = mobile[i];
    assert.equal(duplicate.resultUrl, result.resultUrl);
    assert.equal(field(duplicate.html, 'results-races-mobile-list__item-name'), result.name);
    assert.equal(field(duplicate.html, 'results-races-mobile-list__item-date'), countryGenderAge);
    assert.equal(field(duplicate.html, 'results-races-mobile-list__item-number'), `Bib Number: ${result.bibNumber}`);
    const properties = [...duplicate.html.matchAll(/<div class="results-races-mobile-list__props-item-value">([\s\S]*?)<\/div>/g)].map(match => text(match[1]));
    // Missing pace is rendered as "-" on desktop and "None" on mobile.
    if (properties[1] === 'None' && result.pace === '-') properties[1] = '-';
    assert.deepEqual(properties, [String(result.place), result.pace, result.finishTime]);
    assert.ok(!urls.has(result.resultUrl), `Duplicate participant: ${result.resultUrl}`);
    urls.add(result.resultUrl);
    results.push(result);
  }
  console.log(`${filename}: ${desktop.length} participants, all mobile fields verified`);
}

const outputPath = path.join(__dirname, 'results.json');
fs.writeFileSync(outputPath, JSON.stringify(results, null, 2) + '\n', 'utf8');
assert.deepEqual(JSON.parse(fs.readFileSync(outputPath, 'utf8')), results);
console.log(`Saved ${results.length} participants to ${outputPath}`);
console.log(JSON.stringify(results[0], null, 2));
