import { createApp, computed, nextTick, onMounted, onUnmounted, ref, shallowRef } from 'vue/dist/vue.esm-bundler.js';
import { formatLocale } from 'd3';
import { ageLabel, countryLabel, formatTime, parseTime, summarize } from './dashboard-data.js';
import { drawAgeChart, drawFinishChart } from './charts.js';

const dataUrl = new URL('./results.json', import.meta.url).href;
const formatCount = formatLocale({
  decimal: ',', thousands: '\u202f', grouping: [3], currency: ['', ' ₽'],
}).format(',d');
const PAGE_SIZE = 100;

createApp({
  setup() {
    const runners = shallowRef([]);
    const loading = ref(true);
    const error = ref('');
    const page = ref(1);
    const stats = shallowRef(null);
    const ageChart = ref(null);
    const finishChart = ref(null);
    const tooltip = shallowRef(null);
    let resizeObserver;
    let resizeFrame;
    const formatPercent = value => value > 0 && value < 1 ? '<1%' : `${Math.round(value)}%`;
    const formatShare = count => formatPercent(count / runners.value.length * 100);
    const otherCountries = computed(() => stats.value?.countries.slice(5).map(country => country.label).join(', '));
    const otherCountrySummary = computed(() => {
      const countries = stats.value?.countries.slice(5) || [];
      return countries.slice(0, 5).map(country => country.label).join(', ')
        + (countries.length > 5 ? ` и ещё ${countries.length - 5} стран` : '');
    });
    const otherCountryCount = computed(() => stats.value?.countries.slice(5).reduce((total, country) => total + country.count, 0) || 0);
    const tooltipStyle = computed(() => tooltip.value ? { left: `${tooltip.value.x}px`, top: `${tooltip.value.y}px` } : {});
    function hideTooltip() { tooltip.value = null; }
    function showTooltip(event, content) {
      const width = 232;
      const height = content.kind === 'runner' ? 204 : 89;
      let x = event.clientX + 16;
      let y = event.clientY - height - 12;
      if (x + width > window.innerWidth - 12) x = event.clientX - width - 16;
      if (y < 12) y = event.clientY + 18;
      tooltip.value = { ...content, x: Math.max(12, Math.min(x, window.innerWidth - width - 12)), y: Math.max(12, Math.min(y, window.innerHeight - height - 12)) };
    }
    function showLeader(event, runner) {
      const bounds = event.currentTarget.getBoundingClientRect();
      showTooltip({ clientX: bounds.left + bounds.width / 2, clientY: bounds.bottom }, { kind: 'runner', runner });
    }
    function renderCharts() {
      if (!stats.value || !ageChart.value || !finishChart.value) return;
      hideTooltip();
      const controls = { show: showTooltip, hide: hideTooltip };
      drawAgeChart(ageChart.value, stats.value, controls);
      drawFinishChart(finishChart.value, stats.value, controls);
    }
    const totalPages = computed(() => Math.max(1, Math.ceil(runners.value.length / PAGE_SIZE)));
    const pageRunners = computed(() => runners.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE));
    const rangeStart = computed(() => runners.value.length ? (page.value - 1) * PAGE_SIZE + 1 : 0);
    const rangeEnd = computed(() => Math.min(page.value * PAGE_SIZE, runners.value.length));
    const eliteCount = computed(() => runners.value.filter(runner => runner.class === 'elite').length);
    const amateurCount = computed(() => runners.value.filter(runner => runner.class === 'amateur').length);
    const pageItems = computed(() => {
      const visible = new Set([1, totalPages.value]);
      for (let i = Math.max(1, page.value - 2); i <= Math.min(totalPages.value, page.value + 2); i++) visible.add(i);
      const items = [];
      for (const current of [...visible].sort((a, b) => a - b)) {
        const previous = items[items.length - 1];
        if (previous && current - previous === 2) items.push(previous + 1);
        else if (previous && current - previous > 2) items.push('…');
        items.push(current);
      }
      return items;
    });

    function goToPage(nextPage) {
      page.value = Math.max(1, Math.min(totalPages.value, nextPage));
      document.querySelector('.results-panel')?.scrollIntoView({ block: 'start' });
    }

    onMounted(async () => {
      try {
        const response = await fetch(dataUrl);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (!Array.isArray(data)) throw new Error('Ожидался массив участников');
        runners.value = data;
        stats.value = summarize(data);
      } catch (cause) {
        console.error('Не удалось загрузить результаты:', cause);
        error.value = 'Не удалось загрузить результаты. Обновите страницу или проверьте локальный сервер.';
      } finally {
        loading.value = false;
      }
      await nextTick();
      if (!error.value) {
        renderCharts();
        resizeObserver = new ResizeObserver(() => {
          cancelAnimationFrame(resizeFrame);
          resizeFrame = requestAnimationFrame(renderCharts);
        });
        resizeObserver.observe(finishChart.value);
      }
      window.addEventListener('scroll', hideTooltip, { passive: true });
      window.addEventListener('keydown', dismissTooltip);
    });
    function dismissTooltip(event) { if (event.key === 'Escape') hideTooltip(); }
    onUnmounted(() => {
      resizeObserver?.disconnect();
      cancelAnimationFrame(resizeFrame);
      window.removeEventListener('scroll', hideTooltip);
      window.removeEventListener('keydown', dismissTooltip);
    });

    return { runners, loading, error, page, totalPages, pageRunners, rangeStart, rangeEnd, eliteCount, amateurCount, pageItems, formatCount, goToPage,
      stats, ageChart, finishChart, tooltip, tooltipStyle, formatShare, formatPercent, otherCountries, otherCountrySummary, otherCountryCount,
      ageLabel, countryLabel, formatTime, parseTime, showLeader, hideTooltip };
  },
}).mount('#app');
