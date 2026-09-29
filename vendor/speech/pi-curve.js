// Copied verbatim from speech-testing-simulator/index.html (fitLogistic, buildPICurve) so the
// case-maker preview draws exactly the curve students will see. Do not edit here; re-copy.
// tests.html checks these functions still match the simulator.

function fitLogistic(dataPoints, piMax) {
  // Fit y = piMax / (1 + exp(-k*(x - L50))) to data points (least squares)
  if (!dataPoints || dataPoints.length === 0) {
    return { L50: 50, k: 0.2 };
  }
  let bestL50 = 50, bestK = 0.2, bestErr = Infinity;
  for (let L50 = -10; L50 <= 100; L50 += 0.5) {
    for (let k = 0.05; k <= 1.5; k += 0.05) {
      let err = 0;
      for (const {level, score} of dataPoints) {
        const pred = piMax / (1 + Math.exp(-k * (level - L50)));
        err += (pred - score) ** 2;
      }
      if (err < bestErr) { bestErr = err; bestL50 = L50; bestK = k; }
    }
  }
  return { L50: bestL50, k: bestK };
}

function buildPICurve(earData) {
  const { dataPoints, piMax, score90, bestAC } = earData;
  const validPts = (dataPoints || []).filter(p => p.level != null && p.score != null && p.level !== '' && p.score !== '');
  const acFloor = (bestAC != null && bestAC !== '') ? parseFloat(bestAC) : null;

  if (validPts.length === 0) {
    return (level) => (acFloor != null && level < acFloor) ? 0 : (level >= 40 ? piMax : 0);
  }

  const { L50, k } = fitLogistic(validPts, piMax);

  // peakLevel: where the logistic reaches ~99% of piMax
  const peakLevel = L50 + Math.log(99) / k;

  // Value the logistic reaches at peakLevel (used as rollover start to avoid discontinuity)
  const ascAtPeak = piMax / (1 + Math.exp(-k * (peakLevel - L50)));

  return function(level) {
    if (acFloor != null && level < acFloor) return 0;

    // Ascending logistic
    const asc = piMax / (1 + Math.exp(-k * (level - L50)));
    const cappedAsc = Math.min(asc, piMax);

    // Rollover: if score90 < piMax, linearly roll over after peakLevel toward (90, score90)
    if (score90 < piMax && level > peakLevel && peakLevel < 90) {
      if (level >= 90) return score90;
      const frac = (level - peakLevel) / (90 - peakLevel);
      const rolled = ascAtPeak - (ascAtPeak - score90) * frac;
      return Math.max(score90, rolled);
    }
    return cappedAsc;
  };
}

export { fitLogistic, buildPICurve };
