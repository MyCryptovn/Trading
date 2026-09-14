import assert from "node:assert/strict";
import { createFastDiscoveryEngine } from "./FastDiscoveryEngine.js";

const now = 1_700_000_000_000;
const base = {
  id: "pool-1",
  address: "0x1",
  symbol: "TEST",
  chain: "ethereum",
  liquidityUsd: 100000,
  spreadPct: 0.2,
  timestamp: now,
  source: "test"
};

{
  const engine = createFastDiscoveryEngine();
  const result = engine.discover([base], now);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].id, "pool-1");
}

{
  const engine = createFastDiscoveryEngine();
  const result = engine.discover([{ ...base, liquidityUsd: 1000 }], now);
  assert.equal(result.candidates.length, 0);
  assert.equal(result.rejected, 1);
}

{
  const engine = createFastDiscoveryEngine();
  const result = engine.discover([{ ...base, spreadPct: 1 }], now);
  assert.equal(result.candidates.length, 0);
  assert.equal(result.rejected, 1);
}

{
  const engine = createFastDiscoveryEngine();
  const result = engine.discover([{ ...base, timestamp: now - 121000 }], now);
  assert.equal(result.candidates.length, 0);
  assert.equal(result.rejected, 1);
}

{
  const engine = createFastDiscoveryEngine();
  const result = engine.discover([base, { ...base, liquidityUsd: 200000 }], now);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].liquidityUsd, 200000);
  assert.equal(result.rejected, 1);
}

{
  const engine = createFastDiscoveryEngine({ maxCandidates: 1 });
  const result = engine.discover([
    { ...base, id: "pool-a", liquidityUsd: 100000 },
    { ...base, id: "pool-b", liquidityUsd: 200000 }
  ], now);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].id, "pool-b");
}

{
  const engine = createFastDiscoveryEngine();
  const records = Array.from({ length: 15 }, (_, index) => ({
    ...base,
    id: `pool-${index}`,
    liquidityUsd: 100000 + index * 1000
  }));
  const result = engine.discover(records, now);
  assert.equal(result.candidates.length, 10);
  assert.equal(result.candidates[0].liquidityUsd, 114000);
  assert.equal(result.candidates[9].liquidityUsd, 105000);
}

{
  const engine = createFastDiscoveryEngine();
  const result = engine.discover([{ ...base, timestamp: now + 31000 }], now);
  assert.equal(result.candidates.length, 0);
  assert.equal(result.rejected, 1);
}

console.log("FastDiscoveryEngine tests passed");
