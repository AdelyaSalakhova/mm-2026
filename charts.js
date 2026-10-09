import { axisBottom, interpolateRgb, max, scaleLinear, select } from 'd3';
import { ageLabel, formatTime } from './dashboard-data.js';

export function ageColor(gender, age, stats) {
  const amount = Math.max(0, Math.min(1, (age - stats.minAge) / (stats.maxAge - stats.minAge || 1)));
  return gender === 'F'
    ? interpolateRgb('#ff527a', '#ffd8e2')(amount)
    : interpolateRgb('#008cff', '#c2eeff')(amount);
}

export function drawAgeChart(element, stats, tooltip) {
  const width = Math.min(290, element.clientWidth);
  const height = 316;
  const top = 5;
  const rowHeight = (height - 22) / stats.ageRows.length;
  const center = Math.round((width - 39) * 0.64);
  const extent = Math.min(center - 6, width - center - 39);
  // Both sides use the same zero-based scale; the maximum is the larger gender count.
  const x = scaleLinear().domain([0, max(stats.ageRows, row => Math.max(row.M, row.F))]).range([0, extent]);
  const svg = select(element).selectAll('svg').data([null]).join('svg')
    .attr('viewBox', `0 0 ${width} ${height}`).attr('width', width).attr('height', height)
    .attr('role', 'img').attr('aria-label', 'Возрастная пирамида: мужчины слева, женщины справа. Количество участников каждого возраста.');
  svg.selectAll('*').remove();
  svg.append('title').text('Возраст и пол всех участников. Наведите на полоску, чтобы увидеть число людей.');
  const y = age => top + (age - stats.minAge) * rowHeight;
  const labelRows = stats.ageRows.filter(row => row.age === stats.minAge || row.age % 5 === 0 && row.age - stats.minAge >= 3);
  svg.append('g').selectAll('line').data(labelRows).join('line')
    .attr('x1', 0).attr('x2', width - 39).attr('y1', row => y(row.age) + rowHeight / 2)
    .attr('y2', row => y(row.age) + rowHeight / 2).attr('stroke', '#e4e4e4').attr('stroke-width', 0.7);
  svg.append('line').attr('x1', center).attr('x2', center).attr('y1', 0).attr('y2', height - 17).attr('stroke', '#d3d3d3');
  svg.append('g').selectAll('text').data(labelRows).join('text')
    .attr('x', width - 30).attr('y', row => y(row.age) + rowHeight / 2 + 4)
    .attr('class', 'age-axis-label').text(row => row.age);
  svg.append('text').attr('x', width - 30).attr('y', height - 1).attr('class', 'age-axis-label').text('лет');
  const bars = stats.ageRows.flatMap(row => ['M', 'F'].map(gender => ({ age: row.age, gender, count: row[gender] })));
  svg.append('g').selectAll('rect').data(bars.filter(bar => bar.count)).join('rect')
    .attr('class', 'age-bar').attr('data-gender', bar => bar.gender).attr('data-age', bar => bar.age)
    .attr('data-count', bar => bar.count)
    .attr('x', bar => bar.gender === 'M' ? center - x(bar.count) - 0.75 : center + 0.75)
    .attr('y', bar => y(bar.age)).attr('width', bar => x(bar.count)).attr('height', Math.max(1, rowHeight - 0.8))
    .attr('fill', bar => ageColor(bar.gender, bar.age, stats))
    .on('pointerenter pointermove click', (event, bar) => tooltip.show(event, {
      kind: 'age', gender: bar.gender, title: `${bar.gender === 'M' ? 'Мужчины' : 'Женщины'}, ${ageLabel(bar.age)}`, count: bar.count,
    }))
    .on('pointerleave', tooltip.hide)
    .append('title').text(bar => `${bar.gender === 'M' ? 'Мужчины' : 'Женщины'}, ${ageLabel(bar.age)}: ${bar.count}`);
}

