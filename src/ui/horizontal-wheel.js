export function scrollHorizontally(event, element) {
  if (event.ctrlKey || !event.deltaY || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
  const max = element.scrollWidth - element.clientWidth;
  if (max <= 1) return;
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientWidth : 1;
  const distance = Math.sign(event.deltaY) * Math.min(36, Math.abs(event.deltaY) * unit * 0.55);
  const position = element.scrollLeft;
  if (distance < 0 ? position <= 0 : position >= max - 1) return;
  event.preventDefault();
  event.stopPropagation();
  element.scrollTo({ left: position + distance, behavior: 'instant' });
}
