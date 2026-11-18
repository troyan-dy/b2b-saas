import { expect, it } from 'vitest';
import { facts, traitCard } from '../src/game/idea-card';
import { nextStep, sprints } from '../src/game/run-hint';
import { TRAITS } from '../src/systems/meta/meta';
import { createRun, IDEAS, TUNING, type Block } from '../src/systems/run/run';
import type { WorkTask } from '../src/systems/run/production';

const idea = { tech: IDEAS.tech[0], form: IDEAS.form[0], aud: IDEAS.aud[0] };
const idle = { paused: false, picked: false, razing: false };
const task: WorkTask = { id: 'work-1', kind: 'infrastructure', status: 'queued', cost: 20, work: 10, done: 0 };
function block(kind: string, i: number): Block {
  return { kind, i, j: 0, level: 1, live: true, built: true, done: 10, need: 10, up: false, hand: false };
}

it('turns a card description and trait levels into separate facts', () => {
  expect(facts('')).toEqual([]);
  expect(facts('чек выше, но и токены дороже')).toEqual(['чек выше', 'токены дороже']);
  const sales = TRAITS.find(t => t.id === 'sales')!;
  expect(traitCard(sales, 0, 'выбор', 1)).toMatchObject({ title: sales.title, kicker: 'выбор', facts: ['чек клиентов +15%', 'сейчас этой черты нет'] });
  expect(traitCard(sales, 1, 'рост', 2).facts).toEqual(['чек клиентов +30%', 'сейчас: чек клиентов +15%']);
  expect([1, 3, 11].map(sprints)).toEqual(['1 спринт', '3 спринта', '11 спринтов']);
});

it('prioritizes a draft, map actions and blockers in the work queue', () => {
  const run = createRun(1, idea);
  const hint = () => nextStep(run, 0, idle);
  run.draft = [];
  expect(nextStep(run, 0, { ...idle, picked: true })).toContain('трёх карт');
  run.draft = null;
  expect(nextStep(run, 0, { ...idle, picked: true, razing: true })).toContain('Разобрать здание');
  expect(nextStep(run, 0, { ...idle, picked: true })).toContain('свободную клетку');
  expect(nextStep(run, 0, { ...idle, paused: true })).toContain('Пауза');
  run.money = 7;
  run.tasks = [{ ...task }];
  expect(hint()).toContain('инфраструктуры не хватает <b>$13');
  run.tasks[0].kind = 'build';
  expect(hint()).toContain('работы не хватает <b>$13');
  run.tasks[0].status = 'ready';
  expect(hint()).toContain('готова и ждёт релиза');
  run.tasks[0].status = 'backlog';
  expect(hint()).toContain('Работа отложена');
  run.tasks[0].status = 'active';
  run.agents[0].lane = 'fix';
  expect(hint()).toContain('нет агента');
});

it('follows first construction, billing, outages, overload and profitability in order', () => {
  const run = createRun(1, idea);
  const hint = (net = 0) => nextStep(run, net, idle);
  expect(hint()).toContain('клетку на чертеже');
  run.blocks.push(block('core', 0));
  expect(hint()).toContain('Лендинг');
  run.blocks.push(block('landing', 1));
  expect(hint()).toContain('Приём оплаты');
  run.blocks.push(block('pay', 2));
  expect(hint()).toContain('Платежи ещё не выпущены');
  run.down = true;
  run.downWhy = 'supplier';
  expect(hint()).toContain('Сбой поставщика');
  run.downWhy = 'debt';
  expect(hint()).toContain('Продукт лежит');
  run.down = false;
  run.live.add('pay');
  run.tasks = [{ ...task }];
  expect(hint()).toContain('Основатель расширяет');
  run.tasks = [];
  expect(hint()).toContain('первые клиенты');
  const buyers = run.market.groups[0].profiles[0];
  buyers.count = 100_000;
  expect(hint()).toContain('Перегруз');
  buyers.count = 1;
  expect(hint(-5)).toContain('не хватает <b>$5/с');
  expect(hint(5)).toContain('В плюсе');
  run.sprint = TUNING.last_sprint;
  expect(hint(5)).toContain('Последний спринт');
});
