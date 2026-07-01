/**
 * ANTIGRAVITY Clustering Smart Support & Resistance Engine
 * v2 — fixes cross-TF zone stacking and merge-skip logic.
 */

export const Config = {
  lookbackLimit: 200,
  N_MAP: { '1m': 12, '5m': 10, '15m': 8, '1h': 6, '4h': 4, 'default': 5 },
  atrPeriod: 14,
  minRangeAtrMultiple: 0.5,
  wickRatioMax: 0.70,
  proximityPct: 0.003,
  boundaryPaddingPct: 0.0008,   // was 0.0015 — tighter padding so zone borders don't bloat
  confluenceProximityPct: 0.005,
  zoneLockThresholdPct: 0.01,
  volumeSpikeThreshold: 1.5,
  pruneScoreThreshold: 15,
  pruneCandlesThreshold: 300,
  maxZoneSpanAtrMultiple: 1.0,  // was 2.0 — cap zone height at 1x ATR (~$356 on BTC)
  maxMergeSpanAtrMultiple: 2.0, // was 3.0 — tighter merge ceiling stops wide red blocks
};

export class SRZoneEngine {
  static calculateZones(mtfCandles, symbol, existingZones = [], currentPrice = 0) {
    const allTfZones = {};
    const tfs = Object.keys(mtfCandles);

    for (const tf of tfs) {
      const candles = mtfCandles[tf];
      if (!candles || candles.length < Config.lookbackLimit) continue;

      const atr = this.calculateATR(candles, Config.atrPeriod);
      const pivots = this.detectPivots(candles, tf, atr);
      const tfClusters = this.clusterPivots(pivots, candles, atr);
      allTfZones[tf] = tfClusters;
    }

    let combinedZones = [];
    for (const tf of tfs) {
      if (allTfZones[tf]) combinedZones = combinedZones.concat(allTfZones[tf]);
    }

    // ─── FIX A: deduplicate cross-TF zones before confluence scoring ───
    combinedZones = this.deduplicateZones(combinedZones);
    this.calculateConfluences(combinedZones);

    // Demote stale cached zones that were scored under the old saturated system
    // so they don't bypass the proximity prune with artificially high scores.
    for (const ez of existingZones) {
      if (ez.score >= 100) ez.score = 75;
    }

    const finalizedZones = this.applyAntiRepaintLogic(combinedZones, existingZones, currentPrice, mtfCandles);

    // ─── ATR proximity prune (runs AFTER anti-repaint) ────────────────
    // Cache-resurrected zones are included here so nothing escapes the guard.
    const pruned = this.pruneByAtrProximity(finalizedZones, mtfCandles);
    pruned.sort((a, b) => b.score - a.score);
    return pruned.slice(0, 12);
  }

  // ─────────────────────────────────────────────────────────────────────
  // FIX A: merge zones whose price centres are within confluenceProximityPct
  //         of each other into a single representative zone (highest score wins),
  //         combining their timeframe lists.
  // ─────────────────────────────────────────────────────────────────────
  static deduplicateZones(zones) {
    if (zones.length === 0) return zones;

    // Sort by price so we only need one forward pass
    zones.sort((a, b) => a.price - b.price);

    const deduplicated = [];
    const consumed = new Uint8Array(zones.length); // 0 = available, 1 = merged into another

    for (let i = 0; i < zones.length; i++) {
      if (consumed[i]) continue;

      const base = { ...zones[i], timeframes: [...zones[i].timeframes] };

      for (let j = i + 1; j < zones.length; j++) {
        if (consumed[j]) continue;

        const priceDiff = Math.abs(zones[j].price - base.price) / base.price;
        if (priceDiff > Config.confluenceProximityPct) break; // sorted → no more matches

        // Merge j into base: keep the higher-scoring zone's bounds & pivots,
        // union the timeframes, and take the max score.
        if (zones[j].score > base.score) {
          base.price = zones[j].price;
          base.low = zones[j].low;
          base.high = zones[j].high;
          base.pivots = zones[j].pivots;
          base.score = zones[j].score;
          base.touchCount = zones[j].touchCount;
        }
        // Always union timeframes
        zones[j].timeframes.forEach(tf => {
          if (!base.timeframes.includes(tf)) base.timeframes.push(tf);
        });
        base.isConfluence = base.timeframes.length >= 2;
        consumed[j] = 1;
      }

      deduplicated.push(base);
    }

    return deduplicated;
  }

