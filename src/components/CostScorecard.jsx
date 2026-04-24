import { useEffect, useState } from 'react';
import Papa from 'papaparse';

const BUCKETS = {
  'Sales & Marketing': { label: 'Sales & Marketing', min: 30, max: 45 },
  'Service Delivery':  { label: 'Service Delivery',  min: 30, max: 40 },
  'Administrative':    { label: 'Administrative',     min: 15, max: 25 },
};

// CSV stores "Delivery" — normalise to display name
function normaliseBucket(raw) {
  if (!raw) return null;
  const t = raw.trim();
  if (t === 'Delivery') return 'Service Delivery';
  if (BUCKETS[t]) return t;
  return null;
}

function trendArrow(actualPct, priorPct) {
  const diff = actualPct - priorPct;
  if (Math.abs(diff) < 0.05) return { symbol: '→', color: '#94a3b8' };
  return diff > 0
    ? { symbol: '↑', color: '#ef4444' }  // higher spend % = unfavourable
    : { symbol: '↓', color: '#22c55e' };
}

const SCALE_MAX = 60; // % — covers all benchmark ranges with headroom

function BenchmarkBand({ actualPct, min, max }) {
  const toPos = (v) => `${(v / SCALE_MAX) * 100}%`;
  const isInside = actualPct >= min && actualPct <= max;
  const dotColor = isInside ? '#22c55e' : '#ef4444';
  const dotPos = Math.min(Math.max(actualPct, 0), SCALE_MAX);

  return (
    <div style={band.wrap}>
      {/* tick labels */}
      <div style={band.tickRow}>
        {[0, 15, 30, 45, 60].map((v) => (
          <span key={v} style={{ ...band.tick, left: toPos(v) }}>{v}%</span>
        ))}
      </div>

      {/* track */}
      <div style={band.track}>
        {/* benchmark range highlight */}
        <div
          style={{
            ...band.range,
            left: toPos(min),
            width: `${((max - min) / SCALE_MAX) * 100}%`,
          }}
        />
        {/* actual dot */}
        <div
          style={{
            ...band.dot,
            left: toPos(dotPos),
            backgroundColor: dotColor,
            boxShadow: `0 0 6px ${dotColor}`,
          }}
        />
      </div>

      {/* legend */}
      <div style={band.legend}>
        <span style={{ color: '#475569', fontSize: '0.7rem' }}>
          Benchmark {min}–{max}%
        </span>
        <span style={{ color: dotColor, fontSize: '0.7rem', marginLeft: '0.75rem' }}>
          ● Actual {actualPct.toFixed(1)}%
        </span>
      </div>
    </div>
  );
}

