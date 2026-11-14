import { createOverlay } from '../debug/overlay';
import { createTuningPanel } from '../debug/tuningPanel';
import type { GameScene } from '../game/GameScene';
import { burnPerS, incomePerS, mrr, tokens, TUNING, type Run } from '../systems/run/run';

/**
 * The same keys in every gym: R — restart, Tab — tuning panel, O — overlay, P — save the panel values,
 * T — slow motion ×0.25, F — fast-forward ×6, Space — pause. Bound by physical key, so any layout works.
 */
export function mountGymKeys(scene: GameScene, run: Run, overlayOn: boolean): void {
  const overlay = createOverlay(overlayOn);
  const panel = createTuningPanel('run', [
    { target: TUNING, key: 'sprint_s', label: 'длина спринта, с', min: 10, max: 80, step: 1 },
    { target: TUNING, key: 'living_per_s', label: 'жизнь, $/с', min: 0, max: 12, step: 0.5 },
    { target: TUNING.tiers.fast, key: 'work_per_s', label: 'быстрый: работа/с', min: 0.05, max: 0.6, step: 0.01 },
    { target: TUNING.tiers.fast, key: 'cost_per_s', label: 'быстрый: $/с', min: 1, max: 15, step: 0.5 },
    { target: TUNING.tiers.fast, key: 'debt_per_work', label: 'быстрый: долг за квадрат', min: 0, max: 1.5, step: 0.05 },
    { target: TUNING, key: 'review_boost', label: 'проверка: множитель', min: 1, max: 2, step: 0.05 },
    { target: TUNING, key: 'promo_work_per_lead', label: 'продвижение: квадратов на лид', min: 2, max: 20, step: 1 },
    { target: TUNING, key: 'research_work_per_reveal', label: 'разведка: квадратов на запрос', min: 2, max: 16, step: 1 },
    { target: TUNING.clients, key: 'token_share', label: 'токены: доля подписки', min: 0.1, max: 0.8, step: 0.05 },
    { target: TUNING, key: 'link_bonus', label: 'связка: бонус к чеку', min: 0, max: 0.4, step: 0.02 },
    { target: TUNING.debt, key: 'down_at', label: 'долг: порог падения', min: 10, max: 60, step: 1 },
  ]);

  let normal = scene.speed;
  window.addEventListener('keydown', (e) => {
    switch (e.code) {
      case 'KeyR':
        window.location.reload();
        break;
      case 'Tab':
        e.preventDefault();
        panel.toggle();
        break;
      case 'KeyO':
        overlay.toggle();
        break;
      case 'KeyP':
        panel.dump(TUNING);
        break;
      case 'KeyT':
        scene.speed = scene.speed === 0.25 ? normal : 0.25;
        break;
      case 'KeyF':
        if (scene.speed === 6) scene.speed = normal;
        else {
          normal = scene.speed === 0.25 ? normal : scene.speed;
          scene.speed = 6;
        }
        break;
      case 'Space':
        scene.paused = !scene.paused;
        break;
    }
  });

  const tick = (): void => {
    overlay.set([
      `t ${run.t.toFixed(0)} с · спринт ${run.sprint} · этап ${run.stage} · ×${scene.speed}`,
      `деньги ${run.money.toFixed(0)} · доход ${incomePerS(run).toFixed(1)}/с · расход ${burnPerS(run).toFixed(1)}/с`,
      `подписки ${mrr(run).toFixed(0)} · токены ${tokens(run).toFixed(0)} за спринт`,
      `долг ${run.debt.toFixed(1)} · лиды ${run.leads.toFixed(2)} · разведка ${run.insight}`,
      `просят: ${run.asks.join(', ')} · известно: ${run.known.join(', ') || '—'}`,
      `клиенты ${run.clients.length} · пришло ${run.stats.clients} · ушло ${run.stats.left} · падений ${run.stats.downs}`,
      run.over ? `КОНЕЦ: ${run.over}` : '',
    ]);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