  static detectPivots(candles, tf, atr) {
    const n = candles.length;
    const N = Config.N_MAP[tf] || Config.N_MAP['default'];
    const pivots = [];
    const atrArray = atr || this.calculateATR(candles, Config.atrPeriod);

    for (let i = N; i < n - N; i++) {
      const c = candles[i];
      const range = c.h - c.l;
      if (range <= 0) continue;

      const currentAtr = atrArray[i] || (c.c * 0.015);
      if (range < Config.minRangeAtrMultiple * currentAtr) continue;

      let isHigh = true;
      for (let j = 1; j <= N; j++) {
        if (candles[i - j].h >= c.h || candles[i + j].h > c.h) { isHigh = false; break; }
      }
      if (isHigh) {
        const highWick = c.h - Math.max(c.o, c.c);
        if (highWick / range <= Config.wickRatioMax) {
          pivots.push({
            price: c.h, timestamp: c.t, type: 'high', volume: c.v,
            candleBody: { open: c.o, close: c.c, high: c.h, low: c.l }, tf, index: i
          });
        }
      }

      let isLow = true;
      for (let j = 1; j <= N; j++) {
        if (candles[i - j].l <= c.l || candles[i + j].l < c.l) { isLow = false; break; }
      }
      if (isLow) {
        const lowWick = Math.min(c.o, c.c) - c.l;
        if (lowWick / range <= Config.wickRatioMax) {
          pivots.push({
            price: c.l, timestamp: c.t, type: 'low', volume: c.v,
            candleBody: { open: c.o, close: c.c, high: c.h, low: c.l }, tf, index: i
          });
        }
      }
    }
    return pivots;
  }

  static clusterPivots(pivots, candles, atr) {
    if (pivots.length === 0) return [];
    pivots.sort((a, b) => a.price - b.price);

    const clusters = [];
    let currentCluster = [pivots[0]];

    for (let i = 1; i < pivots.length; i++) {
      const p = pivots[i];
      const refPivot = currentCluster[currentCluster.length - 1]; // compare to last
      if ((p.price - refPivot.price) / refPivot.price <= Config.proximityPct) {
        currentCluster.push(p);
      } else {
        clusters.push(currentCluster);
        currentCluster = [p];
      }
    }
    clusters.push(currentCluster);

    let zones = clusters.map(cluster => this.createZoneFromCluster(cluster, candles, atr));
    zones = this.mergeOverlappingZones(zones, candles, atr);
    return zones;
  }

  static createZoneFromCluster(cluster, candles, atr) {
    const prices = cluster.map(p => p.price);
    const lowest = Math.min(...prices);
    const highest = Math.max(...prices);

    const totalVolume = cluster.reduce((sum, p) => sum + p.volume, 0) || 1;
    const gravityCenter = cluster.reduce((sum, p) => sum + p.price * p.volume, 0) / totalVolume;

    let low = lowest * (1 - Config.boundaryPaddingPct);
    let high = highest * (1 + Config.boundaryPaddingPct);

    if (atr && atr.length > 0) {
      const currentAtr = atr[atr.length - 1];
      const maxSpan = Config.maxZoneSpanAtrMultiple * currentAtr;
      if ((high - low) > maxSpan) {
        low = gravityCenter - maxSpan / 2;
        high = gravityCenter + maxSpan / 2;
      }
    }

    const lowsCount = cluster.filter(p => p.type === 'low').length;
    const highsCount = cluster.filter(p => p.type === 'high').length;
    const type = (lowsCount > 0 && highsCount > 0) ? 'role_reversal'
      : (lowsCount > highsCount ? 'support' : 'resistance');

    const tf = cluster[0].tf;
    const zone = {
      id: `${tf}_${Math.round(gravityCenter)}_${cluster[0].timestamp}`,
      price: gravityCenter, low, high,
      pivots: cluster, type,
      timeframes: [tf],
      originTimestamp: Math.min(...cluster.map(p => p.timestamp)),
      originIndex: Math.min(...cluster.map(p => p.index)),
      touchCount: 0, score: 0, volumeAtZone: totalVolume
    };
    zone.score = this.scoreZone(zone, candles);
    return zone;
  }

