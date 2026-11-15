import { L } from '../core/lang';
import { whole } from './format';
import type { SegmentId } from '../systems/company/market';
import './client-city.css';

export interface CityView {
  total: number;
  collapsed: boolean;
  groups: { id: SegmentId; title: string; count: number; happiness: number; delta: number }[];
  overloaded: boolean;
}

const BUILDINGS: Record<SegmentId, string[]> = {
  small: ['coffee', 'pizzeria', 'garage'],
  medium: ['office', 'warehouse', 'factory'],
  large: ['bank', 'tower', 'hq'],
};

/** A bounded illustration of an unbounded customer base. Counts always include key contracts. */
export function createClientCity(
  parent: HTMLElement,
  choose: (segment: SegmentId) => void,
  toggle: () => void,
) {
  const el = document.createElement('section');
  el.className = 'client-city';
  el.setAttribute('aria-label', L('Город клиентов', 'Customer city'));
  parent.append(el);
  let signature = '';
  el.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (target?.dataset.segment) choose(target.dataset.segment as SegmentId);
    else if (target?.dataset.fold) toggle();
  });
  return {
    set(view: CityView | null) {
      el.hidden = !view;
      if (!view) return;
      const sig = JSON.stringify(view);
      if (sig === signature) return;
      signature = sig;
      el.classList.toggle('collapsed', view.collapsed);
      el.innerHTML =
        `<header><div><span>${L('КЛИЕНТЫ', 'CUSTOMERS')}</span><strong>${whole(view.total)}</strong></div>` +
        `<button data-fold="1" aria-expanded="${!view.collapsed}">${view.collapsed ? L('Развернуть ↓', 'Expand ↓') : L('Свернуть ↑', 'Fold ↑')}</button></header>` +
        `<div class="city-districts">${view.groups
          .map((group) => {
            const buildings = Math.min(3, group.count > 100 ? 3 : group.count > 10 ? 2 : 1);
            return (
              `<button class="city-district${group.count ? '' : ' empty'}" data-segment="${group.id}" aria-label="${group.title}: ${whole(group.count)}. ${L('Потребности и тариф', 'Needs and price')}">` +
              `<span class="city-roofline" aria-hidden="true">${BUILDINGS[group.id]
                .slice(0, buildings)
                .map((key) => `<img src="assets/img/nodes/${key}.webp" alt="" draggable="false">`)
                .join('')}</span>` +
              `<span class="city-name">${group.title}<b>${whole(group.count)}</b></span>` +
              `<span class="city-mood${group.happiness < 45 ? ' low' : ''}">${group.count ? L(`Довольство ${group.happiness}%`, `Satisfaction ${group.happiness}%`) : L('Ждут свой продукт', 'Waiting for their product')}${group.delta ? `<em>${group.delta > 0 ? '+' : '−'}${whole(Math.abs(group.delta))}</em>` : ''}</span>` +
              `</button>`
            );
          })
          .join('')}</div>` +
        `<p class="city-hint${view.overloaded ? ' warning' : ''}">${view.overloaded ? L('Перегруз · нажми на клиентов, чтобы расшириться', 'Overloaded · click customers to expand') : L('Нажми на здания: чего хотят клиенты', 'Click buildings to see what customers need')}</p>`;
    },
  };
}