export default function CostScorecard() {
  const [bucketData, setBucketData] = useState(null);

  useEffect(() => {
    fetch('/data/data.csv')
      .then((r) => r.text())
      .then((text) => {
        const { data } = Papa.parse(text, { header: true, skipEmptyLines: true });

        const sums = {};
        Object.keys(BUCKETS).forEach((b) => {
          sums[b] = { actual: 0, budget: 0, prior: 0 };
        });

        data.forEach((row) => {
          const bucket = normaliseBucket(row.Cost_Bucket);
          if (!bucket) return;
          sums[bucket].actual += parseFloat(row.Actual_USD) || 0;
          sums[bucket].budget += parseFloat(row.Budget_USD) || 0;
          sums[bucket].prior  += parseFloat(row.Prior_Period) || 0;
        });

        const totalActual = Object.values(sums).reduce((s, b) => s + b.actual, 0);
        const totalBudget = Object.values(sums).reduce((s, b) => s + b.budget, 0);
        const totalPrior  = Object.values(sums).reduce((s, b) => s + b.prior,  0);

        const enriched = {};
        Object.entries(sums).forEach(([key, val]) => {
          enriched[key] = {
            ...val,
            actualPct: totalActual ? (val.actual / totalActual) * 100 : 0,
            budgetPct: totalBudget ? (val.budget / totalBudget) * 100 : 0,
            priorPct:  totalPrior  ? (val.prior  / totalPrior)  * 100 : 0,
          };
        });

        setBucketData(enriched);
      });
  }, []);

  if (!bucketData) {
    return (
      <div style={{ ...card.page, paddingBottom: 0 }}>
        <h2 style={card.heading}>Cost Structure Scorecard</h2>
        <p style={{ color: '#475569', fontSize: '0.85rem' }}>Loading…</p>
      </div>
    );
  }

  return (
    <div style={card.page}>
      <h2 style={card.heading}>Cost Structure Scorecard</h2>
      <p style={card.sub}>Series B investor benchmarks · All entities · Current period</p>

      <div style={card.grid}>
        {Object.entries(BUCKETS).map(([key, cfg]) => {
          const d = bucketData[key];
          const { symbol, color: arrowColor } = trendArrow(d.actualPct, d.priorPct);
          const isInside = d.actualPct >= cfg.min && d.actualPct <= cfg.max;

          return (
            <div key={key} style={card.tile}>
              <div style={card.tileHeader}>
                <span style={card.tileTitle}>{cfg.label}</span>
                <span style={{ color: arrowColor, fontSize: '1.25rem', lineHeight: 1 }}>
                  {symbol}
                </span>
              </div>

              {/* KPI row */}
              <div style={card.kpiRow}>
                <div style={card.kpi}>
                  <span style={card.kpiLabel}>Actual</span>
                  <span style={{ ...card.kpiValue, color: isInside ? '#22c55e' : '#ef4444' }}>
                    {d.actualPct.toFixed(1)}%
                  </span>
                </div>
                <div style={card.kpi}>
                  <span style={card.kpiLabel}>Budget</span>
                  <span style={card.kpiValue}>{d.budgetPct.toFixed(1)}%</span>
                </div>
                <div style={card.kpi}>
                  <span style={card.kpiLabel}>Prior Period</span>
                  <span style={card.kpiValue}>{d.priorPct.toFixed(1)}%</span>
                </div>
              </div>

              <BenchmarkBand
                actualPct={d.actualPct}
                min={cfg.min}
                max={cfg.max}
              />

              <div style={{ ...card.badge, ...(isInside ? card.badgeGreen : card.badgeRed) }}>
                {isInside
                  ? '✓  Within Series B benchmark'
                  : '⚠  Outside benchmark — requires investor explanation'}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const card = {
  page: {
    backgroundColor: '#0a0f1e',
    padding: '2rem 2rem 1rem',
    color: '#fff',
    fontFamily: 'system-ui, sans-serif',
  },
  heading: {
    fontSize: '1.25rem',
    fontWeight: 700,
    margin: '0 0 0.25rem',
    letterSpacing: '0.02em',
  },
  sub: {
    fontSize: '0.78rem',
    color: '#475569',
    margin: '0 0 1.5rem',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: '1rem',
  },
  tile: {
    backgroundColor: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: '8px',
    padding: '1.25rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  tileHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tileTitle: {
    fontWeight: 600,
    fontSize: '0.95rem',
    color: '#e2e8f0',
  },
  kpiRow: {
    display: 'flex',
    gap: '0.5rem',
  },
  kpi: {
    flex: 1,
    backgroundColor: '#0a0f1e',
    borderRadius: '6px',
    padding: '0.5rem 0.6rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.2rem',
  },
  kpiLabel: {
    fontSize: '0.65rem',
    textTransform: 'uppercase',
    letterSpacing: '0.07em',
    color: '#475569',
  },
  kpiValue: {
    fontSize: '1.1rem',
    fontWeight: 700,
    color: '#e2e8f0',
    fontFamily: '"Courier New", Courier, monospace',
  },
  badge: {
    fontSize: '0.72rem',
    borderRadius: '4px',
    padding: '0.35rem 0.6rem',
    fontWeight: 500,
    letterSpacing: '0.02em',
  },
  badgeGreen: {
    backgroundColor: '#052e16',
    color: '#4ade80',
    border: '1px solid #14532d',
  },
  badgeRed: {
    backgroundColor: '#2d0a0a',
    color: '#f87171',
    border: '1px solid #7f1d1d',
  },
};

const band = {
  wrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.35rem',
  },
  tickRow: {
    position: 'relative',
    height: '14px',
  },
  tick: {
    position: 'absolute',
    transform: 'translateX(-50%)',
    fontSize: '0.6rem',
    color: '#334155',
  },
  track: {
    position: 'relative',
    height: '8px',
    backgroundColor: '#1e293b',
    borderRadius: '4px',
  },
  range: {
    position: 'absolute',
    top: 0,
    height: '100%',
    backgroundColor: '#1e40af44',
    border: '1px solid #1d4ed8',
    borderRadius: '3px',
  },
  dot: {
    position: 'absolute',
    top: '50%',
    width: '12px',
    height: '12px',
    borderRadius: '50%',
    transform: 'translate(-50%, -50%)',
    border: '2px solid #0f172a',
  },
  legend: {
    display: 'flex',
    alignItems: 'center',
  },
};
