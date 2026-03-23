import {
  processRawData,
  filterEvents,
  calculateVisibleMetrics,
  QUERY_EVENTS,
  NOISE_EVENTS,
  severityLabel,
  severityHelp,
  formatNumber,
  formatMs,
  formatPercent,
  escapeHtml
} from './viewer-core.js';

export function initializeViewer({
  document = window.document,
  windowObject = window,
  FileReaderCtor = window.FileReader
} = {}) {
  const elements = getElements(document);
  const state = {
    allEvents: [],
    filteredEvents: [],
    selectedId: null,
    analysis: null,
    scatterPlotPoints: [],
    scatterEventsBound: false
  };

  elements.tableLimitBadge.textContent = `Render limit: ${formatNumber(MAX_RENDERED_EVENTS)}`;

  bindUiEvents(elements, state, { document, windowObject, FileReaderCtor });
  bindScatterEvents(elements, state, windowObject);

  return {
    loadFile: file => loadFile(file, elements, state, FileReaderCtor, document, windowObject),
    processData: raw => processData(raw, elements, state, document, windowObject),
    render: () => render(elements, state, windowObject),
    getState: () => state
  };
}

export const MAX_RENDERED_EVENTS = 750;

function getElements(document) {
  return {
    fileInput: document.getElementById('fileInput'),
    dropZone: document.getElementById('dropZone'),
    searchInput: document.getElementById('searchInput'),
    hideNoiseToggle: document.getElementById('hideNoiseToggle'),
    problemsOnlyToggle: document.getElementById('problemsOnlyToggle'),
    resultsBody: document.getElementById('results'),
    findingsEl: document.getElementById('findings'),
    eventBreakdownEl: document.getElementById('eventBreakdown'),
    patternBreakdownEl: document.getElementById('patternBreakdown'),
    detailsPanel: document.getElementById('detailsPanel'),
    durationChart: document.getElementById('durationChart'),
    scatterChart: document.getElementById('scatterChart'),
    scatterTooltip: document.getElementById('scatterTooltip'),
    metricTotalEvents: document.getElementById('metricTotalEvents'),
    metricQueries: document.getElementById('metricQueries'),
    metricDuration: document.getElementById('metricDuration'),
    metricCpu: document.getElementById('metricCpu'),
    metricReads: document.getElementById('metricReads'),
    metricRisk: document.getElementById('metricRisk'),
    metricEventHint: document.getElementById('metricEventHint'),
    metricQueriesHint: document.getElementById('metricQueriesHint'),
    metricDurationHint: document.getElementById('metricDurationHint'),
    metricCpuHint: document.getElementById('metricCpuHint'),
    metricReadsHint: document.getElementById('metricReadsHint'),
    metricRiskHint: document.getElementById('metricRiskHint'),
    tableCountLabel: document.getElementById('tableCountLabel'),
    eventCountLabel: document.getElementById('eventCountLabel'),
    tableLimitBadge: document.getElementById('tableLimitBadge'),
    showIntroBtn: document.getElementById('showIntroBtn'),
    loadAnotherBtn: document.getElementById('loadAnotherBtn'),
    compactSummary: document.getElementById('compactSummary')
  };
}

function bindUiEvents(elements, state, dependencies) {
  const { windowObject } = dependencies;

  elements.dropZone.addEventListener('click', () => elements.fileInput.click());
  elements.fileInput.addEventListener('change', event => loadFile(event.target.files[0], elements, state, dependencies.FileReaderCtor, dependencies.document, dependencies.windowObject));
  elements.searchInput.addEventListener('input', () => render(elements, state, windowObject));
  elements.hideNoiseToggle.addEventListener('change', () => render(elements, state, windowObject));
  elements.problemsOnlyToggle.addEventListener('change', () => render(elements, state, windowObject));
  windowObject.addEventListener('resize', () => {
    if (state.analysis) {
      drawCharts(elements, state, windowObject);
    }
  });
  elements.showIntroBtn.addEventListener('click', () => toggleIntroVisibility(dependencies.document, elements, windowObject));
  elements.loadAnotherBtn.addEventListener('click', () => elements.fileInput.click());

  ['dragenter', 'dragover'].forEach(eventName => {
    elements.dropZone.addEventListener(eventName, event => {
      event.preventDefault();
      elements.dropZone.classList.add('dragging');
    });
  });

  ['dragleave', 'drop'].forEach(eventName => {
    elements.dropZone.addEventListener(eventName, event => {
      event.preventDefault();
      elements.dropZone.classList.remove('dragging');
    });
  });

  elements.dropZone.addEventListener('drop', event => {
    loadFile(event.dataTransfer.files[0], elements, state, dependencies.FileReaderCtor, dependencies.document, dependencies.windowObject);
  });

  // Initialize expand buttons
  initializeExpandButtons(dependencies.document, dependencies.windowObject, elements, state);
}

