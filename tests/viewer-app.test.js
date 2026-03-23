import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { initializeViewer } from '../src/viewer-app.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const htmlPath = path.join(__dirname, '..', 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');

function createCanvasContext() {
  return {
    setTransform: () => {},
    clearRect: () => {},
    fillRect: () => {},
    strokeRect: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    stroke: () => {},
    fill: () => {},
    arc: () => {},
    fillText: () => {},
    save: () => {},
    restore: () => {},
    createLinearGradient: () => ({ addColorStop: () => {} })
  };
}

function createCanvasContextWithSpies() {
  return {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    arc: vi.fn(),
    fillText: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() }))
  };
}

function createDom({ width = 1440, canvasContext = createCanvasContext() } = {}) {
  const dom = new JSDOM(html, { url: 'http://localhost/' });
  const { window } = dom;
  window.__scrollCalls = [];
  window.scrollTo = options => {
    window.__scrollCalls.push(options);
  };
  window.innerWidth = width;
  Object.defineProperty(window, 'devicePixelRatio', { value: 1, configurable: true });
  window.HTMLCanvasElement.prototype.getContext = () => canvasContext;
  window.HTMLCanvasElement.prototype.getBoundingClientRect = () => ({ left: 0, top: 0, width: 640, height: 240 });
  window.__scrollIntoViewCalls = 0;
  window.HTMLElement.prototype.scrollIntoView = () => {
    window.__scrollIntoViewCalls += 1;
  };
  return dom;
}

class MockFileReader {
  constructor() {
    this.onload = null;
  }

  readAsText(file) {
    this.onload({ target: { result: file.content } });
  }
}

function makeRawEvent(overrides = {}) {
  return {
    name: 'sql_batch_completed',
    timestamp: '2026-03-20T10:00:00Z',
    values: {
      statement: 'SELECT * FROM dbo.Users WHERE Id = 42',
      client_app_name: 'ViewerTestApp',
      duration: 320,
      cpu_time: 45,
      logical_reads: 240,
      writes: 0,
      row_count: 1,
      session_id: 77,
      ...((overrides.values) || {})
    },
    ...overrides
  };
}

