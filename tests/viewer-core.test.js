import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import {
  QUERY_EVENTS,
  NOISE_EVENTS,
  processRawData,
  normalizeEntry,
  buildAnalysis,
  filterEvents,
  calculateVisibleMetrics,
  cleanSql,
  decodeEntities,
  extractOperation,
  extractTable,
  createSignature,
  severityFromScore,
  severityLabel,
  severityHelp,
  percentile,
  toNumber,
  sum,
  formatNumber,
  formatMs,
  formatPercent,
  escapeHtml
} from '../src/viewer-core.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

describe('constants', () => {
  it('exposes query and noise event sets', () => {
    expect(QUERY_EVENTS.has('sql_batch_completed')).toBe(true);
    expect(NOISE_EVENTS.has('login')).toBe(true);
  });
});

describe('parsing and normalization', () => {
  it('normalizes entries with fallback fields and numeric coercion', () => {
    const entry = makeRawEvent({
      name: 'rpc_completed',
      values: {
        statement: '',
        batch_text: 'UPDATE [dbo].[Users] SET Name = \"x\" WHERE Id = 1',
        client_app_name: '',
        nt_username: 'DOMAIN\\user',
        duration: '100',
        cpu_time: '11',
        logical_reads: '15',
        writes: '2',
        row_count: '1'
      }
    });

    const normalized = normalizeEntry(entry, 9);

    expect(normalized.id).toBe(9);
    expect(normalized.app).toBe('DOMAIN\\user');
    expect(normalized.operation).toBe('UPDATE');
    expect(normalized.table).toBe('dbo.Users');
    expect(normalized.duration).toBe(100);
    expect(normalized.cpu).toBe(11);
    expect(normalized.reads).toBe(15);
    expect(normalized.writes).toBe(2);
    expect(normalized.rows).toBe(1);
    expect(normalized.isQueryEvent).toBe(true);
  });

  it('marks reset-connection statement as noise and not query work', () => {
    const entry = makeRawEvent({
      name: 'attention',
      values: {
        statement: 'exec sp_reset_connection',
        duration: 0,
        cpu_time: 0,
        logical_reads: 0,
        writes: 0
      }
    });

    const normalized = normalizeEntry(entry, 0);
    expect(normalized.isNoise).toBe(true);
    expect(normalized.isQueryEvent).toBe(false);
  });

  it('processes arrays and object maps and computes selected id', () => {
    const rawArray = [
      makeRawEvent({ values: { duration: 10 } }),
      makeRawEvent({ values: { duration: 999, logical_reads: 9000, cpu_time: 999 } })
    ];

    const resultFromArray = processRawData(rawArray);
    expect(resultFromArray.allEvents.length).toBe(2);
    expect(resultFromArray.selectedId).toBeTypeOf('number');

    const rawObject = { a: rawArray[0], b: rawArray[1] };
    const resultFromObject = processRawData(rawObject);
    expect(resultFromObject.allEvents.length).toBe(2);
  });

  it('uses safe defaults when event metadata is missing', () => {
    const normalized = normalizeEntry({ values: {} }, 3);

    expect(normalized.eventName).toBe('unknown');
    expect(normalized.timestamp).toBe('');
    expect(normalized.app).toBe('Unknown');
    expect(normalized.isQueryEvent).toBe(false);
  });
});

