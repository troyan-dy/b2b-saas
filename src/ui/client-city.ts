import { L } from '../core/lang';
import { whole } from './format';
import type { SegmentId } from '../systems/company/market';
import './client-city.css';

export interface CityView {
  total: number;
  collapsed: boolean;
  heading: { x: number; y: number; width: number };
  groups: {
    id: SegmentId;
    title: string;
    count: number;
    happiness: number;
    x: number;
    y: number;
    width: number;
  }[];
  nodes: {
    id: string;
    segment: SegmentId;
    title: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }[];
}

const esc = (text: string): string =>
  text.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  );
const at = (x: number, y: number, width: number): string =>
  `left:${Math.round(x)}px;top:${Math.round(y)}px;width:${Math.round(width)}px`;

/** Captions and hit areas only. The buildings and their connections belong to the drawing. */
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
      const { x, y, width } = view.heading;
      el.innerHTML =
        `<header style="${at(x, y, width)}"><button class="city-total" data-segment="small">${L('КЛИЕНТЫ', 'CLIENTS')} · <strong>${whole(view.total)}</strong></button>` +
        `<button data-fold="1" aria-expanded="${!view.collapsed}">${view.collapsed ? L('развернуть', 'expand') : L('свернуть', 'fold')}</button></header>` +
        view.nodes
          .map(
            (node) =>
              `<button class="city-node" data-segment="${node.segment}" style="${at(node.x, node.y - node.height, node.width)};height:${Math.round(node.height)}px" title="${esc(node.title)}" aria-label="${esc(node.title)}"></button>`,
          )
          .join('') +
        view.groups
          .map(
            (group) =>
              `<button class="city-district" data-segment="${group.id}" style="${at(group.x, group.y, group.width)}" aria-label="${esc(group.title)}: ${whole(group.count)}. ${L('Потребности и тариф', 'Needs and price')}">` +
              `<span>${group.title} · <b>${whole(group.count)}</b></span><small>${L(`довольство ${group.happiness}%`, `satisfaction ${group.happiness}%`)}</small></button>`,
          )
          .join('');
    },
  };
}
