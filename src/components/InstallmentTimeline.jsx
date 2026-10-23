import React, { useState, useEffect, useRef, useMemo } from "react";
import { Info, CheckCircle2 } from "lucide-react";

/**
 * Format currency helper in INR format
 */
const formatINR = (value) => {
  if (value === undefined || value === null || isNaN(Number(value))) return "₹0";
  return `₹${Math.round(Number(value)).toLocaleString("en-IN")}`;
};

/**
 * InstallmentTimeline Component
 *
 * Requirements:
 * 1. Installment Circle:
 *    - Keep the installment number clearly displayed inside each circle.
 *    - For completed installments, retain the green circle and green connecting line.
 *    - Remove the incorrect "undefined PAID" text completely.
 *    - Never display "undefined", "null", or any misleading fallback text.
 *    - Amount above each installment, completion percentage below it using actual data.
 * 2. Loan Completion Indicator:
 *    - When all installments are fully paid and the loan is considered completed:
 *      display a small, attractive completion indicator near the end of the timeline.
 *    - Label: "Loan Journey Completed" with a green CheckCircle2 icon.
 *    - Subtle green background, green text, rounded corners.
 *    - Compact, professional, positioned without overlapping installment markers, amounts, percentages, or lines.
 * 3. Completion Logic:
 *    - Shown only when ALL installments are genuinely completed (paidCount === totalCount and balance <= 0).
 *    - Incomplete loans never display the completion indicator.
 * 4. Zero Popups, Zero Flickering:
 *    - No tooltips, modals, or hover-triggered state updates.
 */
