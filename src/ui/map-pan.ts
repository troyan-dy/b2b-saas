import { L } from '../core/lang';

export function enableMapPan(top: HTMLElement, move: (dx: number, dy: number) => void, centre: () => void): void {
  const surface = document.createElement('div');
  surface.className = 'bl-pan-surface';
  top.prepend(surface);
  const controls = document.createElement('div');
  controls.className = 'bl-map-controls';
  controls.innerHTML = '<span>' + L('Перетащи карту', 'Drag map') + '</span><button type="button">⌖ ' + L('К компании', 'Centre on company') + '</button>';
  top.append(controls);
  controls.querySelector('button')!.onclick = centre;

  const mapTarget = (e: Event) => (e.target as Element).closest('.bl-pan-surface,.bl-cell,.bl-tag,.client-city');
  let id = -1, x = 0, y = 0, dragging = false, suppress = false;
  const scale = () => top.getBoundingClientRect().width / 1920;
  top.addEventListener('pointerdown', e => {
    suppress = false;
    if (!mapTarget(e) || !e.isPrimary || e.button !== 0) return;
    id = e.pointerId;
    x = e.clientX;
    y = e.clientY;
    dragging = false;
  }, true);
  top.addEventListener('pointermove', e => {
    if (e.pointerId !== id || !e.buttons) return;
    const dx = e.clientX - x, dy = e.clientY - y;
    if (!dragging && Math.hypot(dx, dy) < 6) return;
    if (!dragging) {
      dragging = true;
      top.setPointerCapture(id);
      top.classList.add('is-panning');
    }
    move(dx / scale(), dy / scale());
    x = e.clientX;
    y = e.clientY;
  }, true);
  const finish = (e: PointerEvent) => {
    if (e.pointerId !== id) return;
    suppress = dragging;
    id = -1;
    top.classList.remove('is-panning');
  };
  top.addEventListener('pointerup', finish, true);
  top.addEventListener('pointercancel', finish, true);
  top.addEventListener('click', e => {
    if (!suppress || !e.detail) return;
    suppress = false;
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);
  top.addEventListener('wheel', e => {
    if (!mapTarget(e) || e.ctrlKey || (e.target as Element).closest('.map-work-list')) return;
    e.preventDefault();
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 600 : 1;
    move(-(e.shiftKey ? e.deltaY : e.deltaX) * unit / scale(), -(e.shiftKey ? 0 : e.deltaY) * unit / scale());
  }, { passive: false });
}