function loadFile(file, elements, state, FileReaderCtor, document, windowObject) {
  if (!file) {
    return;
  }

  const reader = new FileReaderCtor();
  reader.onload = event => {
    try {
      const parsed = JSON.parse(event.target.result);
      processData(parsed, elements, state, document, windowObject);
    } catch (error) {
      elements.findingsEl.innerHTML = `<div class="finding"><strong>Could not parse file</strong>${escapeHtml(error.message)}</div>`;
    }
  };
  reader.readAsText(file);
}

function processData(raw, elements, state, document, windowObject) {
  const processed = processRawData(raw);
  state.allEvents = processed.allEvents;
  state.analysis = processed.analysis;
  state.selectedId = processed.selectedId;
  elements.showIntroBtn.textContent = 'Show upload';
  document.body.classList.add('has-data');
  document.body.classList.remove('show-hero');
  render(elements, state, windowObject);
}

function render(elements, state, windowObject) {
  if (!state.analysis) {
    return;
  }

  state.filteredEvents = filterEvents(state.analysis.events, {
    searchTerm: elements.searchInput.value,
    hideNoise: elements.hideNoiseToggle.checked,
    problemsOnly: elements.problemsOnlyToggle.checked
  });

  updateMetricCards(elements, state);
  renderFindings(elements, state.analysis);
  renderEventBreakdown(elements, state.analysis);
  renderPatternBreakdown(elements, state.analysis);
  renderTable(elements, state, windowObject);
  renderDetails(elements, state.analysis, state.selectedId);
  drawCharts(elements, state, windowObject);

  // Add expand buttons to panels after rendering
  addExpandButtonsToPanel('.dashboard', windowObject.document, windowObject, elements, state);
}

function updateMetricCards(elements, state) {
  const metrics = state.analysis.metrics;
  const visibleMetrics = calculateVisibleMetrics(state.analysis, state.filteredEvents);

  elements.metricTotalEvents.textContent = formatNumber(visibleMetrics.totalEvents);
  elements.metricQueries.textContent = formatNumber(visibleMetrics.totalQueries);
  elements.metricDuration.textContent = formatMs(visibleMetrics.visibleDuration);
  elements.metricCpu.textContent = formatMs(visibleMetrics.visibleCpu);
  elements.metricReads.textContent = formatNumber(visibleMetrics.visibleReads);
  elements.metricRisk.textContent = formatNumber(visibleMetrics.visibleRisk);

  elements.metricEventHint.textContent = `${formatNumber(state.filteredEvents.length)} visible, cap ${formatNumber(MAX_RENDERED_EVENTS)} rows`;
  elements.metricQueriesHint.textContent = `${formatPercent(1 - metrics.noiseShare)} signal in capture`;
  elements.metricDurationHint.textContent = `P95 duration ${formatMs(visibleMetrics.p95Duration)}`;
  elements.metricCpuHint.textContent = `P95 CPU ${formatMs(visibleMetrics.p95Cpu)}`;
  elements.metricReadsHint.textContent = `P95 reads ${formatNumber(visibleMetrics.p95Reads)}`;
  elements.metricRiskHint.textContent = `${visibleMetrics.flaggedRows} rows flagged as likely problems`;
  elements.eventCountLabel.textContent = `${formatNumber(metrics.totalEvents)} events loaded`;
  elements.tableCountLabel.textContent = `Showing ${formatNumber(Math.min(state.filteredEvents.length, MAX_RENDERED_EVENTS))} of ${formatNumber(state.filteredEvents.length)} rows`;
  elements.compactSummary.textContent = `${formatNumber(metrics.totalEvents)} events loaded · ${formatNumber(metrics.totalQueries)} query events · ${formatPercent(metrics.noiseShare)} noise`;
}

