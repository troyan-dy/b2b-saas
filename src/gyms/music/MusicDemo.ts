import { TRACKS } from '../../core/music';
import { loadSettings, saveSettings } from '../../core/settings';
import './music.css';

/**
 * The music demo: every loop the game can play, side by side. Click a card to listen; «выбрать» makes
 * the game play that one. Nothing here is the game — it is a page to choose by ear.
 * ?gym=music
 */
export function mountMusicDemo(root: HTMLElement): void {
  const settings = loadSettings();
  const page = document.createElement('div');
  page.className = 'mu';
  page.innerHTML =
    '<h1>Музыка</h1><p class="mu-how">клик по карточке — послушать · «выбрать» — этот трек будет играть в игре</p>' +
    '<div class="mu-grid">' +
    TRACKS.map(
      (t, k) =>
        `<div class="mu-card" data-id="${t.id}"><i>${k + 1}</i><b>${t.title}</b><span>${t.mood}</span>` +
        `<small>${t.author} · CC0</small><u><s></s></u><em data-pick="${t.id}">выбрать</em></div>`,
    ).join('') +
    '</div><p class="mu-foot"></p>';
  root.append(page);

  const foot = page.querySelector('.mu-foot') as HTMLElement;
  const cards = [...page.querySelectorAll('.mu-card')] as HTMLElement[];
  const audio = new Audio();
  audio.loop = true;
  audio.volume = 0.5;
  let playing = '';

  const show = (): void => {
    for (const card of cards) {
      const id = card.dataset.id ?? '';
      card.classList.toggle('on', id === playing);
      card.classList.toggle('picked', id === settings.track);
      (card.querySelector('em') as HTMLElement).textContent = id === settings.track ? 'выбран для игры' : 'выбрать';
    }
    const picked = TRACKS.find((t) => t.id === settings.track) ?? TRACKS[0];
    foot.textContent = `в игре сейчас: «${picked.title}» — сменить можно и там: Esc → «Трек»`;
  };

  const play = (id: string): void => {
    const t = TRACKS.find((x) => x.id === id);
    if (!t || playing === id) {
      audio.pause();
      playing = '';
    } else {
      audio.src = t.file;
      void audio.play().catch(() => undefined);
      playing = id;
    }
    show();
  };

  page.addEventListener('click', (e) => {
    const el = e.target as HTMLElement;
    const pick = el.closest('[data-pick]') as HTMLElement | null;
    if (pick) {
      settings.track = pick.dataset.pick ?? settings.track;
      saveSettings(settings);
      show();
      return;
    }
    const card = el.closest('.mu-card') as HTMLElement | null;
    if (card) play(card.dataset.id ?? '');
  });
  // digits pick a card by its number, Space stops
  window.addEventListener('keydown', (e) => {
    const digit = /^Digit([1-9])$/.exec(e.code);
    if (digit && TRACKS[Number(digit[1]) - 1]) play(TRACKS[Number(digit[1]) - 1].id);
    if (e.code === 'Space') play(playing);
  });
  // the ruler under the name of the playing loop
  window.setInterval(() => {
    for (const card of cards) {
      const bar = card.querySelector('s') as HTMLElement;
      const part = card.dataset.id === playing && audio.duration > 0 ? audio.currentTime / audio.duration : 0;
      bar.style.width = `${Math.round(part * 1000) / 10}%`;
    }
  }, 100);

  show();
  window.__GAME__.ready = true;
}
