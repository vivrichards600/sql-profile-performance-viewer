export const QUERY_EVENTS = new Set([
  'rpc_completed',
  'sql_batch_completed',
  'sp_statement_completed',
  'sql_statement_completed'
]);

export const NOISE_EVENTS = new Set(['login', 'logout']);

export function processRawData(raw) {
  const entries = Array.isArray(raw) ? raw : Object.values(raw || {});

  const allEvents = entries
    .filter(entry => entry && typeof entry === 'object' && Object.keys(entry).length)
    .map((entry, index) => normalizeEntry(entry, index))
    .filter(Boolean);

  const analysis = buildAnalysis(allEvents);
  const selectedId = analysis.queryEvents[0] ? analysis.queryEvents[0].id : (allEvents[0] ? allEvents[0].id : null);

  return { allEvents, analysis, selectedId };
}

export function normalizeEntry(entry, index) {
  const values = entry.values || {};
  const rawStatement = values.statement || values.batch_text || values.object_name || '';
  const sql = cleanSql(rawStatement);
  const operation = extractOperation(sql, values.object_name, entry.name);
  const table = extractTable(sql);
  const eventName = entry.name || 'unknown';
  const duration = toNumber(values.duration);
  const cpu = toNumber(values.cpu_time);
  const reads = toNumber(values.logical_reads);
  const writes = toNumber(values.writes);
  const rows = toNumber(values.row_count);
  const isNoise = NOISE_EVENTS.has(eventName) || sql.includes('sp_reset_connection');
  const isQueryEvent = QUERY_EVENTS.has(eventName) || (!!sql && !isNoise && (duration > 0 || cpu > 0 || reads > 0 || writes > 0));

  return {
    id: index,
    eventName,
    timestamp: entry.timestamp || '',
    sql,
    app: values.client_app_name || values.nt_username || 'Unknown',
    database: values.database_name || values.database_id || '',
    objectName: values.object_name || '',
    operation,
    table,
    duration,
    cpu,
    reads,
    writes,
    rows,
    sessionId: values.session_id || '',
    queryHash: values.query_hash || '',
    attachActivityId: values.attach_activity_id || values.attach_activity_id_xfer || '',
    isNoise,
    isQueryEvent,
    signature: createSignature(sql, operation, table)
  };
}

