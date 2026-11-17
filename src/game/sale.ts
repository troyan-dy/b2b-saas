import { L } from '../core/lang';
import { money } from '../ui/format';
import { pitch, type Run } from '../systems/run/run';
import './sale.css';

/** The buyer takes delivery after the deal has already been recorded. */
export function packSale(root: HTMLElement, run: Run): Promise<void> {
  const scene = document.createElement('section');
  scene.className = 'sale-scene';
  scene.setAttribute('aria-label', L('Передача компании', 'Company handover'));
  scene.innerHTML = `<header><small>${L('Договор купли-продажи', 'Acquisition agreement')}</small>
    <h1>${L('Компания продана', 'Company sold')}</h1><p></p></header>
    <div class="sale-art" aria-hidden="true"><img class="sale-box" src="assets/img/nodes/box.webp" alt="">
    <div class="sale-paper"><div class="sale-panel"><img src="assets/img/nodes/laptop.webp" alt=""></div>
    <div class="sale-panel"><img src="assets/img/nodes/hq.webp" alt=""></div>
    <div class="sale-panel"><img src="assets/img/nodes/racks.webp" alt=""></div></div>
    <img class="sale-lip" src="assets/img/nodes/box.webp" alt=""></div>
    <footer><div>${L('Сумма сделки', 'Sale price')} <strong>${money(run.stats.soldFor)}</strong></div>
    <button type="button">${L('К итогам', 'Skip to report')} →</button></footer>`;
  scene.querySelector('p')!.textContent = pitch(run.idea);
  root.append(scene);
  const skip = scene.querySelector('button')!;
  skip.focus();
  return new Promise(resolve => {
    const done = (): void => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', key);
      scene.remove();
      resolve();
    };
    const key = (event: KeyboardEvent): void => {
      if (event.code === 'Escape') { event.preventDefault(); done(); }
    };
    const timer = window.setTimeout(done, 4400);
    window.addEventListener('keydown', key);
    skip.onclick = done;
  });
}