export function drawFinishChart(element, stats, tooltip) {
  const width = element.clientWidth;
  const height = 326;
  const margin = { top: 34, right: 20, bottom: 40, left: 0 };
  const baseline = height - margin.bottom;
  const start = Math.floor(stats.finishers[0].seconds / 60) * 60;
  const end = (Math.floor(stats.finishers.at(-1).seconds / 60) + 1) * 60;
  const x = scaleLinear().domain([start, end]).range([margin.left, width - margin.right]);
  const minuteWidth = x(start + 60) - x(start);
  const unit = (baseline - margin.top) / max(stats.minuteBins, bin => bin.people.length);
  const marks = stats.minuteBins.flatMap(bin => bin.people.map((runner, index) => ({ runner, minute: bin.minute, index })));
  const svg = select(element).selectAll('svg').data([null]).join('svg')
    .attr('viewBox', `0 0 ${width} ${height}`).attr('width', width).attr('height', height)
    .attr('role', 'img').attr('aria-label', `Распределение ${stats.finishers.length} финишей по минутам. Одна цветная чёрточка — один спортсмен; женщины снизу, мужчины сверху; возраст растёт снизу вверх в каждой группе.`);
  svg.selectAll('*').remove();
  svg.append('title').text('Распределение финишей. Каждая отметка показывает отдельного бегуна.');
  svg.append('g').attr('class', 'runner-marks').selectAll('rect').data(marks).join('rect')
    .attr('class', 'runner-mark').attr('data-bib', mark => mark.runner.bibNumber)
    .attr('data-class', mark => mark.runner.class).attr('data-minute', mark => mark.minute)
    .attr('data-gender', mark => mark.runner.gender).attr('data-age', mark => mark.runner.age)
    .attr('x', mark => x(mark.minute * 60) + 0.25)
    .attr('y', mark => baseline - (mark.index + 1) * unit)
    .attr('width', Math.max(0.6, minuteWidth - 0.6)).attr('height', Math.max(0.5, unit - 0.15))
    .attr('fill', mark => ageColor(mark.runner.gender, mark.runner.age, stats));

  // Delegate events to the SVG rather than attaching thousands of listeners.
  let active = null;
  const byMinute = new Map(stats.minuteBins.map(bin => [bin.minute, bin.people]));
  svg.on('pointermove click', event => {
    const target = event.target;
    if (!target.classList.contains('runner-mark')) {
      if (active) select(active).classed('is-hovered', false);
      active = null;
      tooltip.hide();
      return;
    }
    if (active !== target) {
      if (active) select(active).classed('is-hovered', false);
      active = target;
      select(active).classed('is-hovered', true);
    }
    const datum = select(target).datum();
    const runner = byMinute.get(datum.minute)[datum.index];
    tooltip.show(event, { kind: 'runner', runner });
  }).on('pointerleave', () => {
    if (active) select(active).classed('is-hovered', false);
    active = null;
    tooltip.hide();
  });

  const tickValues = [stats.finishers[0].seconds];
  const interval = width < 650 ? 3600 : 1800;
  for (let tick = Math.ceil(start / interval) * interval; tick < end; tick += interval) {
    if (tick - tickValues.at(-1) > interval * 0.45 && end - tick > interval * 0.3) tickValues.push(tick);
  }
  tickValues.push(stats.finishers.at(-1).seconds);
  const axis = svg.append('g').attr('class', 'finish-axis').attr('transform', `translate(0,${baseline + 4})`)
    .call(axisBottom(x).tickValues(tickValues).tickFormat(formatTime).tickSize(4).tickPadding(12));
  axis.select('.domain').attr('stroke', '#ead4e1').attr('stroke-width', 3);
  axis.selectAll('.tick text').attr('text-anchor', (value, index) => index === 0 ? 'start' : index === tickValues.length - 1 ? 'end' : 'middle');

  const leaders = ['M', 'F'].map(gender => stats.leaders.find(runner => runner.gender === gender)).filter(Boolean);
  const annotations = svg.append('g').attr('class', 'leader-annotations');
  leaders.forEach((runner, index) => {
    const minute = Math.floor(runner.seconds / 60);
    const position = x(minute * 60) + minuteWidth / 2;
    const labelX = Math.max(10, position);
    const labelY = baseline - (index === 0 ? 86 : 175);
    annotations.append('line').attr('x1', position).attr('x2', position)
      .attr('y1', labelY + 45).attr('y2', baseline - byMinute.get(minute).length * unit - 4)
      .attr('stroke', runner.gender === 'M' ? '#8acbff' : '#ffb5c7');
    const text = annotations.append('text').attr('x', labelX).attr('y', labelY).attr('class', 'leader-label');
    const words = runner.name.split(' ');
    text.append('tspan').attr('x', labelX).text(words.slice(0, 1).join(' '));
    text.append('tspan').attr('x', labelX).attr('dy', 17).text(words.slice(1).join(' '));
    text.append('tspan').attr('x', labelX).attr('dy', 17).text(formatTime(runner.seconds));
  });
}