export function buildAnalysis(events) {
  const queryEvents = events.filter(event => event.isQueryEvent);
  const noiseEvents = events.filter(event => event.isNoise);
  const durationValues = queryEvents.map(event => event.duration);
  const readValues = queryEvents.map(event => event.reads);
  const writeValues = queryEvents.map(event => event.writes);
  const cpuValues = queryEvents.map(event => event.cpu);
  const p95Duration = percentile(durationValues, 95);
  const p95Reads = percentile(readValues, 95);
  const p95Writes = percentile(writeValues, 95);
  const p95Cpu = percentile(cpuValues, 95);
  const groups = new Map();
  const eventTypeCounts = new Map();

  for (const event of events) {
    eventTypeCounts.set(event.eventName, (eventTypeCounts.get(event.eventName) || 0) + 1);

    if (event.signature) {
      if (!groups.has(event.signature)) {
        groups.set(event.signature, {
          signature: event.signature,
          sql: event.sql,
          operation: event.operation,
          table: event.table,
          count: 0,
          totalDuration: 0,
          totalReads: 0,
          maxDuration: 0
        });
      }

      const group = groups.get(event.signature);
      group.count += 1;
      group.totalDuration += event.duration;
      group.totalReads += event.reads;
      group.maxDuration = Math.max(group.maxDuration, event.duration);
    }
  }

  const groupList = Array.from(groups.values())
    .filter(group => group.sql)
    .sort((left, right) => (right.totalDuration + right.totalReads) - (left.totalDuration + left.totalReads));

  const groupMap = new Map(groupList.map(group => [group.signature, group]));
  const totalRisk = { value: 0 };

  for (const event of events) {
    const repeatedCount = groupMap.get(event.signature)?.count || 1;
    const tags = [];
    const durationLimit = Math.max(250, p95Duration || 0);
    const readLimit = Math.max(500, p95Reads || 0);
    const writeLimit = Math.max(50, p95Writes || 0);
    const cpuLimit = Math.max(50, p95Cpu || 0);
    let score = 0;

    if (event.isNoise) {
      score += 8;
      tags.push('Connection noise');
    }
    if (event.duration >= durationLimit) {
      score += 35;
      tags.push('Slow duration');
    } else if (event.duration >= durationLimit * 0.5) {
      score += 16;
    }
    if (event.reads >= readLimit) {
      score += 28;
      tags.push('High logical reads');
    } else if (event.reads >= readLimit * 0.4) {
      score += 12;
    }
    if (event.writes >= writeLimit) {
      score += 18;
      tags.push('High writes');
    }
    if (event.cpu >= cpuLimit) {
      score += 18;
      tags.push('High CPU');
    }
    if (repeatedCount >= 5) {
      score += Math.min(25, repeatedCount * 2);
      tags.push(`Repeated ${repeatedCount}x`);
    }
    if (event.rows === 0 && event.reads >= Math.max(100, readLimit * 0.35)) {
      score += 14;
      tags.push('Reads without rows');
    }
    if (!event.sql && !event.isNoise) {
      score += 10;
      tags.push('No SQL text');
    }

    event.tags = tags;
    event.score = score;
    event.severity = severityFromScore(score);
    totalRisk.value += score;
  }

  queryEvents.sort((left, right) => right.score - left.score || right.duration - left.duration || right.reads - left.reads);

  return {
    events,
    queryEvents,
    noiseEvents,
    groups: groupList,
    eventTypeCounts: Array.from(eventTypeCounts.entries()).sort((left, right) => right[1] - left[1]),
    metrics: {
      totalEvents: events.length,
      totalQueries: queryEvents.length,
      totalDuration: sum(queryEvents, 'duration'),
      totalCpu: sum(queryEvents, 'cpu'),
      totalReads: sum(queryEvents, 'reads'),
      totalWrites: sum(queryEvents, 'writes'),
      totalRows: sum(queryEvents, 'rows'),
      totalRisk: totalRisk.value,
      p95Duration,
      p95Reads,
      p95Writes,
      p95Cpu,
      slowest: queryEvents[0] || null,
      maxDuration: Math.max(...durationValues, 0),
      noiseShare: events.length ? noiseEvents.length / events.length : 0
    }
  };
}

export function filterEvents(events, options) {
  const searchTerm = (options.searchTerm || '').trim().toLowerCase();

  const filtered = events.filter(event => {
    if (options.hideNoise && event.isNoise) {
      return false;
    }
    if (options.problemsOnly && event.score < 35) {
      return false;
    }
    if (!searchTerm) {
      return true;
    }

    return [event.sql, event.app, event.table, event.eventName, event.operation]
      .join(' ')
      .toLowerCase()
      .includes(searchTerm);
  });

  filtered.sort((left, right) => right.score - left.score || right.duration - left.duration || right.reads - left.reads);
  return filtered;
}

export function calculateVisibleMetrics(analysis, filteredEvents) {
  const visibleQueryEvents = filteredEvents.filter(event => event.isQueryEvent);

  return {
    visibleDuration: sum(visibleQueryEvents, 'duration'),
    visibleCpu: sum(visibleQueryEvents, 'cpu'),
    visibleReads: sum(visibleQueryEvents, 'reads'),
    visibleRisk: sum(filteredEvents, 'score'),
    flaggedRows: filteredEvents.filter(event => event.score >= 35).length,
    visibleQueries: visibleQueryEvents.length,
    totalEvents: analysis.metrics.totalEvents,
    totalQueries: analysis.metrics.totalQueries,
    noiseShare: analysis.metrics.noiseShare,
    p95Duration: analysis.metrics.p95Duration,
    p95Cpu: analysis.metrics.p95Cpu,
    p95Reads: analysis.metrics.p95Reads
  };
}