function toggleIntroVisibility(document, elements, windowObject) {
  if (!document.body.classList.contains('has-data')) {
    return;
  }

  const willShow = !document.body.classList.contains('show-hero');
  document.body.classList.toggle('show-hero', willShow);
  elements.showIntroBtn.textContent = willShow ? 'Hide upload' : 'Show upload';
  if (willShow) {
    windowObject.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

function renderFindings(elements, analysis) {
  const metrics = analysis.metrics;
  const repeated = analysis.groups.find(group => group.count >= 5);
  const highestReads = analysis.queryEvents.slice().sort((left, right) => right.reads - left.reads)[0];
  const highestWrites = analysis.queryEvents.slice().sort((left, right) => right.writes - left.writes)[0];
  const findings = [];

  if (!analysis.events.length) {
    elements.findingsEl.innerHTML = '<div class="empty">No profiler rows were loaded.</div>';
    return;
  }

  if (metrics.noiseShare >= 0.3) {
    findings.push({
      title: 'Profiler noise is a large part of this capture',
      text: `${formatPercent(metrics.noiseShare)} of events are login, logout, or connection reset activity. Keep noise hidden by default so real query work stays visible.`
    });
  }

  if (metrics.slowest) {
    findings.push({
      title: 'Slowest query event',
      text: `${formatMs(metrics.slowest.duration)} on ${metrics.slowest.operation} ${metrics.slowest.table || '(unknown table)'} with ${formatNumber(metrics.slowest.reads)} reads and score ${formatNumber(metrics.slowest.score)}.`
    });
  }

  if (highestReads && highestReads.reads >= Math.max(500, metrics.p95Reads)) {
    findings.push({
      title: 'Logical read hotspot',
      text: `${highestReads.operation} ${highestReads.table || '(unknown table)'} hit ${formatNumber(highestReads.reads)} reads. High reads with low row counts often point to inefficient access paths or missing indexes.`
    });
  }

  if (highestWrites && highestWrites.writes > 0) {
    findings.push({
      title: 'Write-heavy event detected',
      text: `${highestWrites.operation} ${highestWrites.table || '(unknown table)'} produced ${formatNumber(highestWrites.writes)} writes. If duration is also high, check locking and transaction scope.`
    });
  }

  if (repeated) {
    findings.push({
      title: 'Repeated statement pattern',
      text: `${repeated.count} executions of a similar ${repeated.operation} pattern consumed ${formatMs(repeated.totalDuration)} total. This is often where batching or caching pays off.`
    });
  }

  if (!findings.length) {
    findings.push({
      title: 'No obvious hotspots from current heuristics',
      text: 'The capture does not currently exceed the built-in thresholds for duration, reads, writes, or repetition. Search or disable noise filtering to inspect more events manually.'
    });
  }

  elements.findingsEl.innerHTML = findings.slice(0, 6).map(finding => `<div class="finding"><strong>${escapeHtml(finding.title)}</strong>${escapeHtml(finding.text)}</div>`).join('');
}

function renderEventBreakdown(elements, analysis) {
  const topEvents = analysis.eventTypeCounts.slice(0, 6);
  const maxCount = Math.max(...topEvents.map(([, count]) => count), 1);

  elements.eventBreakdownEl.innerHTML = topEvents.map(([name, count]) => {
    const ratio = (count / maxCount) * 100;
    const typeClass = NOISE_EVENTS.has(name) ? 'warning' : QUERY_EVENTS.has(name) ? 'danger' : '';
    return `
      <div class="bar-row">
        <div>${escapeHtml(name)}</div>
        <div class="bar-track"><div class="bar-fill ${typeClass}" style="width:${ratio}%"></div></div>
        <div>${formatNumber(count)}</div>
      </div>
    `;
  }).join('');
}

function renderPatternBreakdown(elements, analysis) {
  const patterns = analysis.groups.filter(group => group.count > 1).slice(0, 6);

  if (!patterns.length) {
    elements.patternBreakdownEl.innerHTML = '<div class="empty">No repeated query signatures detected yet.</div>';
    return;
  }

  const maxCost = Math.max(...patterns.map(group => group.totalDuration + group.totalReads), 1);
  elements.patternBreakdownEl.innerHTML = patterns.map(group => {
    const ratio = ((group.totalDuration + group.totalReads) / maxCost) * 100;
    const label = `${group.operation} ${group.table || '(unknown)'}`;
    return `
      <div class="bar-row">
        <div>
          <strong>${escapeHtml(label)}</strong><br>
          <span class="muted">${group.count} executions · ${formatMs(group.totalDuration)} total</span>
        </div>
        <div class="bar-track"><div class="bar-fill danger" style="width:${ratio}%"></div></div>
        <div>${formatNumber(group.count)}x</div>
      </div>
    `;
  }).join('');
}

function renderTable(elements, state, windowObject) {
  const rows = state.filteredEvents.slice(0, MAX_RENDERED_EVENTS);

  if (!rows.length) {
    elements.resultsBody.innerHTML = '<tr><td colspan="12"><div class="empty">No rows match the current filters.</div></td></tr>';
    return;
  }

  if (!rows.some(row => row.id === state.selectedId)) {
    state.selectedId = rows[0].id;
  }

  elements.resultsBody.innerHTML = rows.map(event => `
    <tr data-id="${event.id}" class="row-sev-${event.severity} ${event.id === state.selectedId ? 'selected' : ''}">
      <td class="severity-cell"><div class="severity-bar sev-${event.severity}"></div></td>
      <td><span class="risk-pill risk-${event.severity}">${formatNumber(event.score)}</span><br><span class="muted">${severityLabel(event.severity)}</span></td>
      <td>${escapeHtml(event.eventName)}</td>
      <td>${escapeHtml(event.app)}</td>
      <td>${escapeHtml(event.operation)}</td>
      <td>${escapeHtml(event.table || '-')}</td>
      <td><div class="query-snippet">${escapeHtml(event.sql || event.objectName || '(no SQL text)')}</div></td>
      <td>${formatMs(event.duration)}</td>
      <td>${formatMs(event.cpu)}</td>
      <td>${formatNumber(event.reads)}</td>
      <td>${formatNumber(event.writes)}</td>
      <td>${formatNumber(event.rows)}</td>
    </tr>
  `).join('');

  elements.resultsBody.querySelectorAll('tr[data-id]').forEach(row => {
    row.addEventListener('click', () => {
      state.selectedId = Number(row.dataset.id);
      renderTable(elements, state, windowObject);
      renderDetails(elements, state.analysis, state.selectedId);
      if (windowObject.innerWidth <= 1180) {
        elements.detailsPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });
}

function renderDetails(elements, analysis, selectedId) {
  const event = analysis.events.find(item => item.id === selectedId);

  if (!event) {
    elements.detailsPanel.innerHTML = '<div class="empty">No event selected.</div>';
    return;
  }

  elements.detailsPanel.innerHTML = `
    <div class="meta-grid">
      ${metaItem('Risk score', formatNumber(event.score))}
      ${metaItem('Risk level', severityLabel(event.severity))}
      ${metaItem('Duration', formatMs(event.duration))}
      ${metaItem('CPU', formatMs(event.cpu))}
      ${metaItem('Reads', formatNumber(event.reads))}
      ${metaItem('Writes', formatNumber(event.writes))}
      ${metaItem('Rows', formatNumber(event.rows))}
      ${metaItem('Event', escapeHtml(event.eventName))}
      ${metaItem('App', escapeHtml(event.app))}
      ${metaItem('Table', escapeHtml(event.table || '-'))}
      ${metaItem('Session', escapeHtml(event.sessionId || '-'))}
    </div>
    <div style="height:16px"></div>
    <div class="finding"><strong>What this means</strong>${escapeHtml(severityHelp(event.severity))}</div>
    <div style="height:12px"></div>
    <div class="badges">
      ${event.tags.length ? event.tags.map(tag => `<span class="badge problem">${escapeHtml(tag)}</span>`).join('') : '<span class="badge">No flags</span>'}
      ${event.queryHash && event.queryHash !== '0' ? `<span class="badge warning">Query hash ${escapeHtml(event.queryHash)}</span>` : ''}
      ${event.timestamp ? `<span class="badge">${escapeHtml(event.timestamp)}</span>` : ''}
    </div>
    <div style="height:16px"></div>
    <pre>${escapeHtml(event.sql || event.objectName || '(no SQL text available)')}</pre>
  `;
}

function drawCharts(elements, state, windowObject) {
  drawDurationHistogram(elements.durationChart, state.filteredEvents.filter(event => event.isQueryEvent), windowObject);
  drawRiskScatter(elements.scatterChart, state.filteredEvents.filter(event => event.isQueryEvent).slice(0, 300), state, windowObject);
}

function drawDurationHistogram(canvas, queryEvents, windowObject) {
  const prepared = prepareCanvas(canvas, 640, 240, windowObject);
  if (!prepared) {
    return;
  }

  const { context, width, height } = prepared;
  const buckets = [0, 10, 50, 100, 250, 500, 1000, Infinity];
  const labels = ['<10', '10-50', '50-100', '100-250', '250-500', '500-1000', '1000+'];
  const counts = new Array(labels.length).fill(0);

  queryEvents.forEach(event => {
    const index = buckets.findIndex((limit, bucketIndex) => event.duration < buckets[bucketIndex + 1]);
    counts[index] += 1;
  });

  context.clearRect(0, 0, width, height);

  if (!queryEvents.length) {
    drawEmptyChartState(context, width, height, 'No query events to chart');
    return;
  }

  drawChartSurface(context, width, height);
  const padding = { top: 20, right: 16, bottom: 38, left: 24 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const maxCount = Math.max(...counts, 1);
  const barWidth = chartWidth / counts.length;

  drawChartGrid(context, { left: padding.left, top: padding.top, width: chartWidth, height: chartHeight, lines: 4 });

  counts.forEach((count, index) => {
    const barHeight = (count / maxCount) * (chartHeight - 12);
    const x = padding.left + index * barWidth + 6;
    const y = padding.top + chartHeight - barHeight;

    context.fillStyle = count && index === counts.length - 1 ? '#c4512d' : count && index === counts.length - 2 ? '#d26a3b' : '#0d7a6f';
    context.fillRect(x, y, barWidth - 12, barHeight);

    context.fillStyle = '#4f5f6b';
    context.font = '12px Avenir Next, sans-serif';
    context.textAlign = 'center';
    context.fillText(labels[index], x + (barWidth - 12) / 2, height - 12);
    if (count) {
      context.fillText(String(count), x + (barWidth - 12) / 2, y - 6);
    }
  });
}

function drawRiskScatter(canvas, queryEvents, state, windowObject) {
  const prepared = prepareCanvas(canvas, 640, 240, windowObject);
  if (!prepared) {
    return;
  }

  const { context, width, height } = prepared;
  const padding = { top: 16, right: 18, bottom: 34, left: 42 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const maxReads = Math.max(...queryEvents.map(event => event.reads), 1);
  const maxDuration = Math.max(...queryEvents.map(event => event.duration), 1);

  context.clearRect(0, 0, width, height);

  if (!queryEvents.length) {
    drawEmptyChartState(context, width, height, 'No visible query events for the risk map');
    return;
  }

  drawChartSurface(context, width, height);
  drawChartGrid(context, { left: padding.left, top: padding.top, width: chartWidth, height: chartHeight, lines: 4 });

  context.strokeStyle = 'rgba(31, 42, 46, 0.28)';
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(padding.left, padding.top);
  context.lineTo(padding.left, padding.top + chartHeight);
  context.lineTo(padding.left + chartWidth, padding.top + chartHeight);
  context.stroke();
  state.scatterPlotPoints = [];

  queryEvents.forEach(event => {
    const x = padding.left + (Math.log10(event.reads + 1) / Math.log10(maxReads + 1)) * chartWidth;
    const y = padding.top + chartHeight - ((event.duration || 0) / maxDuration) * chartHeight;
    const radius = Math.max(3, Math.min(10, 3 + Math.log10(event.cpu + 1) * 2));

    context.beginPath();
    context.fillStyle = event.score >= 60 ? 'rgba(196, 81, 45, 0.75)' : event.score >= 35 ? 'rgba(210, 106, 59, 0.65)' : 'rgba(13, 122, 111, 0.45)';
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();

    state.scatterPlotPoints.push({ x, y, radius, event });
  });

  context.fillStyle = '#495a67';
  context.font = '12px Avenir Next, sans-serif';
  context.textAlign = 'left';
  context.fillText('Duration', 8, padding.top + 10);
  context.textAlign = 'right';
  context.fillText('Reads (log scale)', width - 6, height - 8);
}

function bindScatterEvents(elements, state, windowObject) {
  if (state.scatterEventsBound) {
    return;
  }

  elements.scatterChart.addEventListener('mousemove', event => {
    const nearest = findNearestScatterPoint(event, elements.scatterChart, state.scatterPlotPoints);
    if (!nearest) {
      hideScatterTooltip(elements.scatterTooltip, elements.scatterChart);
      return;
    }

    elements.scatterChart.style.cursor = 'pointer';
    showScatterTooltip(nearest, event, elements.scatterChart, elements.scatterTooltip);
  });

  elements.scatterChart.addEventListener('mouseleave', () => {
    hideScatterTooltip(elements.scatterTooltip, elements.scatterChart);
  });

  elements.scatterChart.addEventListener('click', event => {
    const nearest = findNearestScatterPoint(event, elements.scatterChart, state.scatterPlotPoints);
    if (!nearest) {
      return;
    }

    state.selectedId = nearest.event.id;
    renderTable(elements, state, windowObject);
    renderDetails(elements, state.analysis, state.selectedId);
    if (windowObject.innerWidth <= 1180) {
      elements.detailsPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });

  state.scatterEventsBound = true;
}

function findNearestScatterPoint(pointerEvent, scatterChart, scatterPlotPoints) {
  if (!scatterPlotPoints.length) {
    return null;
  }

  const rect = scatterChart.getBoundingClientRect();
  const x = pointerEvent.clientX - rect.left;
  const y = pointerEvent.clientY - rect.top;
  let best = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const point of scatterPlotPoints) {
    const dx = point.x - x;
    const dy = point.y - y;
    const distance = Math.sqrt((dx * dx) + (dy * dy));
    // Expand the hit area so points remain easier to target with a mouse.
    const hitRadius = Math.max(8, point.radius + 4);

    if (distance <= hitRadius && distance < bestDistance) {
      best = point;
      bestDistance = distance;
    }
  }

  return best;
}

function showScatterTooltip(point, pointerEvent, scatterChart, scatterTooltip) {
  const rect = scatterChart.getBoundingClientRect();
  const left = Math.max(12, Math.min(rect.width - 12, pointerEvent.clientX - rect.left));
  const top = Math.max(12, pointerEvent.clientY - rect.top);
  const item = point.event;

  scatterTooltip.innerHTML = `
    <strong>${escapeHtml(item.operation)} ${escapeHtml(item.table || '(unknown)')}</strong><br>
    Risk: ${formatNumber(item.score)} (${severityLabel(item.severity)})<br>
    Duration: ${formatMs(item.duration)} · Reads: ${formatNumber(item.reads)} · CPU: ${formatMs(item.cpu)}
  `;
  scatterTooltip.style.left = `${left}px`;
  scatterTooltip.style.top = `${top}px`;
  scatterTooltip.setAttribute('aria-hidden', 'false');
  scatterTooltip.classList.add('visible');
}

function hideScatterTooltip(scatterTooltip, scatterChart) {
  scatterTooltip.setAttribute('aria-hidden', 'true');
  scatterTooltip.classList.remove('visible');
  scatterChart.style.cursor = 'default';
}

function prepareCanvas(canvas, fallbackWidth, fallbackHeight, windowObject) {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(Math.floor(rect.width || fallbackWidth), 280);
  const height = Math.max(Math.floor(rect.height || fallbackHeight), fallbackHeight);
  // Scale to device pixel ratio for crisp charts on high-density displays.
  const ratio = windowObject.devicePixelRatio || 1;

  canvas.width = width * ratio;
  canvas.height = height * ratio;
  const context = canvas.getContext('2d');
  if (!context) {
    return null;
  }
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { context, width, height };
}

function drawEmptyChartState(context, width, height, message) {
  drawChartSurface(context, width, height);
  context.strokeStyle = 'rgba(31, 42, 46, 0.12)';
  context.strokeRect(16, 16, width - 32, height - 32);
  context.fillStyle = '#5c6a6f';
  context.font = '14px Avenir Next, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(message, width / 2, height / 2);
}

function drawChartSurface(context, width, height) {
  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, 'rgba(13, 122, 111, 0.09)');
  gradient.addColorStop(0.52, 'rgba(255, 255, 255, 0.95)');
  gradient.addColorStop(1, 'rgba(210, 106, 59, 0.1)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
}

function drawChartGrid(context, area) {
  const lineCount = area.lines || 4;
  context.save();
  context.strokeStyle = 'rgba(31, 42, 46, 0.12)';
  context.lineWidth = 1;

  for (let index = 0; index <= lineCount; index += 1) {
    const y = area.top + (area.height / lineCount) * index;
    context.beginPath();
    context.moveTo(area.left, y);
    context.lineTo(area.left + area.width, y);
    context.stroke();
  }

  context.restore();
}

function metaItem(label, value) {
  return `
    <div class="meta-item">
      <span>${label}</span>
      <strong>${value}</strong>
    </div>
  `;
}

function initializeExpandButtons(document, windowObject, elements, state) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      addExpandButtonsToPanel('.dashboard', document, windowObject, elements, state);
    });
  } else {
    addExpandButtonsToPanel('.dashboard', document, windowObject, elements, state);
  }
}
function addExpandButtonsToPanel(containerSelector, document, windowObject, elements, state) {
  const container = document.querySelector(containerSelector);
  if (!container) {
    return;
  }

  const panels = container.querySelectorAll('.panel');

  panels.forEach(panel => {
    const header = panel.querySelector('.panel-header');
    if (!header) {
      return;
    }

    // Check if expand button already exists
    const existingExpandBtn = header.querySelector('.expand-btn');
    if (existingExpandBtn) {
      return;
    }

    // Create action container if it doesn't exist
    let actionsDiv = header.querySelector('.panel-header-actions');
    if (!actionsDiv) {
      actionsDiv = document.createElement('div');
      actionsDiv.className = 'panel-header-actions';
      header.appendChild(actionsDiv);
    }

    const expandBtn = document.createElement('button');
    expandBtn.type = 'button';
    expandBtn.className = 'expand-btn';
    expandBtn.setAttribute('aria-label', 'Expand panel to full screen');
    expandBtn.setAttribute('title', 'Expand panel to full screen');
    expandBtn.textContent = '⤢';
    expandBtn.addEventListener('click', event => {
      event.stopPropagation();
      openPanelModal(panel, document, windowObject, elements, state);
    });

    actionsDiv.appendChild(expandBtn);
  });
}

function openPanelModal(sourcePanel, document, windowObject, elements, state) {
  const panelHeader = sourcePanel.querySelector('.panel-header');
  const panelTitle = sourcePanel.querySelector('.panel-title');
  const panelSubtitle = sourcePanel.querySelector('.panel-subtitle');
  const panelContent = sourcePanel.querySelector('.panel-content, .table-wrap');

  if (!panelContent) {
    return;
  }

  // Create modal overlay
  const modalOverlay = document.createElement('div');
  modalOverlay.className = 'modal-overlay';
  modalOverlay.setAttribute('role', 'dialog');
  modalOverlay.setAttribute('aria-modal', 'true');

  // Create modal content
  const modalContentDiv = document.createElement('div');
  modalContentDiv.className = 'modal-content';

  // Create modal header
  const modalHeaderDiv = document.createElement('div');
  modalHeaderDiv.className = 'modal-header';

  const headerTextDiv = document.createElement('div');

  if (panelTitle) {
    const titleClone = panelTitle.cloneNode(true);
    headerTextDiv.appendChild(titleClone);
  }

  if (panelSubtitle) {
    const subtitleClone = panelSubtitle.cloneNode(true);
    subtitleClone.className = 'modal-subtitle';
    headerTextDiv.appendChild(subtitleClone);
  }

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'modal-close';
  closeBtn.setAttribute('aria-label', 'Close expanded panel');
  closeBtn.textContent = '✕';

  modalHeaderDiv.appendChild(headerTextDiv);
  modalHeaderDiv.appendChild(closeBtn);

  // Create modal body
  const modalBodyDiv = document.createElement('div');
  modalBodyDiv.className = 'modal-body';

  // Clone the panel content
  const contentClone = panelContent.cloneNode(true);
  modalBodyDiv.appendChild(contentClone);

  modalContentDiv.appendChild(modalHeaderDiv);
  modalContentDiv.appendChild(modalBodyDiv);
  modalOverlay.appendChild(modalContentDiv);

  // Add to document
  document.body.appendChild(modalOverlay);

  // Trigger redraw of any canvas elements by dispatching resize
  // This is critical because cloned canvas elements lose their drawn pixel data.
  // The resize event listener in bindUiEvents will redraw charts with proper dimensions.
  windowObject.dispatchEvent(new windowObject.Event('resize'));

  // Handle close button click
  closeBtn.addEventListener('click', () => {
    closeModal(modalOverlay);
  });

  // Handle overlay click (click outside to close)
  modalOverlay.addEventListener('click', event => {
    if (event.target === modalOverlay) {
      closeModal(modalOverlay);
    }
  });

  // Handle ESC key
  const handleEscapeKey = event => {
    if (event.key === 'Escape') {
      closeModal(modalOverlay);
    }
  };

  document.addEventListener('keydown', handleEscapeKey);

  // Store cleanup function on modal for later
  modalOverlay._handleEscapeKey = handleEscapeKey;
  modalOverlay._closeCleanup = () => {
    document.removeEventListener('keydown', handleEscapeKey);
  };

  // Redraw charts on the cloned canvas elements in the modal
  // Find and redraw any canvases that were cloned into the modal
  const durationChartInModal = modalBodyDiv.querySelector('#durationChart');
  const scatterChartInModal = modalBodyDiv.querySelector('#scatterChart');
  
  if (durationChartInModal && state && state.analysis) {
    drawDurationHistogram(durationChartInModal, state.filteredEvents.filter(event => event.isQueryEvent), windowObject);
  }
  
  if (scatterChartInModal && state && state.analysis) {
    drawRiskScatter(scatterChartInModal, state.filteredEvents.filter(event => event.isQueryEvent).slice(0, 300), state, windowObject);
  }

  // Trap focus in modal and focus the close button
  focusTrapModal(modalOverlay);
  closeBtn.focus();
}

function closeModal(modalOverlay) {
  if (modalOverlay._closeCleanup) {
    modalOverlay._closeCleanup();
  }

  // Fade out animation
  modalOverlay.style.animation = 'fadeInOverlay 240ms ease reverse forwards';
  const modalContent = modalOverlay.querySelector('.modal-content');
  if (modalContent) {
    modalContent.style.animation = 'slideUpIn 240ms ease reverse forwards';
  }

  // Remove after animation
  setTimeout(() => {
    modalOverlay.remove();
  }, 240);
}

function focusTrapModal(modalOverlay) {
  const focusableElements = modalOverlay.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );

  if (focusableElements.length === 0) {
    return;
  }

  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];
  const ownerDocument = modalOverlay.ownerDocument;

  const handleTabKey = event => {
    if (event.key !== 'Tab') {
      return;
    }

    if (event.shiftKey) {
      if (ownerDocument.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      }
    } else {
      if (ownerDocument.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }
  };

  modalOverlay.addEventListener('keydown', handleTabKey);

  // Store cleanup function
  const originalCloseCleanup = modalOverlay._closeCleanup;
  modalOverlay._closeCleanup = () => {
    if (originalCloseCleanup) {
      originalCloseCleanup();
    }
    modalOverlay.removeEventListener('keydown', handleTabKey);
  };
}
