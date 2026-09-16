import React from 'react';

interface RadarData {
  diction: number;
  organization: number;
  opinion: number;
}

interface RadarChartProps {
  data: RadarData;
  size?: number;
}

const RadarChart: React.FC<RadarChartProps> = ({ data, size = 280 }) => {
  const center = size / 2;
  const radius = size * 0.35;
  const maxValue = 5;

  const axes = [
    { label: '词句维度', key: 'diction' as const, angle: -90 },
    { label: '组织维度', key: 'organization' as const, angle: 30 },
    { label: '观点维度', key: 'opinion' as const, angle: 150 },
  ];

  const getPoint = (value: number, angle: number) => {
    const rad = (angle * Math.PI) / 180;
    const r = (value / maxValue) * radius;
    return {
      x: center + r * Math.cos(rad),
      y: center + r * Math.sin(rad),
    };
  };

  const dataPoints = axes.map((axis) => ({
    ...getPoint(data[axis.key], axis.angle),
    value: data[axis.key],
  }));

  const pathData = dataPoints
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
    .join(' ') + ' Z';

  const gridLevels = [1, 2, 3, 4, 5];

  return (
    <div className="radar-chart-container">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Background circles */}
        {gridLevels.map((level) => {
          const points = axes
            .map((axis) => {
              const p = getPoint(level, axis.angle);
              return `${p.x},${p.y}`;
            })
            .join(' ');
          return (
            <polygon
              key={level}
              points={points}
              fill="none"
              stroke="rgba(107, 91, 149, 0.15)"
              strokeWidth="1"
              strokeDasharray="4 4"
            />
          );
        })}

        {/* Axes */}
        {axes.map((axis) => {
          const end = getPoint(maxValue, axis.angle);
          return (
            <line
              key={axis.key}
              x1={center}
              y1={center}
              x2={end.x}
              y2={end.y}
              stroke="rgba(107, 91, 149, 0.2)"
              strokeWidth="1"
            />
          );
        })}

        {/* Data area */}
        <path
          d={pathData}
          fill="rgba(255, 140, 66, 0.2)"
          stroke="#FF8C42"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />

        {/* Data points */}
        {dataPoints.map((p, i) => (
          <g key={i}>
            <circle
              cx={p.x}
              cy={p.y}
              r="6"
              fill="#FF8C42"
              stroke="white"
              strokeWidth="2"
            />
            <circle
              cx={p.x}
              cy={p.y}
              r="10"
              fill="none"
              stroke="#FF8C42"
              strokeWidth="1"
              opacity="0.3"
            >
              <animate
                attributeName="r"
                values="10;14;10"
                dur="2s"
                repeatCount="indefinite"
              />
              <animate
                attributeName="opacity"
                values="0.3;0;0.3"
                dur="2s"
                repeatCount="indefinite"
              />
            </circle>
          </g>
        ))}

        {/* Labels */}
        {axes.map((axis) => {
          const labelPos = getPoint(maxValue + 0.5, axis.angle);
          return (
            <text
              key={axis.key}
              x={labelPos.x}
              y={labelPos.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#2D2A4A"
              fontSize="13"
              fontWeight="600"
            >
              {axis.label}
            </text>
          );
        })}

        {/* Center label */}
        <text
          x={center}
          y={center}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#6B5B95"
          fontSize="11"
          fontWeight="500"
        >
          DOO
        </text>
      </svg>

      {/* Legend */}
      <div className="radar-legend">
        {axes.map((axis) => (
          <div key={axis.key} className="legend-item">
            <span
              className="legend-dot"
              style={{ background: '#FF8C42' }}
            />
            <span className="legend-label">{axis.label}</span>
            <span className="legend-value">{data[axis.key].toFixed(1)}</span>
          </div>
        ))}
      </div>

      <style>{`
        .radar-chart-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
        }

        .radar-legend {
          display: flex;
          gap: 20px;
          justify-content: center;
        }

        .legend-item {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
        }

        .legend-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }

        .legend-label {
          color: var(--text-secondary);
        }

        .legend-value {
          font-weight: 600;
          color: var(--primary);
        }
      `}</style>
    </div>
  );
};

export default RadarChart;