export function cleanSql(sql) {
  if (!sql) {
    return '';
  }

  return decodeEntities(String(sql))
    .replace(/\s+/g, ' ')
    .replace(/^exec\s+sp_executesql\s+N'/i, '')
    .replace(/',N'.*$/i, '')
    .trim();
}

export function decodeEntities(text) {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');
}

export function extractOperation(sql, objectName, eventName) {
  const source = `${sql} ${objectName || ''}`.toUpperCase();
  const match = source.match(/\b(SELECT|INSERT|UPDATE|DELETE|MERGE|EXEC|WITH|CREATE|ALTER|DROP)\b/);
  if (match) {
    return match[1];
  }
  return eventName ? eventName.toUpperCase() : 'UNKNOWN';
}

export function extractTable(sql) {
  const identifier = '((?:\\[[^\\]]+\\]|[\\w]+)(?:\\.(?:\\[[^\\]]+\\]|[\\w]+))?)';
  const patterns = [
    new RegExp(`\\bFROM\\s+${identifier}`, 'i'),
    new RegExp(`\\bUPDATE\\s+${identifier}`, 'i'),
    new RegExp(`\\bINTO\\s+${identifier}`, 'i'),
    new RegExp(`\\bMERGE\\s+${identifier}`, 'i'),
    new RegExp(`\\bJOIN\\s+${identifier}`, 'i')
  ];

  for (const pattern of patterns) {
    const match = sql.match(pattern);
    if (match) {
      return match[1].replace(/\]\.?\[/g, '.').replace(/[\[\]]/g, '');
    }
  }
  return '';
}

export function createSignature(sql, operation, table) {
  if (!sql) {
    return `${operation}|${table}`;
  }

  return `${operation}|${table}|${sql
    .toLowerCase()
    .replace(/'[^']*'/g, '?')
    .replace(/\b\d+\b/g, '?')
    .replace(/@\w+/g, '@param')
    .replace(/\s+/g, ' ')
    .trim()}`;
}

export function severityFromScore(score) {
  if (score >= 70) {
    return 'critical';
  }
  if (score >= 50) {
    return 'high';
  }
  if (score >= 25) {
    return 'medium';
  }
  return 'low';
}

export function severityLabel(severity) {
  if (severity === 'critical') {
    return 'High urgency';
  }
  if (severity === 'high') {
    return 'Needs review';
  }
  if (severity === 'medium') {
    return 'Worth checking';
  }
  return 'Likely OK';
}

export function severityHelp(severity) {
  if (severity === 'critical') {
    return 'This query has multiple warning signals (usually high duration, reads, or repetition). Prioritize this first.';
  }
  if (severity === 'high') {
    return 'This query may be contributing noticeable latency or load. Review execution plan and indexing next.';
  }
  if (severity === 'medium') {
    return 'This query is not the worst offender, but it has one or two traits worth tracking.';
  }
  return 'No strong warning signals from current heuristics. Keep monitoring, but focus on higher-risk rows first.';
}

export function percentile(values, value) {
  if (!values.length) {
    return 0;
  }
  const sorted = values.slice().sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((value / 100) * sorted.length) - 1));
  return sorted[index];
}

export function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function sum(items, field) {
  return items.reduce((total, item) => total + (item[field] || 0), 0);
}

export function formatNumber(value) {
  return new Intl.NumberFormat('en-GB').format(Math.round(value || 0));
}

export function formatMs(value) {
  return `${formatNumber(value)} ms`;
}

export function formatPercent(value) {
  return `${Math.round((value || 0) * 100)}%`;
}

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