export default function InstallmentTimeline({
  schedule = [],
  loanPayments = [],
  effectiveLoanId = "LN-001",
  isLoanCompleted = false,
  isMidwayClosed = false,
  isForeclosed = false,
}) {
  const containerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(900);

  // Measure actual container width to dynamically calculate colsPerRow
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (let entry of entries) {
        if (entry.contentRect.width > 0) {
          setContainerWidth(entry.contentRect.width);
        }
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Determine colsPerRow based on available container width
  const colsPerRow = useMemo(() => {
    if (containerWidth >= 1050) return 6;
    if (containerWidth >= 820) return 5;
    if (containerWidth >= 620) return 4;
    if (containerWidth >= 440) return 3;
    return 2;
  }, [containerWidth]);

  // Geometry configuration
  const paddingX = colsPerRow <= 2 ? 36 : colsPerRow <= 3 ? 48 : 60;
  const rowHeight = colsPerRow <= 3 ? 130 : 140;
  const markerRadius = colsPerRow <= 3 ? 21 : 23;

  // Calculate coordinates and exact completion percentage for every installment marker
  const markerPoints = useMemo(() => {
    if (!schedule.length) return [];
    const availableW = Math.max(containerWidth - paddingX * 2, 200);
    const colStep = colsPerRow > 1 ? availableW / (colsPerRow - 1) : availableW;

    return schedule.map((inst, idx) => {
      const rowIndex = Math.floor(idx / colsPerRow);
      const colIndexInRow = idx % colsPerRow;
      const isLtr = rowIndex % 2 === 0;

      const colPos = isLtr ? colIndexInRow : colsPerRow - 1 - colIndexInRow;
      const cx = paddingX + colPos * colStep;
      const cy = 48 + rowIndex * rowHeight;

      // Ensure a valid installment number (1-based index fallback if missing)
      const installmentNum =
        inst.installmentNumber !== undefined && inst.installmentNumber !== null
          ? inst.installmentNumber
          : idx + 1;

      // Calculate actual completion percentage:
      // Installment completion % = (Eligible amount paid ÷ Installment amount) × 100
      const emiAmt = Number(inst.emi || 0);
      const paidAmt = Number(inst.amountPaid || 0);
      let completionPct = 0;

      if (inst.status === "Paid" || inst.status === "Collected") {
        completionPct = 100;
      } else if (emiAmt > 0 && paidAmt > 0) {
        completionPct = Math.min(100, Math.max(0, Math.round((paidAmt / emiAmt) * 100)));
      } else {
        completionPct = 0;
      }

      return {
        ...inst,
        installmentNumber: installmentNum,
        index: idx,
        rowIndex,
        colIndexInRow,
        isLtr,
        cx,
        cy,
        completionPct,
      };
    });
  }, [schedule, colsPerRow, containerWidth, paddingX, rowHeight]);

  // Determine if the loan is genuinely 100% completed
  const loanJourneyFinished = useMemo(() => {
    if (!markerPoints.length) return false;
    // Check if every single installment is paid / cleared
    const allInstallmentsPaid = markerPoints.every(
      (m) =>
        m.status === "Paid" ||
        m.status === "Collected" ||
        m.completionPct === 100 ||
        (m.balance !== undefined && m.balance <= 0.01)
    );
    return isLoanCompleted || allInstallmentsPaid;
  }, [markerPoints, isLoanCompleted]);

  const totalRows = markerPoints.length > 0 ? Math.floor((markerPoints.length - 1) / colsPerRow) + 1 : 1;
  const svgHeight = 48 + totalRows * rowHeight + 40;

  // Find money progress point along path (driven by real payment data)
  const moneyProgress = useMemo(() => {
    if (!markerPoints.length) return null;

    let lastPaidIdx = -1;
    let partialIdx = -1;
    let partialRatio = 0;

    for (let i = 0; i < markerPoints.length; i++) {
      const st = markerPoints[i].status;
      if (st === "Paid" || st === "Collected" || markerPoints[i].completionPct === 100) {
        lastPaidIdx = i;
      } else if (st === "Partial" || markerPoints[i].completionPct > 0) {
        partialIdx = i;
        const paid = Number(markerPoints[i].amountPaid || 0);
        const emi = Number(markerPoints[i].emi || 1);
        partialRatio = Math.max(0.15, Math.min(0.85, paid / emi));
        break;
      } else {
        break;
      }
    }

    if (partialIdx !== -1) {
      const pPrev = partialIdx > 0 ? markerPoints[partialIdx - 1] : null;
      const pCurr = markerPoints[partialIdx];

      if (pPrev && pPrev.rowIndex === pCurr.rowIndex) {
        const cx = pPrev.cx + (pCurr.cx - pPrev.cx) * partialRatio;
        const cy = pPrev.cy;
        return { cx, cy };
      } else if (pPrev) {
        const cx = pPrev.cx + (pCurr.cx - pPrev.cx) * partialRatio;
        const cy = pPrev.cy + (pCurr.cy - pPrev.cy) * partialRatio;
        return { cx, cy };
      } else {
        const cx = pCurr.cx - (markerRadius + 8) * (1 - partialRatio);
        const cy = pCurr.cy;
        return { cx, cy };
      }
    } else if (lastPaidIdx >= 0) {
      const p = markerPoints[lastPaidIdx];
      return { cx: p.cx, cy: p.cy };
    }

    const p0 = markerPoints[0];
    return { cx: p0.cx, cy: p0.cy };
  }, [markerPoints, markerRadius]);

  // Generate SVG path string connecting all markers
  const { fullPathD, paidPathD } = useMemo(() => {
    if (markerPoints.length < 2) return { fullPathD: "", paidPathD: "" };

    const buildPathForPoints = (points) => {
      let d = "";
      for (let i = 0; i < points.length; i++) {
        const curr = points[i];
        if (i === 0) {
          d += `M ${curr.cx} ${curr.cy}`;
          continue;
        }

        const prev = points[i - 1];

        if (curr.rowIndex === prev.rowIndex) {
          d += ` L ${curr.cx} ${curr.cy}`;
        } else {
          const curveSpread = Math.min(38, (curr.cy - prev.cy) / 2);
          const bendX = prev.isLtr
            ? Math.max(prev.cx, curr.cx) + curveSpread
            : Math.min(prev.cx, curr.cx) - curveSpread;

          d += ` C ${bendX} ${prev.cy}, ${bendX} ${curr.cy}, ${curr.cx} ${curr.cy}`;
        }
      }
      return d;
    };

    const fullD = buildPathForPoints(markerPoints);

    let paidUpToIdx = -1;
    for (let i = 0; i < markerPoints.length; i++) {
      if (
        markerPoints[i].status === "Paid" ||
        markerPoints[i].status === "Collected" ||
        markerPoints[i].completionPct === 100 ||
        (isMidwayClosed && (markerPoints[i].isMidwayClosed || markerPoints[i].status === "Midway Closed"))
      ) {
        paidUpToIdx = i;
      } else {
        break;
      }
    }

    let paidD = "";
    if (paidUpToIdx >= 1) {
      paidD = buildPathForPoints(markerPoints.slice(0, paidUpToIdx + 1));
    }

    return { fullPathD: fullD, paidPathD: paidD };
  }, [markerPoints, isMidwayClosed]);

  if (!schedule || schedule.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200/90 p-8 text-center">
        <Info className="h-8 w-8 text-slate-400 mx-auto mb-2" />
        <h3 className="text-base font-bold text-slate-800">No Repayment Installments</h3>
        <p className="text-xs text-slate-500 mt-1">
          Installment timeline cannot be rendered because this loan does not have scheduled installments.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* =========================================================
          ZIGZAG SNAKE TIMELINE CANVAS (STABLE, ZERO FLICKERING)
      ========================================================= */}
      <div
        ref={containerRef}
        className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-6 shadow-2xs relative overflow-hidden select-none"
      >
        <div className="relative w-full overflow-x-auto no-scrollbar" style={{ minHeight: svgHeight }}>
          <svg
            className="w-full h-auto block"
            style={{ minWidth: 320, height: svgHeight }}
            viewBox={`0 0 ${containerWidth} ${svgHeight}`}
          >
            <defs>
              <linearGradient id="coinGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#FBBF24" />
                <stop offset="50%" stopColor="#F59E0B" />
                <stop offset="100%" stopColor="#D97706" />
              </linearGradient>

              <filter id="markerShadow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="1.5" stdDeviation="2" floodColor="#0F172A" floodOpacity="0.08" />
              </filter>
              <filter id="coinShadow" x="-30%" y="-30%" width="160%" height="160%">
                <feDropShadow dx="0" dy="2" stdDeviation="2.5" floodColor="#D97706" floodOpacity="0.25" />
              </filter>
            </defs>

            {/* 1. Base Connecting Path (Grey neutral track for full snake) */}
            {fullPathD && (
              <path
                d={fullPathD}
                fill="none"
                stroke="#E2E8F0"
                strokeWidth={colsPerRow <= 3 ? 5 : 6}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* 2. Paid Connecting Path (Emerald Green completed segment, or Orange/Amber if Midway Closed) */}
            {paidPathD && (
              <path
                d={paidPathD}
                fill="none"
                stroke={isMidwayClosed ? "#EA580C" : "#047857"}
                strokeWidth={colsPerRow <= 3 ? 5 : 6}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* 3. Partial Progress Segment (Amber dashed line, suppressed for Midway Closed loans) */}
            {!isMidwayClosed && (() => {
              const partialPoint = markerPoints.find((m) => m.status === "Partial" || (m.completionPct > 0 && m.completionPct < 100));
              if (!partialPoint) return null;
              const prevPoint = partialPoint.index > 0 ? markerPoints[partialPoint.index - 1] : null;

              if (prevPoint && prevPoint.rowIndex === partialPoint.rowIndex) {
                const ratio = Math.max(0.15, Math.min(0.85, Number(partialPoint.amountPaid || 0) / Number(partialPoint.emi || 1)));
                const endX = prevPoint.cx + (partialPoint.cx - prevPoint.cx) * ratio;
                return (
                  <line
                    x1={prevPoint.cx}
                    y1={prevPoint.cy}
                    x2={endX}
                    y2={partialPoint.cy}
                    stroke="#F59E0B"
                    strokeWidth={colsPerRow <= 3 ? 5 : 6}
                    strokeLinecap="round"
                    strokeDasharray="4 3"
                  />
                );
              }
              return null;
            })()}

            {/* 4. Directional Row Arrows */}
            {Array.from({ length: totalRows }).map((_, rIdx) => {
              const isLtr = rIdx % 2 === 0;
              const rowY = 48 + rIdx * rowHeight;
              const arrowX = isLtr ? containerWidth - paddingX + 18 : paddingX - 18;
              return (
                <text
                  key={`arrow-${rIdx}`}
                  x={arrowX}
                  y={rowY + 4}
                  textAnchor="middle"
                  fill="#94A3B8"
                  fontSize="12"
                  fontWeight="bold"
                >
                  {isLtr ? "→" : "←"}
                </text>
              );
            })}

            {/* 5. Render Installment Markers with Inline Completion Percentage */}
            {markerPoints.map((item) => {
              const isMidwayItem = isMidwayClosed && (item.isMidwayClosed || item.status === "Midway Closed");
              const isPaid = !isMidwayItem && (item.status === "Paid" || item.status === "Collected" || item.completionPct === 100);
              const isForeclosedItem = isForeclosed && !isPaid && !isMidwayItem;
              const isPartial = !isPaid && !isMidwayItem && !isForeclosedItem && (item.status === "Partial" || item.completionPct > 0);
              const isOverdue = !isPaid && !isPartial && !isMidwayItem && !isForeclosedItem && item.status === "Overdue";

              let circleFill = "#FFFFFF";
              let circleStroke = "#CBD5E1";
              let numberColor = "#475569";
              let badgeBg = "#F1F5F9";
              let badgeText = "#64748B";

              if (isMidwayItem) {
                circleFill = "#FFF7ED";
                circleStroke = "#EA580C";
                numberColor = "#C2410C";
                badgeBg = "#FFEDD5";
                badgeText = "#C2410C";
              } else if (isForeclosedItem) {
                circleFill = "#FAF5FF";
                circleStroke = "#A855F7";
                numberColor = "#7E22CE";
                badgeBg = "#F3E8FF";
                badgeText = "#7E22CE";
              } else if (isPaid) {
                circleFill = "#047857";
                circleStroke = "#065F46";
                numberColor = "#FFFFFF";
                badgeBg = "#ECFDF5";
                badgeText = "#047857";
              } else if (isPartial) {
                circleFill = "#FFFBEB";
                circleStroke = "#F59E0B";
                numberColor = "#B45309";
                badgeBg = "#FEF3C7";
                badgeText = "#B45309";
              } else if (isOverdue) {
                circleFill = "#FFF1F2";
                circleStroke = "#E11D48";
                numberColor = "#BE123C";
                badgeBg = "#FFE4E6";
                badgeText = "#BE123C";
              }

              // Text for completion status: e.g. "100% Completed", "Midway Closed", "Foreclosed"
              const completionLabel = isMidwayItem
                ? "Midway Closed"
                : isForeclosedItem
                ? "Foreclosed"
                : `${item.completionPct}% Completed`;

              return (
                <g key={`inst-marker-${item.installmentNumber}`}>
                  {/* Marker Circle Base */}
                  <circle
                    cx={item.cx}
                    cy={item.cy}
                    r={markerRadius}
                    fill={circleFill}
                    stroke={circleStroke}
                    strokeWidth={isPaid || isPartial || isOverdue || isMidwayItem || isForeclosedItem ? 3 : 2}
                    filter="url(#markerShadow)"
                  />

                  {/* Marker Center Display: Installment Number clearly displayed */}
                  {isMidwayItem ? (
                    <>
                      <text
                        x={item.cx}
                        y={item.cy - 1}
                        textAnchor="middle"
                        fill="#C2410C"
                        fontSize={colsPerRow <= 3 ? "10" : "11"}
                        fontWeight="800"
                        fontFamily="inherit"
                      >
                        #{item.installmentNumber}
                      </text>
                      <text
                        x={item.cx}
                        y={item.cy + 10}
                        textAnchor="middle"
                        fill="#EA580C"
                        fontSize="7"
                        fontWeight="bold"
                      >
                        CLOSED
                      </text>
                    </>
                  ) : isForeclosedItem ? (
                    <>
                      <text
                        x={item.cx}
                        y={item.cy - 1}
                        textAnchor="middle"
                        fill="#7E22CE"
                        fontSize={colsPerRow <= 3 ? "10" : "11"}
                        fontWeight="800"
                        fontFamily="inherit"
                      >
                        #{item.installmentNumber}
                      </text>
                      <text
                        x={item.cx}
                        y={item.cy + 10}
                        textAnchor="middle"
                        fill="#A855F7"
                        fontSize="7"
                        fontWeight="bold"
                      >
                        SETTLED
                      </text>
                    </>
                  ) : isPaid ? (
                    <>
                      <text
                        x={item.cx}
                        y={item.cy - 2}
                        textAnchor="middle"
                        fill="#FFFFFF"
                        fontSize={colsPerRow <= 3 ? "10" : "11"}
                        fontWeight="800"
                        fontFamily="inherit"
                      >
                        #{item.installmentNumber}
                      </text>
                      <text
                        x={item.cx}
                        y={item.cy + 10}
                        textAnchor="middle"
                        fill="#D1FAE5"
                        fontSize="9"
                        fontWeight="bold"
                      >
                        ✓
                      </text>
                    </>
                  ) : isPartial ? (
                    <>
                      <text
                        x={item.cx}
                        y={item.cy - 1}
                        textAnchor="middle"
                        fill={numberColor}
                        fontSize={colsPerRow <= 3 ? "11" : "12"}
                        fontWeight="800"
                        fontFamily="inherit"
                      >
                        #{item.installmentNumber}
                      </text>
                      <circle cx={item.cx} cy={item.cy + 10} r="2.5" fill="#F59E0B" />
                    </>
                  ) : (
                    <text
                      x={item.cx}
                      y={item.cy + 4}
                      textAnchor="middle"
                      fill={numberColor}
                      fontSize={colsPerRow <= 3 ? "11" : "12"}
                      fontWeight="700"
                      fontFamily="inherit"
                    >
                      #{item.installmentNumber}
                    </text>
                  )}

                  {/* Top Label: Installment EMI Amount */}
                  <text
                    x={item.cx}
                    y={item.cy - markerRadius - 8}
                    textAnchor="middle"
                    fill="#0F172A"
                    fontSize="10"
                    fontWeight="700"
                  >
                    {formatINR(item.emi)}
                  </text>

                  {/* Bottom Directly Visible Completion Percentage Badge */}
                  <rect
                    x={item.cx - 44}
                    y={item.cy + markerRadius + 10}
                    width="88"
                    height="18"
                    rx="9"
                    fill={badgeBg}
                    stroke={isMidwayItem ? "#FED7AA" : isPaid ? "#A7F3D0" : isPartial ? "#FDE68A" : isOverdue ? "#FECDD3" : "#E2E8F0"}
                    strokeWidth="1"
                  />
                  <text
                    x={item.cx}
                    y={item.cy + markerRadius + 22.5}
                    textAnchor="middle"
                    fill={badgeText}
                    fontSize="8.5"
                    fontWeight="800"
                    letterSpacing="0.02em"
                  >
                    {completionLabel}
                  </text>
                </g>
              );
            })}

            {/* 6. Money-Based Progress Indicator (Golden Coin with Rupee Icon along zigzag path) */}
            {/* Displayed cleanly without any text labels or undefined flags; Suppressed for Midway Closed loans */}
            {!isMidwayClosed && !loanJourneyFinished && moneyProgress && (
              <g
                className="select-none"
                style={{
                  transform: `translate(${moneyProgress.cx}px, ${moneyProgress.cy}px)`,
                }}
              >
                <circle
                  cx="0"
                  cy="0"
                  r={colsPerRow <= 3 ? 14 : 16}
                  fill="url(#coinGrad)"
                  stroke="#FFFFFF"
                  strokeWidth="2.5"
                  filter="url(#coinShadow)"
                />
                <circle
                  cx="0"
                  cy="0"
                  r={colsPerRow <= 3 ? 10.5 : 12}
                  fill="none"
                  stroke="#FEF3C7"
                  strokeWidth="1"
                  strokeDasharray="2 1"
                />
                <text
                  x="0"
                  y={colsPerRow <= 3 ? 4 : 5}
                  textAnchor="middle"
                  fill="#78350F"
                  fontSize={colsPerRow <= 3 ? "11" : "12"}
                  fontWeight="900"
                  fontFamily="sans-serif"
                >
                  ₹
                </text>
              </g>
            )}
          </svg>
        </div>

        {/* =========================================================
            7. LOAN COMPLETION / TERMINAL INDICATOR
            (Midway Closed displays orange/amber terminal indicator; Finished active loans display green)
        ========================================================= */}
        {isMidwayClosed ? (
          <div className="mt-4 pt-3 border-t border-amber-100 flex items-center justify-end">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-50 border border-amber-300 text-amber-800 text-xs font-bold shadow-2xs">
              <CheckCircle2 className="h-4 w-4 text-amber-600" />
              <span>Midway Closed</span>
            </div>
          </div>
        ) : loanJourneyFinished ? (
          <div className="mt-4 pt-3 border-t border-emerald-100 flex items-center justify-end">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold shadow-2xs">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span>Loan Journey Completed</span>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
