import { group, rollups } from 'd3';

const countryCodes = {
  Kenya: 'KE', 'Russian Federation': 'RU', Ethiopia: 'ET', Spain: 'ES', Kazakhstan: 'KZ',
  Turkey: 'TR', Belarus: 'BY', Algeria: 'DZ', Ukraine: 'UA', France: 'FR', Mexico: 'MX',
  Azerbaijan: 'AZ', Brazil: 'BR', 'South Africa': 'ZA', Kyrgyzstan: 'KG', China: 'CN',
  Uzbekistan: 'UZ', 'Saudi Arabia': 'SA', Macedonia: 'MK', Netherlands: 'NL',
  'United Arab Emirates': 'AE', Iran: 'IR', Serbia: 'RS', Germany: 'DE', India: 'IN',
  Lithuania: 'LT', Colombia: 'CO', 'United States of America': 'US', Malaysia: 'MY',
  Indonesia: 'ID', Latvia: 'LV', Somalia: 'SO', Italy: 'IT', Australia: 'AU', Armenia: 'AM',
};
const countryNames = new Intl.DisplayNames(['ru'], { type: 'region' });

export function countryLabel(country) {
  if (!country || country === '-') return 'Неизвестно';
  return countryCodes[country] ? countryNames.of(countryCodes[country]) : country;
}

export function parseTime(value) {
  if (!/^\d+:\d{2}:\d{2}$/.test(value)) return null;
  const [hours, minutes, seconds] = value.split(':').map(Number);
  if (minutes > 59 || seconds > 59) return null;
  return hours * 3600 + minutes * 60 + seconds;
}

export function formatTime(seconds) {
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    .map(value => String(value).padStart(2, '0')).join(':');
}

export function ageLabel(age) {
  const last = age % 10;
  const teen = age % 100 >= 11 && age % 100 <= 14;
  return `${age} ${!teen && last === 1 ? 'год' : !teen && last >= 2 && last <= 4 ? 'года' : 'лет'}`;
}

// Bottom to top: women, then men; youngest to oldest in each group.
// Exact time and bib number break ties without altering the age ordering.
export function compareWithinMinute(a, b) {
  return (a.gender === 'F' ? 0 : 1) - (b.gender === 'F' ? 0 : 1)
    || a.age - b.age || a.seconds - b.seconds
    || a.bibNumber.localeCompare(b.bibNumber, 'ru', { numeric: true });
}

export function summarize(runners) {
  const ages = runners.map(runner => runner.age).filter(Number.isFinite);
  const minAge = Math.min(...ages);
  const maxAge = Math.max(...ages);
  const finishers = runners.flatMap(runner => {
    const seconds = parseTime(runner.finishTime);
    return seconds === null ? [] : [{ ...runner, seconds }];
  }).sort((a, b) => a.seconds - b.seconds || a.bibNumber.localeCompare(b.bibNumber, 'ru', { numeric: true }));
  const minuteBins = [...group(finishers, runner => Math.floor(runner.seconds / 60))]
    .sort(([a], [b]) => a - b)
    .map(([minute, people]) => ({ minute, people: people.sort(compareWithinMinute) }));
  const countries = rollups(runners, people => people.length, runner => runner.country)
    .map(([country, count]) => ({ country, label: countryLabel(country), count, share: count / runners.length * 100 }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'ru'));
  const byAge = group(runners, runner => runner.age);
  const ageRows = Array.from({ length: maxAge - minAge + 1 }, (_, index) => {
    const age = minAge + index;
    const people = byAge.get(age) || [];
    return { age, M: people.filter(runner => runner.gender === 'M').length, F: people.filter(runner => runner.gender === 'F').length };
  });
  return {
    total: runners.length, men: runners.filter(runner => runner.gender === 'M').length,
    women: runners.filter(runner => runner.gender === 'F').length,
    minAge, maxAge, ageRows, countries, finishers, minuteBins,
    leaders: ['M', 'F'].flatMap(gender => finishers.filter(runner => runner.gender === gender).slice(0, 3)
      .map((runner, index) => ({ ...runner, rank: index + 1 }))),
    dnf: runners.filter(runner => runner.finishTime === 'DNF').length,
    dq: runners.filter(runner => runner.finishTime === 'DQ').length,
    elite: runners.filter(runner => runner.class === 'elite').length,
  };
}
