import { useEffect, useState } from 'react';
import Papa from 'papaparse';

const fmt = (n) =>
  Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// pct = (Actual - Budget) / Budget * 100
// positive → overspend (bad), negative → underspend (good)
function varianceColor(pct) {
  if (pct <= 0) return '#22c55e';           // underspend — always green
  if (pct <= 3)  return '#22c55e';           // within 3% overspend — green
  if (pct <= 5)  return '#f59e0b';           // 3–5% overspend — amber
  return '#ef4444';                          // >5% overspend — red
}

function isRed(pct, threshold) {
  return pct > threshold;                    // overspend exceeds materiality threshold
}

function rowKey(r) {
  return `${r.entity}||${r.function}||${r.costBucket}||${r.category}`;
}

async function fetchNarrative(r) {
  const prompt =
    `You are a Finance Director at a cybersecurity company preparing a management report. ` +
    `Write a concise 1-2 sentence explanation suitable for a CEO. Be specific. ` +
    `Start with the entity name or cost item, not 'The'.\n` +
    `Entity: ${r.entity}, Function: ${r.function}, Cost Bucket: ${r.costBucket}, ` +
    `Category: ${r.category}, Budget USD: ${fmt(r.budget)}, Actual USD: ${fmt(r.actual)}, ` +
    `Variance: ${fmt(r.variancePct)}% unfavourable.\n` +
    `Write the narrative only. No preamble.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.REACT_APP_ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `HTTP ${res.status}`);
  }

  const data = await res.json();
  return data.content?.[0]?.text ?? '';
}

export default function VarianceTable() {
  const [rows, setRows] = useState([]);
  const [entities, setEntities] = useState([]);
  const [selectedEntity, setSelectedEntity] = useState('All');
  const [threshold, setThreshold] = useState(5);
  const [narratives, setNarratives] = useState({});

  useEffect(() => {
    fetch('/data/data.csv')
      .then((r) => r.text())
      .then((text) => {
        const { data } = Papa.parse(text, { header: true, skipEmptyLines: true });
        const clean = data
          .filter((r) => r.Entity && r.Category)
          .map((r) => ({
            entity: r.Entity?.trim(),
            function: r.Function?.trim(),
            costBucket: r.Cost_Bucket?.trim() ?? '',
            category: r.Category?.trim(),
            budget: parseFloat(r.Budget_USD) || 0,
            actual: parseFloat(r.Actual_USD) || 0,
            prior: parseFloat(r.Prior_Period) || 0,
          }))
          .map((r) => ({
            ...r,
            varianceUSD: r.actual - r.budget,
            variancePct: r.budget !== 0 ? ((r.actual - r.budget) / Math.abs(r.budget)) * 100 : 0,
          }));

        setEntities([...new Set(clean.map((r) => r.entity))].sort());
        setRows(clean);
      });
  }, []);

  const filtered = rows.filter((r) => {
    if (selectedEntity !== 'All' && r.entity !== selectedEntity) return false;
    // Underspend rows always pass; only suppress overspend below the threshold
    if (r.variancePct > 0 && r.variancePct <= threshold) return false;
    return true;
  });

  const handleGenerate = async (r) => {
    const key = rowKey(r);
    setNarratives((prev) => ({ ...prev, [key]: { loading: true, text: '', error: '' } }));
    try {
      const text = await fetchNarrative(r);
      setNarratives((prev) => ({ ...prev, [key]: { loading: false, text, error: '' } }));
    } catch (e) {
      setNarratives((prev) => ({ ...prev, [key]: { loading: false, text: '', error: e.message } }));
    }
  };

  const COLS = 9; // data columns + AI column

  return (
    <div style={styles.page}>
      <style>{spinnerCss}</style>
      <h1 style={styles.title}>CFO Copilot — Variance Report</h1>

      <div style={styles.controls}>
        <label style={styles.label}>
          Entity
          <select
            value={selectedEntity}
            onChange={(e) => setSelectedEntity(e.target.value)}
            style={styles.select}
          >
            <option value="All">All Entities</option>
            {entities.map((e) => (
              <option key={e} value={e}>{e}</option>
            ))}
          </select>
        </label>

        <label style={styles.label}>
          Materiality threshold (%)
          <input
            type="number"
            min={0}
            max={100}
            step={0.5}
            value={threshold}
            onChange={(e) => setThreshold(parseFloat(e.target.value) || 0)}
            style={styles.input}
          />
        </label>

        <span style={styles.count}>{filtered.length} rows</span>
      </div>

      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              {[
                'Entity', 'Function', 'Category',
                'Budget USD', 'Actual USD', 'Prior Period USD',
                'Variance %', 'Variance USD', 'AI Narrative',
              ].map((h) => (
                <th key={h} style={styles.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={COLS} style={{ ...styles.td, textAlign: 'center', color: '#6b7280' }}>
                  No rows exceed the materiality threshold.
                </td>
              </tr>
            ) : (
              filtered.flatMap((r, i) => {
                const key = rowKey(r);
                const narr = narratives[key];
                const red = isRed(r.variancePct, threshold);
                const rowStyle = i % 2 === 0 ? styles.rowEven : styles.rowOdd;

                const dataRow = (
                  <tr key={`row-${i}`} style={rowStyle}>
                    <td style={styles.td}>{r.entity}</td>
                    <td style={styles.td}>{r.function}</td>
                    <td style={styles.td}>{r.category}</td>
                    <td style={styles.tdNum}>{fmt(r.budget)}</td>
                    <td style={styles.tdNum}>{fmt(r.actual)}</td>
                    <td style={styles.tdNum}>{fmt(r.prior)}</td>
                    <td style={{ ...styles.tdNum, color: varianceColor(r.variancePct), fontWeight: 600 }}>
                      {fmt(r.variancePct)}%
                    </td>
                    <td style={{ ...styles.tdNum, color: varianceColor(r.variancePct) }}>
                      {fmt(r.varianceUSD)}
                    </td>
                    <td style={{ ...styles.td, textAlign: 'center' }}>
                      {red && (
                        narr?.loading ? (
                          <span className="spinner" />
                        ) : narr?.text ? (
                          <button
                            onClick={() => handleGenerate(r)}
                            style={styles.regenBtn}
                            title="Regenerate"
                          >
                            ↻
                          </button>
                        ) : (
                          <button onClick={() => handleGenerate(r)} style={styles.btn}>
                            Generate Narrative
                          </button>
                        )
                      )}
                    </td>
                  </tr>
                );

                if (!narr || (!narr.text && !narr.error)) return [dataRow];

                const narrativeRow = (
                  <tr key={`narr-${i}`} style={rowStyle}>
                    <td
                      colSpan={COLS}
                      style={narr.error ? styles.narrativeError : styles.narrativeCell}
                    >
                      {narr.error ? (
                        <span style={{ color: '#ef4444' }}>Error: {narr.error}</span>
                      ) : (
                        <>
                          <span style={styles.narrativeLabel}>AI Narrative</span>
                          {narr.text}
                        </>
                      )}
                    </td>
                  </tr>
                );

                return [dataRow, narrativeRow];
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const spinnerCss = `
  @keyframes spin { to { transform: rotate(360deg); } }
  .spinner {
    display: inline-block;
    width: 16px; height: 16px;
    border: 2px solid #1e293b;
    border-top-color: #60a5fa;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
    vertical-align: middle;
  }
`;

const styles = {
  page: {
    backgroundColor: '#0a0f1e',
    minHeight: '100vh',
    padding: '2rem',
    color: '#fff',
    fontFamily: 'system-ui, sans-serif',
  },
  title: {
    fontSize: '1.5rem',
    fontWeight: 700,
    marginBottom: '1.5rem',
    letterSpacing: '0.02em',
  },
  controls: {
    display: 'flex',
    alignItems: 'center',
    gap: '1.5rem',
    marginBottom: '1.5rem',
    flexWrap: 'wrap',
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
    fontSize: '0.8rem',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  select: {
    backgroundColor: '#111827',
    color: '#fff',
    border: '1px solid #1e293b',
    borderRadius: '4px',
    padding: '0.4rem 0.6rem',
    fontSize: '0.9rem',
    cursor: 'pointer',
  },
  input: {
    backgroundColor: '#111827',
    color: '#fff',
    border: '1px solid #1e293b',
    borderRadius: '4px',
    padding: '0.4rem 0.6rem',
    fontSize: '0.9rem',
    width: '80px',
  },
  count: {
    marginLeft: 'auto',
    fontSize: '0.85rem',
    color: '#64748b',
  },
  tableWrap: {
    overflowX: 'auto',
    borderRadius: '8px',
    border: '1px solid #1e293b',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '0.85rem',
  },
  th: {
    backgroundColor: '#0f172a',
    color: '#94a3b8',
    padding: '0.75rem 1rem',
    textAlign: 'left',
    textTransform: 'uppercase',
    fontSize: '0.7rem',
    letterSpacing: '0.08em',
    whiteSpace: 'nowrap',
    borderBottom: '1px solid #1e293b',
  },
  td: {
    padding: '0.6rem 1rem',
    borderBottom: '1px solid #0f172a',
    color: '#e2e8f0',
  },
  tdNum: {
    padding: '0.6rem 1rem',
    borderBottom: '1px solid #0f172a',
    color: '#e2e8f0',
    textAlign: 'right',
    fontFamily: '"Courier New", Courier, monospace',
  },
  rowEven: { backgroundColor: 'transparent' },
  rowOdd: { backgroundColor: '#0d1424' },
  btn: {
    backgroundColor: '#1d4ed8',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    padding: '0.3rem 0.65rem',
    fontSize: '0.75rem',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  regenBtn: {
    backgroundColor: 'transparent',
    color: '#60a5fa',
    border: '1px solid #1e40af',
    borderRadius: '4px',
    padding: '0.2rem 0.5rem',
    fontSize: '0.85rem',
    cursor: 'pointer',
  },
  narrativeCell: {
    padding: '0.75rem 1.25rem',
    borderBottom: '1px solid #1e293b',
    color: '#cbd5e1',
    fontSize: '0.85rem',
    lineHeight: 1.6,
    fontStyle: 'italic',
    backgroundColor: '#0b1120',
  },
  narrativeError: {
    padding: '0.75rem 1.25rem',
    borderBottom: '1px solid #1e293b',
    backgroundColor: '#0b1120',
    fontSize: '0.82rem',
  },
  narrativeLabel: {
    display: 'inline-block',
    marginRight: '0.75rem',
    fontSize: '0.65rem',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: '#60a5fa',
    fontStyle: 'normal',
    fontWeight: 600,
    verticalAlign: 'middle',
  },
};
