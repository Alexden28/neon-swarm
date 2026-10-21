// Uniform-grid broadphase for circle colliders ({ x, y, r }).
// Rebuilt every tick: inserts are O(1) per touched cell and queries only visit nearby cells,
// so bullet/enemy collision stays roughly linear instead of O(bullets * enemies).
export class SpatialHash {
  constructor(cellSize = 64) {
    this.cellSize = cellSize;
    this.cells = new Map();
    this.active = []; // cells that received at least one item since the last clear
    this.stamp = 0;
  }

  // Only touches occupied cells. Each cell keeps its own `count` so arrays are reused, not reallocated.
  clear() {
    for (const cell of this.active) cell.count = 0;
    this.active.length = 0;
  }

  key(cx, cy) {
    return ((cx & 0xffff) << 16) | (cy & 0xffff);
  }

  insert(item) {
    const cs = this.cellSize;
    const x0 = Math.floor((item.x - item.r) / cs);
    const x1 = Math.floor((item.x + item.r) / cs);
    const y0 = Math.floor((item.y - item.r) / cs);
    const y1 = Math.floor((item.y + item.r) / cs);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const k = this.key(cx, cy);
        let cell = this.cells.get(k);
        if (!cell) {
          cell = { items: [], count: 0 };
          this.cells.set(k, cell);
        }
        if (cell.count === 0) this.active.push(cell);
        cell.items[cell.count++] = item;
      }
    }
  }

  // Fills `out` with every item whose cells overlap the circle's bounding box (no duplicates).
  // Callers still do the exact overlap test.
  query(x, y, r, out = []) {
    out.length = 0;
    const stamp = ++this.stamp;
    const cs = this.cellSize;
    const x0 = Math.floor((x - r) / cs);
    const x1 = Math.floor((x + r) / cs);
    const y0 = Math.floor((y - r) / cs);
    const y1 = Math.floor((y + r) / cs);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const cell = this.cells.get(this.key(cx, cy));
        if (!cell) continue;
        for (let i = 0; i < cell.count; i++) {
          const item = cell.items[i];
          if (item._queryStamp === stamp) continue;
          item._queryStamp = stamp;
          out.push(item);
        }
      }
    }
    return out;
  }
}
