export function plural(count, singular, multiple = `${singular}s`) {
  return count === 1 ? singular : multiple;
}

export function countLabel(count, singular, multiple) {
  if (count == null || !Number.isFinite(count)) return '—';
  return `${count.toLocaleString('en-US')} ${plural(count, singular, multiple)}`;
}
