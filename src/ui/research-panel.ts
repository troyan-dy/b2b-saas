import { L } from '../core/lang';
import { dec, PER_S, rate } from './format';
import type { ResearchView } from './research-view';
import './research-panel.css';

const esc = (value: string): string => value.replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const number = (value: number): string => dec(Number(value.toFixed(1)));
const list = (items: string[]): string => '<ul>' + items.map(item => '<li>' + esc(item) + '</li>').join('') + '</ul>';

function button(action: string, id: string, label: string, disabled = false, cls = ''): string {
  return `<button type="button" class="${cls}" data-wb-action="${action}" data-wb-id="${esc(id)}" data-wb-key="${action}:${esc(id)}"${disabled ? ' disabled' : ''}>${esc(label)}</button>`;
}

export function researchPanelHtml(view: ResearchView): string {
  const card = view.selected;
  const active = view.cards.find(item => item.active);
  const startLabel = card.active ? L('Отчёт начат', 'Report started')
    : !card.available && !view.locked ? L('Данные актуальны', 'Up to date')
    : view.active ? L('Переключиться на это направление', 'Switch to this direction')
    : L('Начать отчёт', 'Start report');
  const progress = active
    ? `<section class="wb-research-work"><p>${esc(L('В работе: ', 'In progress: ') + active.label)} · ${esc(L('осталось ', 'remaining ') + number(active.remaining) + L(' работы', ' work'))}</p><progress max="1" value="${active.progress}" aria-label="${esc(active.title)}"></progress></section>`
    : '';
  return '<div class="wb-research-panel"><h2>' + L('ИССЛЕДОВАНИЯ', 'RESEARCH') + '</h2>' +
    '<nav class="wb-research-choices" aria-label="' + L('Направление исследования', 'Research direction') + '">' +
    view.cards.map(item => `<button type="button" class="wb-research-choice${item.selected ? ' is-selected' : ''}" data-wb-action="select-research" data-wb-id="${item.kind}" data-wb-key="select-research:${item.kind}" aria-pressed="${item.selected}"${view.locked ? ' disabled' : ''}><b>${esc(item.label)}</b><span>${esc(item.benefit)}</span><small>${esc(item.status)}${item.active ? ' · ' + L('в работе', 'in progress') : item.available && item.progress > 0 ? ' · ' + L('прогресс сохранён', 'progress saved') : ''}</small></button>`).join('') + '</nav>' +
    '<p class="wb-research-selected">' + esc(L('Выбрано: ', 'Selected: ') + card.label) +
    (card.available && !card.active ? ' · ' + esc(number(card.remaining) + L(' работы', ' work')) : '') + '</p>' +
    button('start-research', card.kind, startLabel, !card.available || card.active, 'wb-primary') +
    (view.active && !card.active ? '<small class="wb-research-note">' + L('Прогресс обоих направлений сохранится.', 'Progress in both directions is kept.') + '</small>' : '') +
    '<p class="wb-research-state" role="status">' + esc(view.state) + '</p>' + progress +
    '<section class="wb-research-team"><h3>' + L('Кто исследует', 'Who researches') + '</h3>' +
    '<div class="wb-research-actions">' + button('research-hand', '', L('Помочь · 1 сила', 'Help · 1 energy'), view.handDisabled) +
    '<small>' + L('Запас сил: ', 'Energy: ') + view.energy + '</small></div>' +
    '<details data-wb-key="research-agents"><summary data-wb-key="research-agents-toggle">' + L(`Выбрать агента · назначено ${view.agents.filter(agent => agent.assigned).length} из ${view.agents.length}`, `Choose agent · ${view.agents.filter(agent => agent.assigned).length} of ${view.agents.length} assigned`) + '</summary><div class="wb-research-agent-list">' +
    (view.agents.length ? view.agents.map(agent => '<div class="wb-research-agent"><div><span>' + esc(`№${agent.id} · ${agent.title}`) + '</span><small>' + esc(agent.occupation) + '</small></div>' +
      button('research-agent', String(agent.id), agent.assigned ? L('Назначен', 'Assigned') : L('Назначить', 'Assign'), agent.disabled) + '</div>').join('')
      : '<p>' + L('Агентов пока нет. Отчёт можно сделать основателем.', 'No agents yet. The founder can finish a report.') + '</p>') +
    '</div></details></section>' +
    (card.findings.length ? '<section class="wb-research-findings"><h3>' + esc(card.label + ' · ' + card.status) + '</h3>' + list(card.findings) + '</section>' : '') +
    '<details data-wb-key="research-details"><summary data-wb-key="research-details-toggle">' + L('Как это работает', 'How it works') + '</summary><p>' +
    L('Агент занят только этим отчётом. После завершения ждёт бесплатно; новую работу поручаешь ты. Основание для повтора — перемены рынка, не таймер.', 'An agent works only on this report. After finishing, they wait for free until reassigned. Market changes unlock a new report; there is no expiry timer.') + '</p>' +
    (view.agents.length ? list(view.agents.map(agent => L(`№${agent.id}: ${number(agent.rate)} работы/с · зарплата ${rate(agent.salary)}${PER_S} во время работы.`, `#${agent.id}: ${number(agent.rate)} work/s · wages ${rate(agent.salary)}${PER_S} while working.`))) : '') +
    '<p>' + L('Помощь основателя даёт 1 работу сразу. Прогнозы — оценка на дату отчёта.', 'Founder help delivers 1 work immediately. Forecasts are estimates dated to the report.') + '</p></details>' +
    (card.details.length ? '<details data-wb-key="research-snapshot"><summary data-wb-key="research-snapshot-toggle">' + L('Подробности отчёта', 'Report details') + '</summary>' + list(card.details) + '</details>' : '') +
    (view.history.length ? '<details data-wb-key="research-history"><summary data-wb-key="research-history-toggle">' + L('Предыдущие отчёты', 'Previous reports') + '</summary>' + view.history.map(report => '<h3>' + esc(report.title) + '</h3>' + list(report.findings)).join('') + '</details>' : '') + '</div>';
}
