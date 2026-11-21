import { L } from '../core/lang';
import { nextTrack, setMusicOn, setTrack, startMusic, trackTitle } from '../core/music';
import { setGamePaused } from '../core/pause-clock';
import { saveSettings, type Settings } from '../core/settings';
import { playSound, setSoundOn, unlockSound } from '../core/sound';
import './pause.css';

export function installPause(settings: Settings) {
  const dialog = document.createElement('dialog');
  dialog.className = 'pause-dialog';
  dialog.setAttribute('aria-labelledby', 'pause-title');
  dialog.innerHTML = `<h1 id="pause-title">${L('Пауза', 'Paused')}</h1>
    <div class="pause-mix"></div><button class="pause-track" type="button"></button>
    <div class="pause-help"></div><footer><button class="pause-resume" type="button" autofocus>${L('Продолжить', 'Resume')} <kbd>Esc</kbd></button>
    <button type="button" data-profit-guide hidden>${L('Обучение: как выйти в прибыль', 'Guide: how to turn a profit')}</button>
    <button class="pause-quit" type="button" hidden>${L('Сохранить и выйти в меню', 'Save and return to menu')}</button></footer>`;
  document.body.append(dialog);
  const track = dialog.querySelector<HTMLButtonElement>('.pause-track')!;
  const resume = dialog.querySelector<HTMLButtonElement>('.pause-resume')!;
  const quit = dialog.querySelector<HTMLButtonElement>('.pause-quit')!;
  const guide = dialog.querySelector<HTMLButtonElement>('[data-profit-guide]')!;
  const apply = (): void => {
    setSoundOn(settings.sound, settings.soundVolume);
    setMusicOn(settings.music, settings.musicVolume);
    setTrack(settings.track);
    track.textContent = L('Трек', 'Track') + ' · ' + trackTitle(settings.track) + ' →';
  };
  apply();
  track.onclick = () => {
    settings.track = nextTrack(settings.track);
    apply();
    startMusic();
    saveSettings(settings);
  };
  for (const [channel, label] of [['music', L('Музыка', 'Music')], ['sound', L('Эффекты', 'Effects')]] as const) {
    const key = `${channel}Volume` as const;
    const row = document.createElement('label');
    row.innerHTML = `<span>${label}</span><output></output><input type="range" min="0" max="100" step="1" aria-label="${label}">`;
    const input = row.querySelector('input')!;
    const out = row.querySelector('output')!;
    input.value = String(settings[channel] ? settings[key] : 0);
    out.value = input.value + '%';
    input.oninput = () => {
      settings[key] = input.valueAsNumber;
      settings[channel] = settings[key] > 0;
      out.value = input.value + '%';
      apply();
      unlockSound();
      startMusic();
      if (channel === 'sound') playSound('ui');
      saveSettings(settings);
    };
    dialog.querySelector('.pause-mix')!.append(row);
  }
  let focus: HTMLElement | null = null;
  let done: (() => void) | undefined;
  function open(): Promise<void> {
    if (dialog.open) return Promise.resolve();
    focus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setGamePaused(true);
    document.body.classList.add('game-paused');
    dialog.showModal();
    resume.focus();
    return new Promise(resolve => { done = resolve; });
  }
  function close(): void {
    dialog.close();
    document.body.classList.remove('game-paused');
    setGamePaused(false);
    focus?.focus({ preventScroll: true });
    done?.();
  }
  resume.onclick = close;
  dialog.oncancel = event => { event.preventDefault(); close(); };
  const held = new Set<string>();
  window.addEventListener('blur', () => held.clear());
  const keyboard = (event: KeyboardEvent): void => {
    if (event.code === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.type === 'keydown' && !event.repeat) {
        if (dialog.open) close();
        else void open();
      }
    } else if (dialog.open || held.has(event.code)) {
      event.stopImmediatePropagation();
      if (!dialog.open) event.preventDefault();
      if (event.type === 'keydown') held.add(event.code);
      else held.delete(event.code);
    }
  };
  window.addEventListener('keydown', keyboard, true);
  window.addEventListener('keyup', keyboard, true);
  return { open, setGuide(callback: (() => void) | null) {
    guide.hidden = !callback;
    guide.onclick = callback ? () => { close(); callback(); } : null;
  }, setQuit(callback: (() => void) | null) {
    quit.hidden = !callback;
    quit.onclick = callback;
  } };
}
