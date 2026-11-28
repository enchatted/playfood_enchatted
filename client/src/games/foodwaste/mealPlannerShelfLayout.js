export function layoutMarketItems(marketByCategory, shelves) {
  return shelves.flatMap((shelf) => {
    const items = marketByCategory[shelf.cat] || [];

    if (items.length > 3) {
      throw new Error(`Market shelf "${shelf.cat}" can hold at most 3 items.`);
    }

    const cols = items.length === 1
      ? [shelf.cols[1]]
      : items.length === 2
        ? [shelf.cols[0], shelf.cols[2]]
        : shelf.cols;

    return items.map((id, index) => ({
      id,
      cat: shelf.cat,
      tile: { col: cols[index], row: shelf.row },
      firstOfCat: index === 0,
    }));
  });
}