  // ─────────────────────────────────────────────────────────────────────
  // FIX B: when we skip a merge (span too wide), push BOTH current AND next
  //         so neither zone is accidentally dropped, then advance by 1 only.
  // ─────────────────────────────────────────────────────────────────────
  static mergeOverlappingZones(zones, candles, atr) {
    let merged = true;
    while (merged) {
      merged = false;
      zones.sort((a, b) => a.price - b.price);
      const nextZones = [];

      for (let i = 0; i < zones.length; i++) {
        const current = zones[i];
        const next = zones[i + 1];

        if (!next) {
          // Last zone — always keep it
          nextZones.push(current);
          break;
        }

        if (current.high >= next.low) {
          // Zones overlap — check span cap before merging
          let canMerge = true;
          if (atr && atr.length > 0) {
            const currentAtr = atr[atr.length - 1];
            const combinedSpan = Math.max(current.high, next.high) - Math.min(current.low, next.low);
            if (combinedSpan > Config.maxMergeSpanAtrMultiple * currentAtr) canMerge = false;
          }

          if (canMerge) {
            const mergedZone = this.createZoneFromCluster(
              current.pivots.concat(next.pivots), candles, atr
            );
            mergedZone.timeframes = Array.from(new Set(current.timeframes.concat(next.timeframes)));
            nextZones.push(mergedZone);
            i++;           // consume next
            merged = true;
          } else {
            // *** FIX B: can't merge — keep current, leave next for the next iteration ***
            nextZones.push(current);
            // Do NOT push next here; it becomes current on i++ at loop head
          }
        } else {
          nextZones.push(current);
        }
      }
      zones = nextZones;
    }
    return zones;
  }

  static scoreZone(zone, candles) {
    const n = candles.length;
    const isSupport = zone.type === 'support' || zone.price < candles[n - 1].c;

    let touchCount = 0, touchIndices = [], volumeSpikes = 0;

    const getAvgVolume = (idx) => {
      let sum = 0, count = 0;
      for (let j = Math.max(0, idx - 50); j < idx; j++) { sum += candles[j].v; count++; }
      return count > 0 ? sum / count : 1;
    };

    for (let k = zone.originIndex; k < n; k++) {
      const c = candles[k];
      let touched = false;
      if (isSupport) {
        if (c.l <= zone.high && c.c >= zone.low && c.c <= zone.high) touched = true;
      } else {
        if (c.h >= zone.low && c.c <= zone.high && c.c >= zone.low) touched = true;
      }
      if (touched) {
        touchCount++;
        touchIndices.push(k);
        if (c.v > Config.volumeSpikeThreshold * getAvgVolume(k)) volumeSpikes++;
      }
    }

    const touchScore = Math.min(30, touchCount * 8);
    const volumeScore = Math.min(25, volumeSpikes * 10);

    let recencyScore = 10;
    const lastTouchIdx = touchIndices.length > 0 ? touchIndices[touchIndices.length - 1] : zone.originIndex;
    const candlesSinceLastTouch = n - 1 - lastTouchIdx;
    if (candlesSinceLastTouch > 100) {
      recencyScore = Math.max(0, recencyScore - Math.floor((candlesSinceLastTouch - 100) / 50) * 5);
    }
    if (candlesSinceLastTouch <= 20) recencyScore += 10;

    let roleReversalScore = 0;
    let closedAbove = false, closedBelow = false;
    let touchedAsSupport = false, touchedAsResistance = false;
    for (let k = zone.originIndex; k < n; k++) {
      const c = candles[k];
      if (c.c > zone.high) closedAbove = true;
      if (c.c < zone.low) closedBelow = true;
      if (c.l <= zone.high && c.c >= zone.low && c.c <= zone.high) touchedAsSupport = true;
      if (c.h >= zone.low && c.c <= zone.high && c.c >= zone.low) touchedAsResistance = true;
    }
    if ((closedAbove && closedBelow || zone.type === 'role_reversal') && touchedAsSupport && touchedAsResistance) {
      roleReversalScore = 15;
    }

    let originScore = 0;
    const originCandle = candles[zone.originIndex];
    if (originCandle) {
      const originRange = originCandle.h - originCandle.l;
      const originBody = Math.abs(originCandle.c - originCandle.o);
      if (originRange > 0 && (originBody / originRange) >= 0.70) originScore += 5;
      if (originCandle.v > 2.0 * getAvgVolume(zone.originIndex)) originScore += 5;
    }

    zone.touchCount = touchCount;
    zone.lastTouchIndex = lastTouchIdx;
    // Cap at 80 here — confluence bonus (+20 max) is added later in calculateConfluences.
    // Capping at 100 here would mean any zone scoring >=81 would always display as 100
    // after the bonus, masking the real spread of zone quality.
    return Math.min(80, Math.max(0, touchScore + volumeScore + recencyScore + roleReversalScore + originScore));
  }