describe('analysis and filtering', () => {
  it('builds metrics, sorts risk, and emits expected tags', () => {
    const repeated = Array.from({ length: 5 }, (_, index) => ({
      id: index,
      eventName: 'sql_batch_completed',
      sql: 'SELECT * FROM dbo.Users WHERE OrgId = 1',
      operation: 'SELECT',
      table: 'dbo.Users',
      duration: 1200,
      cpu: 400,
      reads: 10000,
      writes: 60,
      rows: 0,
      isNoise: false,
      isQueryEvent: true,
      signature: 'SELECT|dbo.Users|sigA'
    }));

    const noise = {
      id: 99,
      eventName: 'login',
      sql: '',
      operation: 'LOGIN',
      table: '',
      duration: 0,
      cpu: 0,
      reads: 0,
      writes: 0,
      rows: 0,
      isNoise: true,
      isQueryEvent: false,
      signature: 'LOGIN||'
    };

    const sparseNoSql = {
      id: 100,
      eventName: 'custom_event',
      sql: '',
      operation: 'CUSTOM_EVENT',
      table: '',
      duration: 1,
      cpu: 0,
      reads: 0,
      writes: 0,
      rows: 0,
      isNoise: false,
      isQueryEvent: false,
      signature: 'CUSTOM_EVENT||'
    };

    const analysis = buildAnalysis([...repeated, noise, sparseNoSql]);

    expect(analysis.metrics.totalEvents).toBe(7);
    expect(analysis.metrics.totalQueries).toBe(5);
    expect(analysis.metrics.noiseShare).toBeCloseTo(1 / 7, 5);
    expect(analysis.queryEvents[0].score).toBeGreaterThan(0);
    expect(analysis.queryEvents[0].tags).toContain('Repeated 5x');
    expect(analysis.queryEvents[0].tags).toContain('Slow duration');
    expect(analysis.queryEvents[0].tags).toContain('High logical reads');
    expect(analysis.queryEvents[0].tags).toContain('High writes');
    expect(analysis.queryEvents[0].tags).toContain('High CPU');
    expect(analysis.queryEvents[0].tags).toContain('Reads without rows');

    const lowSignal = analysis.events.find(item => item.id === 100);
    expect(lowSignal.tags).toContain('No SQL text');
  });

  it('scores medium thresholds and sorts groups by cumulative cost', () => {
    const events = [
      {
        id: 1,
        eventName: 'sql_batch_completed',
        sql: 'SELECT * FROM dbo.Users WHERE Id = 1',
        operation: 'SELECT',
        table: 'dbo.Users',
        duration: 200,
        cpu: 20,
        reads: 210,
        writes: 0,
        rows: 10,
        isNoise: false,
        isQueryEvent: true,
        signature: 'SELECT|dbo.Users|sigA'
      },
      {
        id: 2,
        eventName: 'sql_batch_completed',
        sql: 'SELECT * FROM dbo.Users WHERE Id = 2',
        operation: 'SELECT',
        table: 'dbo.Users',
        duration: 210,
        cpu: 21,
        reads: 220,
        writes: 0,
        rows: 10,
        isNoise: false,
        isQueryEvent: true,
        signature: 'SELECT|dbo.Users|sigA'
      },
      {
        id: 3,
        eventName: 'sql_batch_completed',
        sql: 'SELECT * FROM dbo.Orders WHERE Id = 10',
        operation: 'SELECT',
        table: 'dbo.Orders',
        duration: 120,
        cpu: 15,
        reads: 150,
        writes: 0,
        rows: 5,
        isNoise: false,
        isQueryEvent: true,
        signature: 'SELECT|dbo.Orders|sigB'
      }
    ];

    const analysis = buildAnalysis(events);
    const scoredUsersEvent = analysis.events.find(item => item.id === 1);

    expect(scoredUsersEvent.score).toBeGreaterThanOrEqual(28);
    expect(analysis.groups[0].signature).toBe('SELECT|dbo.Users|sigA');
    expect(analysis.groups[1].signature).toBe('SELECT|dbo.Orders|sigB');
  });

  it('filters events by noise, problem threshold, and search text', () => {
    const events = [
      { id: 1, isNoise: true, score: 99, duration: 1, reads: 1, sql: 'login', app: 'a', table: 't', eventName: 'login', operation: 'LOGIN' },
      { id: 2, isNoise: false, score: 20, duration: 2, reads: 2, sql: 'select * from dbo.Users', app: 'reporter', table: 'dbo.Users', eventName: 'sql_batch_completed', operation: 'SELECT' },
      { id: 3, isNoise: false, score: 60, duration: 3, reads: 3, sql: 'update dbo.Users', app: 'worker', table: 'dbo.Users', eventName: 'sql_batch_completed', operation: 'UPDATE' }
    ];

    const filtered = filterEvents(events, {
      hideNoise: true,
      problemsOnly: true,
      searchTerm: 'update'
    });

    expect(filtered.map(item => item.id)).toEqual([3]);
  });

  it('returns sorted events when no search term is supplied', () => {
    const events = [
      { id: 1, isNoise: false, score: 10, duration: 15, reads: 5, sql: 'a', app: 'a', table: 'a', eventName: 'e1', operation: 'SELECT' },
      { id: 2, isNoise: false, score: 10, duration: 20, reads: 5, sql: 'b', app: 'b', table: 'b', eventName: 'e2', operation: 'SELECT' },
      { id: 3, isNoise: false, score: 30, duration: 5, reads: 1, sql: 'c', app: 'c', table: 'c', eventName: 'e3', operation: 'SELECT' }
    ];

    const filtered = filterEvents(events, {
      hideNoise: false,
      problemsOnly: false,
      searchTerm: ''
    });

    expect(filtered.map(item => item.id)).toEqual([3, 2, 1]);
  });

  it('calculates visible metrics from filtered events', () => {
    const analysis = {
      metrics: {
        totalEvents: 4,
        totalQueries: 3,
        noiseShare: 0.25,
        p95Duration: 100,
        p95Cpu: 20,
        p95Reads: 300
      }
    };

    const filteredEvents = [
      { isQueryEvent: true, duration: 10, cpu: 2, reads: 5, score: 10 },
      { isQueryEvent: true, duration: 90, cpu: 15, reads: 250, score: 45 },
      { isQueryEvent: false, duration: 0, cpu: 0, reads: 0, score: 5 }
    ];

    const metrics = calculateVisibleMetrics(analysis, filteredEvents);
    expect(metrics.visibleDuration).toBe(100);
    expect(metrics.visibleCpu).toBe(17);
    expect(metrics.visibleReads).toBe(255);
    expect(metrics.visibleRisk).toBe(60);
    expect(metrics.flaggedRows).toBe(1);
    expect(metrics.totalEvents).toBe(4);
  });

  it('parses the exported trace fixture and builds stable metrics', () => {
    const fixturePath = path.join(__dirname, 'fixtures', 'ADS_Standard_e2e_events.json');
    const rawTrace = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

    const processed = processRawData(rawTrace);

    expect(processed.allEvents.length).toBeGreaterThan(0);
    expect(processed.analysis.metrics.totalEvents).toBe(processed.allEvents.length);
    expect(processed.analysis.metrics.totalQueries).toBeGreaterThanOrEqual(0);
    expect(processed.analysis.metrics.noiseShare).toBeGreaterThanOrEqual(0);
    expect(processed.analysis.metrics.noiseShare).toBeLessThanOrEqual(1);
    expect(processed.selectedId === null || typeof processed.selectedId === 'number').toBe(true);
  });

  it('filters fixture-derived events without throwing and preserves ordering', () => {
    const fixturePath = path.join(__dirname, 'fixtures', 'ADS_Standard_e2e_events.json');
    const rawTrace = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    const processed = processRawData(rawTrace);

    const filtered = filterEvents(processed.analysis.events, {
      hideNoise: true,
      problemsOnly: true,
      searchTerm: 'select'
    });

    expect(Array.isArray(filtered)).toBe(true);
    for (let index = 1; index < filtered.length; index += 1) {
      const previous = filtered[index - 1];
      const current = filtered[index];
      const correctlyOrdered = previous.score > current.score
        || (previous.score === current.score && previous.duration > current.duration)
        || (previous.score === current.score && previous.duration === current.duration && previous.reads >= current.reads);
      expect(correctlyOrdered).toBe(true);
    }
  });

  it('handles empty analysis inputs without errors', () => {
    const analysis = buildAnalysis([]);

    expect(analysis.events).toEqual([]);
    expect(analysis.queryEvents).toEqual([]);
    expect(analysis.groups).toEqual([]);
    expect(analysis.metrics.totalEvents).toBe(0);
    expect(analysis.metrics.noiseShare).toBe(0);
  });
});