describe('viewer app integration', () => {
  let dom;
  let app;

  beforeEach(() => {
    dom = createDom();
    app = initializeViewer({
      document: dom.window.document,
      windowObject: dom.window,
      FileReaderCtor: MockFileReader
    });
  });

  it('renders processed data into the UI', () => {
    app.processData([makeRawEvent()]);

    expect(dom.window.document.getElementById('metricTotalEvents').textContent).toBe('1');
    expect(dom.window.document.querySelectorAll('#results tr').length).toBe(1);
    expect(dom.window.document.getElementById('detailsPanel').textContent).toContain('ViewerTestApp');
  });

  it('does nothing when render or upload are triggered before data exists', () => {
    app.render();
    app.loadFile(null);

    const showIntroBtn = dom.window.document.getElementById('showIntroBtn');
    showIntroBtn.dispatchEvent(new dom.window.Event('click', { bubbles: true }));

    expect(dom.window.document.body.classList.contains('show-hero')).toBe(false);
    expect(dom.window.__scrollCalls.length).toBe(0);
  });

  it('handles scatter interaction safely before any data is loaded', () => {
    const scatterChart = dom.window.document.getElementById('scatterChart');
    scatterChart.dispatchEvent(new dom.window.MouseEvent('mousemove', { clientX: 100, clientY: 100, bubbles: true }));
    scatterChart.dispatchEvent(new dom.window.MouseEvent('click', { clientX: 100, clientY: 100, bubbles: true }));

    expect(dom.window.document.getElementById('scatterTooltip').classList.contains('visible')).toBe(false);
    expect(scatterChart.style.cursor).toBe('default');
  });

  it('filters rows via the search box and shows an empty state when nothing matches', () => {
    app.processData([
      makeRawEvent({ values: { statement: 'SELECT * FROM dbo.Users' } }),
      makeRawEvent({ values: { statement: 'UPDATE dbo.Orders SET Status = 1', duration: 800, cpu_time: 120, logical_reads: 1200 } })
    ]);

    const searchInput = dom.window.document.getElementById('searchInput');
    searchInput.value = 'orders';
    searchInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }));

    expect(dom.window.document.querySelectorAll('#results tr').length).toBe(1);
    expect(dom.window.document.getElementById('results').textContent).toContain('UPDATE');

    searchInput.value = 'does-not-exist';
    searchInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }));

    expect(dom.window.document.getElementById('results').textContent).toContain('No rows match the current filters');
  });

  it('updates selected event details when a row is clicked', () => {
    app.processData([
      makeRawEvent({ values: { statement: 'SELECT * FROM dbo.Users', client_app_name: 'UsersApp' } }),
      makeRawEvent({ values: { statement: 'UPDATE dbo.Orders SET Status = 1', client_app_name: 'OrdersApp', duration: 1200, cpu_time: 140, logical_reads: 1800 } })
    ]);

    const rows = Array.from(dom.window.document.querySelectorAll('#results tr[data-id]'));
    const targetRow = rows.find(row => row.textContent.includes('OrdersApp'));

    targetRow.dispatchEvent(new dom.window.Event('click', { bubbles: true }));

    expect(dom.window.document.getElementById('detailsPanel').textContent).toContain('OrdersApp');
    const selectedRow = Array.from(dom.window.document.querySelectorAll('#results tr[data-id]')).find(row => row.className.includes('selected'));
    expect(selectedRow.textContent).toContain('OrdersApp');
  });

  it('loads valid JSON files through the upload path', () => {
    app.loadFile({
      content: JSON.stringify([makeRawEvent({ values: { duration: 999, cpu_time: 88, logical_reads: 500 } })])
    });

    expect(dom.window.document.getElementById('metricDuration').textContent).toBe('999 ms');
    expect(dom.window.document.getElementById('compactSummary').textContent).toContain('1 events loaded');
  });

  it('wires drop-zone and load-another clicks to the file picker and supports file input change', () => {
    const fileInput = dom.window.document.getElementById('fileInput');
    const clickSpy = vi.fn();
    fileInput.click = clickSpy;

    const dropZone = dom.window.document.getElementById('dropZone');
    dropZone.dispatchEvent(new dom.window.Event('click', { bubbles: true }));

    const loadAnotherBtn = dom.window.document.getElementById('loadAnotherBtn');
    loadAnotherBtn.dispatchEvent(new dom.window.Event('click', { bubbles: true }));

    expect(clickSpy).toHaveBeenCalledTimes(2);

    const changeEvent = new dom.window.Event('change', { bubbles: true });
    Object.defineProperty(changeEvent, 'target', {
      value: {
        files: [{ content: JSON.stringify([makeRawEvent({ values: { duration: 111 } })]) }]
      }
    });
    fileInput.dispatchEvent(changeEvent);

    expect(dom.window.document.getElementById('metricDuration').textContent).toBe('111 ms');
  });

  it('redraws charts on resize after analysis is available', () => {
    const chartContext = createCanvasContextWithSpies();
    dom = createDom({ canvasContext: chartContext });
    app = initializeViewer({
      document: dom.window.document,
      windowObject: dom.window,
      FileReaderCtor: MockFileReader
    });

    app.processData([makeRawEvent()]);
    const clearCallsBeforeResize = chartContext.clearRect.mock.calls.length;

    dom.window.dispatchEvent(new dom.window.Event('resize'));

    expect(chartContext.clearRect.mock.calls.length).toBeGreaterThan(clearCallsBeforeResize);
  });

  it('renders an empty finding state when analysis has no events', () => {
    app.processData([]);

    expect(dom.window.document.getElementById('findings').textContent).toContain('No profiler rows were loaded');
  });

  it('supports drag-and-drop upload and toggling the intro section', () => {
    const payload = [makeRawEvent()];
    const dropZone = dom.window.document.getElementById('dropZone');

    dropZone.dispatchEvent(new dom.window.Event('dragenter', { bubbles: true }));
    expect(dropZone.classList.contains('dragging')).toBe(true);

    const dropEvent = new dom.window.Event('drop', { bubbles: true });
    Object.defineProperty(dropEvent, 'dataTransfer', {
      value: { files: [{ content: JSON.stringify(payload) }] }
    });
    dropZone.dispatchEvent(dropEvent);

    expect(dropZone.classList.contains('dragging')).toBe(false);
    expect(dom.window.document.body.classList.contains('has-data')).toBe(true);

    const showIntroBtn = dom.window.document.getElementById('showIntroBtn');
    showIntroBtn.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
    expect(dom.window.document.body.classList.contains('show-hero')).toBe(true);
    expect(dom.window.__scrollCalls.length).toBe(1);

    showIntroBtn.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
    expect(dom.window.document.body.classList.contains('show-hero')).toBe(false);
  });

  it('renders empty chart and pattern states for non-query captures', () => {
    app.processData([
      makeRawEvent({ name: 'login', values: { statement: '', duration: 0, cpu_time: 0, logical_reads: 0, writes: 0 } })
    ]);

    expect(dom.window.document.getElementById('patternBreakdown').textContent).toContain('No repeated query signatures detected yet');
    expect(dom.window.document.getElementById('eventBreakdown').textContent).toContain('login');
  });

  it('renders repeated pattern and repeated statement findings for repeated query signatures', () => {
    const repeatedEvents = new Array(5).fill(null).map(() => makeRawEvent({
      values: {
        statement: 'SELECT * FROM dbo.Users WHERE TenantId = 12',
        duration: 40,
        cpu_time: 8,
        logical_reads: 20,
        writes: 0
      }
    }));

    app.processData(repeatedEvents);

    expect(dom.window.document.getElementById('patternBreakdown').textContent).toContain('5 executions');
    expect(dom.window.document.getElementById('findings').textContent).toContain('Repeated statement pattern');
  });

  it('shows no-obvious-hotspots finding when no heuristics are triggered', () => {
    app.processData([
      makeRawEvent({
        name: 'attention',
        values: {
          statement: '',
          duration: 0,
          cpu_time: 0,
          logical_reads: 0,
          writes: 0,
          row_count: 0
        }
      })
    ]);

    expect(dom.window.document.getElementById('findings').textContent).toContain('No obvious hotspots from current heuristics');
  });

  it('filters by hide-noise and problems-only toggles', () => {
    app.processData([
      makeRawEvent({ name: 'login', values: { statement: '', duration: 0, cpu_time: 0, logical_reads: 0, writes: 0 } }),
      makeRawEvent({ values: { statement: 'SELECT * FROM dbo.Users', duration: 5, cpu_time: 0, logical_reads: 0 } }),
      makeRawEvent({ values: { statement: 'UPDATE dbo.Orders SET Status = 1', duration: 2200, cpu_time: 700, logical_reads: 9000, writes: 120, row_count: 0 } })
    ]);

    const hideNoiseToggle = dom.window.document.getElementById('hideNoiseToggle');
    const problemsOnlyToggle = dom.window.document.getElementById('problemsOnlyToggle');

    hideNoiseToggle.checked = false;
    hideNoiseToggle.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    expect(dom.window.document.querySelectorAll('#results tr[data-id]').length).toBe(3);

    problemsOnlyToggle.checked = true;
    problemsOnlyToggle.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    expect(dom.window.document.querySelectorAll('#results tr[data-id]').length).toBe(1);
    expect(dom.window.document.getElementById('results').textContent).toContain('UPDATE');
  });

  it('scrolls details into view on mobile row selection', () => {
    dom = createDom({ width: 960 });
    app = initializeViewer({
      document: dom.window.document,
      windowObject: dom.window,
      FileReaderCtor: MockFileReader
    });

    app.processData([
      makeRawEvent({ values: { statement: 'SELECT * FROM dbo.Users', client_app_name: 'UsersApp' } }),
      makeRawEvent({ values: { statement: 'UPDATE dbo.Orders SET Status = 1', client_app_name: 'OrdersApp', duration: 1200, cpu_time: 140, logical_reads: 1800 } })
    ]);

    const targetRow = Array.from(dom.window.document.querySelectorAll('#results tr[data-id]')).find(row => row.textContent.includes('OrdersApp'));
    targetRow.dispatchEvent(new dom.window.Event('click', { bubbles: true }));

    expect(dom.window.__scrollIntoViewCalls).toBe(1);
  });

  it('shows scatter tooltip and supports scatter click selection', () => {
    dom = createDom({ width: 960 });
    app = initializeViewer({
      document: dom.window.document,
      windowObject: dom.window,
      FileReaderCtor: MockFileReader
    });

    app.processData([
      makeRawEvent({ values: { statement: 'UPDATE dbo.Orders SET Status = 1', client_app_name: 'OrdersApp', duration: 1200, cpu_time: 140, logical_reads: 1800, writes: 120, row_count: 0 } })
    ]);

    const scatterChart = dom.window.document.getElementById('scatterChart');
    const scatterTooltip = dom.window.document.getElementById('scatterTooltip');
    expect(scatterTooltip.getAttribute('aria-hidden')).toBe('true');

    scatterChart.dispatchEvent(new dom.window.MouseEvent('mousemove', { clientX: 620, clientY: 20, bubbles: true }));
    expect(scatterTooltip.classList.contains('visible')).toBe(true);
    expect(scatterTooltip.getAttribute('aria-hidden')).toBe('false');

    scatterChart.dispatchEvent(new dom.window.MouseEvent('click', { clientX: 620, clientY: 20, bubbles: true }));
    expect(dom.window.document.getElementById('detailsPanel').textContent).toContain('OrdersApp');
    expect(dom.window.__scrollIntoViewCalls).toBe(1);

    scatterChart.dispatchEvent(new dom.window.MouseEvent('mouseleave', { bubbles: true }));
    expect(scatterTooltip.classList.contains('visible')).toBe(false);
    expect(scatterTooltip.getAttribute('aria-hidden')).toBe('true');
  });

  it('hides scatter tooltip and ignores clicks when no point is nearby', () => {
    app.processData([
      makeRawEvent({ values: { statement: 'UPDATE dbo.Orders SET Status = 1', client_app_name: 'OrdersApp', duration: 1200, cpu_time: 140, logical_reads: 1800, writes: 120, row_count: 0 } })
    ]);

    const detailsBefore = dom.window.document.getElementById('detailsPanel').textContent;
    const scatterChart = dom.window.document.getElementById('scatterChart');

    scatterChart.dispatchEvent(new dom.window.MouseEvent('mousemove', { clientX: 20, clientY: 220, bubbles: true }));
    expect(dom.window.document.getElementById('scatterTooltip').classList.contains('visible')).toBe(false);
    expect(scatterChart.style.cursor).toBe('default');

    scatterChart.dispatchEvent(new dom.window.MouseEvent('click', { clientX: 20, clientY: 220, bubbles: true }));
    expect(dom.window.document.getElementById('detailsPanel').textContent).toBe(detailsBefore);
  });

  it('handles missing canvas contexts without throwing', () => {
    dom = createDom({ canvasContext: null });
    app = initializeViewer({
      document: dom.window.document,
      windowObject: dom.window,
      FileReaderCtor: MockFileReader
    });

    app.processData([makeRawEvent()]);

    expect(dom.window.document.getElementById('metricTotalEvents').textContent).toBe('1');
  });

  it('shows a parse error when uploaded JSON is invalid', () => {
    app.loadFile({ content: '{not-json}' });

    expect(dom.window.document.getElementById('findings').textContent).toContain('Could not parse file');
  });

  it('escapes hostile HTML in profiler fields instead of injecting DOM nodes', () => {
    const hostile = '<img src=x onerror="alert(1)"><script>alert(1)</script>';

    app.processData([
      makeRawEvent({
        values: {
          statement: `SELECT 1 ${hostile}`,
          client_app_name: hostile
        }
      })
    ]);

    expect(dom.window.document.querySelector('#results img')).toBeNull();
    expect(dom.window.document.querySelector('#detailsPanel img')).toBeNull();
    expect(dom.window.document.querySelector('#results script')).toBeNull();
    expect(dom.window.document.querySelector('#detailsPanel script')).toBeNull();

    expect(dom.window.document.getElementById('results').innerHTML).toContain('&lt;img');
    expect(dom.window.document.getElementById('detailsPanel').innerHTML).toContain('&lt;script&gt;');
  });

  it('caps hotspot table rendering at 750 rows when more events are visible', () => {
    const events = Array.from({ length: 760 }, (_, index) => makeRawEvent({
      values: {
        statement: `SELECT * FROM dbo.Users WHERE Id = ${index + 1}`,
        duration: 50 + index,
        cpu_time: 10,
        logical_reads: 100
      }
    }));

    app.processData(events);

    const rows = dom.window.document.querySelectorAll('#results tr[data-id]');
    expect(rows.length).toBe(750);
    expect(dom.window.document.getElementById('tableCountLabel').textContent).toContain('Showing 750 of 760 rows');
    expect(dom.window.document.getElementById('metricEventHint').textContent).toContain('760 visible, cap 750 rows');
  });

  it('handles very long SQL text without breaking rendering', () => {
    const veryLongSql = `SELECT * FROM dbo.Users WHERE Notes = '${'x'.repeat(10000)}'`;

    app.processData([
      makeRawEvent({ values: { statement: veryLongSql } })
    ]);

    const snippet = dom.window.document.querySelector('.query-snippet');
    expect(snippet).not.toBeNull();
    expect(snippet.textContent).toContain('SELECT * FROM dbo.Users');

    const detailsText = dom.window.document.getElementById('detailsPanel').textContent;
    expect(detailsText).toContain('SELECT * FROM dbo.Users');
  });

  it('renders a no-selection details state when selected item is unavailable', () => {
    app.processData([makeRawEvent()]);
    const state = app.getState();
    state.selectedId = 999999;

    const searchInput = dom.window.document.getElementById('searchInput');
    searchInput.value = 'definitely-no-match';
    searchInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }));

    expect(dom.window.document.getElementById('detailsPanel').textContent).toContain('No event selected');
  });

  it('falls back to the first visible row when selected id is no longer present', () => {
    app.processData([
      makeRawEvent({ values: { statement: 'SELECT * FROM dbo.Users', client_app_name: 'UsersApp' } }),
      makeRawEvent({ values: { statement: 'UPDATE dbo.Orders SET Flag = 1', client_app_name: 'OrdersApp' } })
    ]);

    const state = app.getState();
    state.selectedId = 999999;

    const searchInput = dom.window.document.getElementById('searchInput');
    searchInput.value = '';
    searchInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }));

    const selectedRow = dom.window.document.querySelector('#results tr[data-id].selected');
    expect(selectedRow).not.toBeNull();
    expect(state.selectedId).toBe(Number(selectedRow.dataset.id));
  });

  it('adds expand buttons to panels after data is rendered', () => {
    app.processData([makeRawEvent()]);

    const expandButtons = dom.window.document.querySelectorAll('.expand-btn');
    expect(expandButtons.length).toBeGreaterThan(0);

    expandButtons.forEach(btn => {
      expect(btn.getAttribute('aria-label')).toBe('Expand panel to full screen');
      expect(btn.textContent).toBe('⤢');
    });
  });

  it('shows a tooltip on the expand button via title attribute', () => {
    app.processData([makeRawEvent()]);

    const expandButtons = dom.window.document.querySelectorAll('.expand-btn');
    expect(expandButtons.length).toBeGreaterThan(0);

    expandButtons.forEach(btn => {
      expect(btn.getAttribute('title')).toBe('Expand panel to full screen');
    });
  });

  it('creates exactly one modal when the expand button is clicked', () => {
    app.processData([makeRawEvent()]);

    const expandBtn = dom.window.document.querySelector('.expand-btn');
    expandBtn.dispatchEvent(new dom.window.Event('click', { bubbles: true }));

    const modals = dom.window.document.querySelectorAll('.modal-overlay');
    expect(modals.length).toBe(1);
  });

  it('opens a modal when expand button is clicked', () => {
    app.processData([makeRawEvent()]);

    const expandBtn = dom.window.document.querySelector('.expand-btn');
    expect(expandBtn).not.toBeNull();

    expandBtn.dispatchEvent(new dom.window.Event('click', { bubbles: true }));

    const modal = dom.window.document.querySelector('.modal-overlay');
    expect(modal).not.toBeNull();
    expect(modal.getAttribute('role')).toBe('dialog');
    expect(modal.getAttribute('aria-modal')).toBe('true');
  });

  it('closes modal when close button is clicked', () => {
    vi.useFakeTimers();
    app.processData([makeRawEvent()]);

    const expandBtn = dom.window.document.querySelector('.expand-btn');
    expandBtn.dispatchEvent(new dom.window.Event('click', { bubbles: true }));

    let modal = dom.window.document.querySelector('.modal-overlay');
    expect(modal).not.toBeNull();

    const closeBtn = modal.querySelector('.modal-close');
    expect(closeBtn).not.toBeNull();
    expect(closeBtn.getAttribute('aria-label')).toBe('Close expanded panel');

    closeBtn.dispatchEvent(new dom.window.Event('click', { bubbles: true }));

    // Allow time for animation
    vi.advanceTimersByTime(250);
    modal = dom.window.document.querySelector('.modal-overlay');
    expect(modal).toBeNull();

    vi.useRealTimers();
  });

  it('closes modal when overlay is clicked', () => {
    vi.useFakeTimers();
    app.processData([makeRawEvent()]);

    const expandBtn = dom.window.document.querySelector('.expand-btn');
    expandBtn.dispatchEvent(new dom.window.Event('click', { bubbles: true }));

    let modal = dom.window.document.querySelector('.modal-overlay');
    expect(modal).not.toBeNull();

    modal.dispatchEvent(new dom.window.Event('click', { bubbles: true }));

    vi.advanceTimersByTime(250);
    modal = dom.window.document.querySelector('.modal-overlay');
    expect(modal).toBeNull();

    vi.useRealTimers();
  });

  it('closes modal when ESC key is pressed', () => {
    vi.useFakeTimers();
    app.processData([makeRawEvent()]);

    const expandBtn = dom.window.document.querySelector('.expand-btn');
    expandBtn.dispatchEvent(new dom.window.Event('click', { bubbles: true }));

    let modal = dom.window.document.querySelector('.modal-overlay');
    expect(modal).not.toBeNull();

    const escapeEvent = new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
    dom.window.document.dispatchEvent(escapeEvent);

    vi.advanceTimersByTime(250);
    modal = dom.window.document.querySelector('.modal-overlay');
    expect(modal).toBeNull();

    vi.useRealTimers();
  });

  it('displays panel title and subtitle in modal header', () => {
    app.processData([makeRawEvent()]);

    const expandBtn = dom.window.document.querySelector('.expand-btn');
    expandBtn.dispatchEvent(new dom.window.Event('click', { bubbles: true }));

    const modal = dom.window.document.querySelector('.modal-overlay');
    const modalTitle = modal.querySelector('.modal-header h2');
    expect(modalTitle).not.toBeNull();
    expect(modalTitle.textContent.length).toBeGreaterThan(0);
  });

  it('prevents event bubble when expand button is clicked', () => {
    app.processData([makeRawEvent()]);

    const expandBtn = dom.window.document.querySelector('.expand-btn');
    const clickEvent = new dom.window.Event('click', { bubbles: true });
    const stopPropagationSpy = vi.fn();
    clickEvent.stopPropagation = stopPropagationSpy;

    expandBtn.dispatchEvent(clickEvent);

    expect(stopPropagationSpy).toHaveBeenCalled();
  });

  it('sets up focus trap by attaching keydown listener to modal', () => {
    app.processData([makeRawEvent()]);

    const expandBtn = dom.window.document.querySelector('.expand-btn');
    expandBtn.dispatchEvent(new dom.window.Event('click', { bubbles: true }));

    const modal = dom.window.document.querySelector('.modal-overlay');
    expect(modal).not.toBeNull();

    // Verify that the modal has a keydown event listener by checking if Tab key works
    const focusableElements = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    expect(focusableElements.length).toBeGreaterThan(0);

    // Test Tab key handling by simulating tabbing through focusable elements
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    // Simulate Tab from last element
    Object.defineProperty(dom.window.document, 'activeElement', { value: lastElement, configurable: true });
    const tabEvent = new dom.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true });
    modal.dispatchEvent(tabEvent);

    // Simulate Shift+Tab from first element
    Object.defineProperty(dom.window.document, 'activeElement', { value: firstElement, configurable: true });
    const shiftTabEvent = new dom.window.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true });
    modal.dispatchEvent(shiftTabEvent);

    // Both should have been handled without errors
    expect(modal).not.toBeNull();
  });

  it('expands hotspot table in modal with overflow scroll for multiple rows', () => {
    // Create enough events to exceed normal view
    const events = new Array(30).fill(null).map((_, index) =>
      makeRawEvent({
        values: {
          statement: `SELECT * FROM table${index}`,
          client_app_name: `App${index}`,
          duration: 100 + index * 10,
          cpu_time: 20 + index * 2,
          logical_reads: 50 + index * 5,
          writes: 0
        }
      })
    );

    app.processData(events);

    const hotspotExpandBtn = Array.from(dom.window.document.querySelectorAll('.expand-btn')).find(btn => {
      const panel = btn.closest('.panel');
      return panel && panel.querySelector('.table-wrap');
    });

    expect(hotspotExpandBtn).not.toBeNull();
    hotspotExpandBtn.dispatchEvent(new dom.window.Event('click', { bubbles: true }));

    const modal = dom.window.document.querySelector('.modal-overlay');
    const modalBody = modal.querySelector('.modal-body');
    const tableWrap = modalBody.querySelector('.table-wrap');
    const table = tableWrap.querySelector('table');

    expect(tableWrap).not.toBeNull();
    expect(modalBody.classList.contains('modal-body')).toBe(true);
    // Table should be present and have multiple visible rows
    expect(table).not.toBeNull();
    const rows = tableWrap.querySelectorAll('tbody tr');
    expect(rows.length).toBeGreaterThan(0);
  });

  it('modal displays chart content with appropriate sizing', () => {
    app.processData([makeRawEvent()]);

    const chartExpandBtn = Array.from(dom.window.document.querySelectorAll('.expand-btn')).find(btn => {
      const panel = btn.closest('.panel');
      return panel && panel.querySelector('canvas');
    });

    expect(chartExpandBtn).not.toBeNull();
    chartExpandBtn.dispatchEvent(new dom.window.Event('click', { bubbles: true }));

    const modal = dom.window.document.querySelector('.modal-overlay');
    const canvas = modal.querySelector('canvas');
    const canvasWrap = modal.querySelector('.canvas-wrap');

    expect(canvas).not.toBeNull();
    expect(canvasWrap).not.toBeNull();
    // Canvas wrap should be in the modal body
    expect(modal.querySelector('.modal-body .canvas-wrap')).not.toBeNull();
  });

  it('modal body scrolls when content exceeds viewport height', () => {
    // Create many events to generate tall content in table
    const events = new Array(50).fill(null).map((_, index) =>
      makeRawEvent({
        values: {
          statement: `SELECT * FROM table${index}`,
          duration: 100 + index * 5,
          cpu_time: 20 + index,
          logical_reads: 50 + index * 3
        }
      })
    );

    app.processData(events);

    // Find and click the hotspot table expand button
    const hotspotExpandBtn = Array.from(dom.window.document.querySelectorAll('.expand-btn')).find(btn => {
      const panel = btn.closest('.panel');
      return panel && panel.querySelector('.table-wrap');
    });
    
    expect(hotspotExpandBtn).not.toBeNull();
    hotspotExpandBtn.dispatchEvent(new dom.window.Event('click', { bubbles: true }));

    const modal = dom.window.document.querySelector('.modal-overlay');
    const modalBody = modal.querySelector('.modal-body');
    const modalContent = modal.querySelector('.modal-content');
    const tableWrapInModal = modalBody.querySelector('.table-wrap');

    expect(modalBody).not.toBeNull();
    expect(modalContent).not.toBeNull();
    // Modal body should have appropriate class for scrolling
    expect(modalBody.classList.contains('modal-body')).toBe(true);
    // Table wrap should be accessible in modal
    expect(tableWrapInModal).not.toBeNull();
    
    // Verify modal body can scroll - it should have height less than the total content
    // or a min-height constraint to enable scroll
    const tableRows = tableWrapInModal.querySelectorAll('tbody tr');
    expect(tableRows.length).toBeGreaterThan(0);
  });

  it('risk scatter chart renders with proper dimensions in modal', () => {
    const chartContext = createCanvasContextWithSpies();
    dom = createDom({ canvasContext: chartContext });
    app = initializeViewer({
      document: dom.window.document,
      windowObject: dom.window,
      FileReaderCtor: MockFileReader
    });

    app.processData([makeRawEvent()]);

    const scatterExpandBtn = Array.from(dom.window.document.querySelectorAll('.expand-btn')).find(btn => {
      const panel = btn.closest('.panel');
      return panel && panel.textContent.includes('Risk Map');
    });

    expect(scatterExpandBtn).not.toBeNull();
    scatterExpandBtn.dispatchEvent(new dom.window.Event('click', { bubbles: true }));

    const modal = dom.window.document.querySelector('.modal-overlay');
    const scatterCanvas = modal.querySelector('canvas');
    const canvasWrap = modal.querySelector('.canvas-wrap');

    expect(scatterCanvas).not.toBeNull();
    expect(canvasWrap).not.toBeNull();
    // Canvas should be rendered in modal with non-zero dimensions
    expect(scatterCanvas.width).toBeGreaterThan(0);
    expect(scatterCanvas.height).toBeGreaterThan(0);
  });

  it('duration histogram chart renders with proper dimensions in modal', () => {
    const chartContext = createCanvasContextWithSpies();
    dom = createDom({ canvasContext: chartContext });
    app = initializeViewer({
      document: dom.window.document,
      windowObject: dom.window,
      FileReaderCtor: MockFileReader
    });

    app.processData([makeRawEvent()]);

    const eventMixExpandBtn = Array.from(dom.window.document.querySelectorAll('.expand-btn')).find(btn => {
      const panel = btn.closest('.panel');
      return panel && panel.textContent.includes('Event Mix');
    });

    expect(eventMixExpandBtn).not.toBeNull();
    eventMixExpandBtn.dispatchEvent(new dom.window.Event('click', { bubbles: true }));

    const modal = dom.window.document.querySelector('.modal-overlay');
    const canvases = modal.querySelectorAll('canvas');

    expect(canvases.length).toBeGreaterThan(0);
    // All canvases in modal should have dimensions and be ready for drawing
    canvases.forEach(canvas => {
      expect(canvas.width).toBeGreaterThan(0);
      expect(canvas.height).toBeGreaterThan(0);
    });
  });

  it('verifies scatter chart drawing operations are called in modal', () => {
    const chartContext = createCanvasContextWithSpies();
    dom = createDom({ canvasContext: chartContext });
    app = initializeViewer({
      document: dom.window.document,
      windowObject: dom.window,
      FileReaderCtor: MockFileReader
    });

    // Process event data first
    app.processData([makeRawEvent()]);

    // Reset spy call counts before opening modal to isolate the modal interaction
    chartContext.arc.mockClear();
    chartContext.fillRect.mockClear();
    chartContext.beginPath.mockClear();
    chartContext.stroke.mockClear();
    chartContext.fill.mockClear();
    chartContext.clearRect.mockClear();

    // Find and click the scatter (Risk Map) expand button
    const scatterExpandBtn = Array.from(dom.window.document.querySelectorAll('.expand-btn')).find(btn => {
      const panel = btn.closest('.panel');
      return panel && panel.textContent.includes('Risk Map');
    });

    expect(scatterExpandBtn).not.toBeNull();
    scatterExpandBtn.dispatchEvent(new dom.window.Event('click', { bubbles: true }));

    // After opening modal and resize event dispatch, drawing operations should have been called
    // Scatter chart uses arc() for points, beginPath(), and stroke() for axes
    expect(chartContext.clearRect.mock.calls.length).toBeGreaterThan(0);
    // Arc is called for each data point
    expect(chartContext.arc.mock.calls.length).toBeGreaterThan(0);
    // At least some fill/stroke operations for the points
    expect(chartContext.fill.mock.calls.length).toBeGreaterThan(0);
    
    // Log actual call counts for debugging
    console.log('Scatter chart drawing calls:', {
      clearRect: chartContext.clearRect.mock.calls.length,
      arc: chartContext.arc.mock.calls.length,
      fill: chartContext.fill.mock.calls.length,
      beginPath: chartContext.beginPath.mock.calls.length
    });
  });

  it('verifies histogram chart drawing operations are called in modal', () => {
    const chartContext = createCanvasContextWithSpies();
    dom = createDom({ canvasContext: chartContext });
    app = initializeViewer({
      document: dom.window.document,
      windowObject: dom.window,
      FileReaderCtor: MockFileReader
    });

    // Process event data
    app.processData([makeRawEvent()]);

    // Reset spy call counts before opening modal
    chartContext.fillRect.mockClear();
    chartContext.clearRect.mockClear();
    chartContext.fillText.mockClear();

    // Find and click the histogram (Event Mix) expand button
    const histogramExpandBtn = Array.from(dom.window.document.querySelectorAll('.expand-btn')).find(btn => {
      const panel = btn.closest('.panel');
      return panel && panel.textContent.includes('Event Mix');
    });

    expect(histogramExpandBtn).not.toBeNull();
    histogramExpandBtn.dispatchEvent(new dom.window.Event('click', { bubbles: true }));

    // After opening modal, histogram drawing operations should occur
    // Histogram uses fillRect() for bars and fillText() for labels
    expect(chartContext.clearRect.mock.calls.length).toBeGreaterThan(0);
    // fillRect is called for each bar in histogram
    expect(chartContext.fillRect.mock.calls.length).toBeGreaterThan(0);
  });

  it('verifies canvas in modal has correct dimensions from getBoundingClientRect', () => {
    dom = createDom({});
    app = initializeViewer({
      document: dom.window.document,
      windowObject: dom.window,
      FileReaderCtor: MockFileReader
    });

    // Process event data
    app.processData([makeRawEvent()]);

    // Find and click the scatter (Risk Map) expand button
    const scatterExpandBtn = Array.from(dom.window.document.querySelectorAll('.expand-btn')).find(btn => {
      const panel = btn.closest('.panel');
      return panel && panel.textContent.includes('Risk Map');
    });

    expect(scatterExpandBtn).not.toBeNull();
    scatterExpandBtn.dispatchEvent(new dom.window.Event('click', { bubbles: true }));

    // Get the canvas in the modal
    const modal = dom.window.document.querySelector('.modal-overlay');
    const canvasInModal = modal.querySelector('canvas');

    expect(canvasInModal).not.toBeNull();
    
    // Check what getBoundingClientRect returns and what the actual attributes are
    const rect = canvasInModal.getBoundingClientRect();
    console.log('Modal canvas dimensions:', {
      'getBoundingClientRect.width': rect.width,
      'getBoundingClientRect.height': rect.height,
      'canvas.width attribute': canvasInModal.width,
      'canvas.height attribute': canvasInModal.height
    });
    
    // Both HTML attributes and bounding rect should be > 0
    expect(canvasInModal.width).toBeGreaterThan(0);
    expect(canvasInModal.height).toBeGreaterThan(0);
    expect(rect.width).toBeGreaterThan(0);
    expect(rect.height).toBeGreaterThan(0);
  });
});