  static calculateConfluences(zones) {
    for (let i = 0; i < zones.length; i++) {
      const z = zones[i];
      const matchedTfs = new Set(z.timeframes);
      for (let j = 0; j < zones.length; j++) {
        if (i === j) continue;
        const other = zones[j];
        if (Math.abs(z.price - other.price) / z.price <= Config.confluenceProximityPct) {
          other.timeframes.forEach(tf => matchedTfs.add(tf));
        }
      }
      if (matchedTfs.size >= 2) {
        z.timeframes = Array.from(matchedTfs).sort();
        z.isConfluence = true;
        // +5 per extra timeframe beyond the first (max +20 for 5 TFs), then hard cap at 100
        const tfBonus = Math.min(20, (z.timeframes.length - 1) * 5);
        z.score = Math.min(100, z.score + tfBonus);
      }
    }
  }

  // Remove lower-scored zones that sit within 1x ATR of a higher-scored neighbour.
  // Operates on the fully scored + deduplicated zone list so it only prunes display noise.
  static pruneByAtrProximity(zones, mtfCandles) {
    // Derive a representative ATR from the highest-resolution TF available
    const tfPriority = ['1m', '5m', '15m', '1h', '4h'];
    let atrVal = 0;
    for (const tf of tfPriority) {
      const c = mtfCandles[tf];
      if (c && c.length >= Config.atrPeriod) {
        const atr = this.calculateATR(c, Config.atrPeriod);
        atrVal = atr[atr.length - 1] || 0;
        if (atrVal > 0) break;
      }
    }
    if (atrVal === 0) return zones; // no candles available — skip prune

    zones.sort((a, b) => b.score - a.score); // highest score first
    const kept = [];
    for (const z of zones) {
      const tooClose = kept.some(k => Math.abs(k.price - z.price) < atrVal);
      if (!tooClose) kept.push(z);
    }
    return kept;
  }

  static applyAntiRepaintLogic(newZones, existingZones, currentPrice, mtfCandles) {
    const finalized = [];
    const matchedNewIds = new Set();

    for (const ez of existingZones) {
      const match = newZones.find(nz => Math.abs(nz.price - ez.price) / ez.price <= Config.proximityPct);
      if (match) {
        ez.price = match.price; ez.low = match.low; ez.high = match.high;
        ez.score = match.score; ez.touchCount = match.touchCount;
        ez.timeframes = Array.from(new Set(ez.timeframes.concat(match.timeframes)));
        ez.isConfluence = ez.timeframes.length >= 2;
        ez.pivots = match.pivots;
        finalized.push(ez);
        matchedNewIds.add(match.id);
      } else {
        let keepZone = false;
        if (Math.abs(currentPrice - ez.price) / ez.price <= Config.zoneLockThresholdPct) keepZone = true;

        // Use the first (origin) timeframe — it is always populated and avoids
        // an undefined lookup when timeframes were merged in arbitrary order.
        const primaryTf = ez.timeframes[0];
        const candles = mtfCandles[primaryTf];
        if (candles && ez.score >= Config.pruneScoreThreshold) {
          const n = candles.length;
          const startIdx = Math.max(0, n - Config.pruneCandlesThreshold);
          for (let k = startIdx; k < n; k++) {
            if (candles[k].l <= ez.high && candles[k].h >= ez.low) { keepZone = true; break; }
          }
        }
        if (keepZone) finalized.push(ez);
      }
    }

    for (const nz of newZones) {
      if (!matchedNewIds.has(nz.id)) finalized.push(nz);
    }
    return finalized;
  }

  static calculateATR(candles, period) {
    const n = candles.length;
    const atr = new Float64Array(n);
    if (n === 0) return atr;

    const tr = new Float64Array(n);
    tr[0] = candles[0].h - candles[0].l;
    for (let i = 1; i < n; i++) {
      tr[i] = Math.max(candles[i].h - candles[i].l,
        Math.abs(candles[i].h - candles[i - 1].c),
        Math.abs(candles[i].l - candles[i - 1].c));
    }

    let sumTr = 0;
    for (let i = 0; i < period && i < n; i++) sumTr += tr[i];
    let currentAtr = sumTr / Math.min(period, n);
    atr[Math.min(period - 1, n - 1)] = currentAtr;
    for (let i = period; i < n; i++) {
      currentAtr = (currentAtr * (period - 1) + tr[i]) / period;
      atr[i] = currentAtr;
    }
    return atr;
  }
}