describe('utility functions', () => {
  it('cleans SQL and decodes entities', () => {
    const sql = "exec sp_executesql N'SELECT &lt;tag&gt; FROM dbo.Users WHERE Name = ''A''',N'@p1 int',@p1=1";
    expect(cleanSql(sql)).toContain('SELECT <tag> FROM dbo.Users');
    expect(decodeEntities('&lt;a&gt;&amp;&#39;&quot;')).toBe('<a>&\'"');
  });

  it('extracts operation and table with fallbacks', () => {
    expect(extractOperation('select 1', '', 'ignored')).toBe('SELECT');
    expect(extractOperation('', 'dbo.Users', 'rpc_completed')).toBe('RPC_COMPLETED');
    expect(extractOperation('', '', '')).toBe('UNKNOWN');

    expect(extractTable('SELECT * FROM [dbo].[Users]')).toBe('dbo.Users');
    expect(extractTable('INSERT INTO audit.Events values (1)')).toBe('audit.Events');
    expect(extractTable('no table here')).toBe('');
  });

  it('normalizes query signature values', () => {
    expect(createSignature('', 'SELECT', 'dbo.Users')).toBe('SELECT|dbo.Users');

    const sig = createSignature(
      "SELECT * FROM dbo.Users WHERE Name = 'Alice' AND Id = 123 AND OrgId = @org",
      'SELECT',
      'dbo.Users'
    );

    expect(sig).toContain('select * from dbo.users where name = ? and id = ? and orgid = @param');
  });

  it('maps severity labels and help text', () => {
    expect(severityFromScore(0)).toBe('low');
    expect(severityFromScore(25)).toBe('medium');
    expect(severityFromScore(50)).toBe('high');
    expect(severityFromScore(70)).toBe('critical');

    expect(severityLabel('critical')).toContain('High urgency');
    expect(severityLabel('high')).toContain('Needs review');
    expect(severityLabel('medium')).toContain('Worth checking');
    expect(severityLabel('low')).toContain('Likely OK');

    expect(severityHelp('critical')).toContain('Prioritize this first');
    expect(severityHelp('high')).toContain('execution plan');
    expect(severityHelp('medium')).toContain('worth tracking');
    expect(severityHelp('low')).toContain('No strong warning signals');
  });

  it('handles numeric and formatting helpers', () => {
    expect(percentile([], 95)).toBe(0);
    expect(percentile([10, 30, 20, 40], 50)).toBe(20);

    expect(toNumber('42')).toBe(42);
    expect(toNumber('nope')).toBe(0);

    expect(sum([{ a: 1 }, { a: 4 }, { a: 0 }], 'a')).toBe(5);

    expect(formatNumber(1200.2)).toBe('1,200');
    expect(formatMs(15.2)).toBe('15 ms');
    expect(formatPercent(0.256)).toBe('26%');

    expect(escapeHtml('<script>"x" & y</script>')).toBe('&lt;script&gt;&quot;x&quot; &amp; y&lt;/script&gt;');
  });
});
