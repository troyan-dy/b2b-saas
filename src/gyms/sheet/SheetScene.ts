import Phaser from 'phaser';
import { BLOCKS } from '../../content/blocks';
import { effectLine } from '../../content/texts';
import { PALETTE } from '../../data/palette';
import { CLIENT_LOOK } from '../../game/GameScene';
import { CLIENT_TYPES, IDEAS, RULES } from '../../systems/run/run';
import '../../ui/paper.css';
import { drawBox, drawGlyph } from '../../view/iso';

const ROLE: Record<string, string> = { base: 'основа', ask: 'просят клиенты', corp: 'просят крупные', tool: 'инструмент' };
const SIDE: Record<string, number> = { core: PALETTE.sand, sell: PALETTE.sage, ai: PALETTE.sand, corp: PALETTE.blue };

/**
 * The contact sheet: every unit of content side by side, in one framing. Nothing here is played —
 * it is looked at: two units that read the same are one unit.
 * ?gym=sheet&state=blocks — the product blocks · ?gym=sheet&state=clients — who pays for them
 */
export class SheetScene extends Phaser.Scene {
  private readonly page: string;
  private readonly labels: HTMLElement;

  constructor(page: string, over: HTMLElement) {
    super('sheet');
    this.page = page === 'clients' ? 'clients' : 'blocks';
    this.labels = document.createElement('div');
    this.labels.style.cssText = 'position:absolute;inset:0';
    over.append(this.labels);
  }

  preload(): void {
    const keys = new Set([...IDEAS.aud, ...IDEAS.corp, ...IDEAS.startup, ...IDEAS.gov].map((c) => c.texture));
    for (const key of keys) this.load.image(`node_${key}`, `assets/img/nodes/${key}.webp`);
  }

  create(): void {
    if (this.page === 'blocks') this.blocks();
    else this.clients();
    window.__GAME__.ready = true;
  }

  private blocks(): void {
    const g = this.add.graphics();
    this.label(40, 22, `<b>БЛОКИ ПРОДУКТА · ${BLOCKS.length}</b>`, 'left');
    // in the order of the shelf: what the rules file lists first is offered first
    const order = Object.keys(RULES);
    order.forEach((id, k) => {
      const kind = BLOCKS.find((b) => b.id === id);
      if (!kind) return;
      const x = 192 + (k % 5) * 384;
      const y = 172 + Math.floor(k / 5) * 255;
      drawBox(g, x, y, kind.height, SIDE[kind.group]);
      drawGlyph(g, x, y, kind.height, kind.glyph);
      const rule = RULES[id];
      const gives = effectLine(id);
      this.label(
        x,
        y + 58,
        `<b>${kind.name}</b> · ${rule.work} кв.<i>${ROLE[rule.role]}${rule.stage > 1 ? ' · со 2-го этапа' : ''}</i>` +
          `<i>${gives || '—'}</i><i>дружит: ${rule.friends.map((f) => BLOCKS.find((b) => b.id === f)?.short ?? f).join(', ')}</i>`,
      );
    });
  }

  private clients(): void {
    this.label(40, 22, `<b>КТО ПЛАТИТ · типов клиентов ${CLIENT_TYPES.length}, аудиторий ${IDEAS.aud.length}</b>`, 'left');
    const sample = IDEAS.aud[0];
    // weakest first: the order a startup meets them in
    [...CLIENT_TYPES].reverse().forEach((t, k) => {
      const x = 192 + k * 384;
      const y = 330;
      const who = t.pool === 'aud' ? sample : IDEAS[t.pool][0];
      const h = CLIENT_LOOK[t.id].height * 1.35;
      if (t.id === 'mid') this.picture(who.texture, x - 46 * 1.35, y - 20 * 1.35, h * 0.82);
      this.picture(who.texture, x, y, h);
      const pay = t.pay > 0 ? `$${t.pay}` : `чек аудитории ×${String(t.aud_mult).replace('.', ',')}`;
      const special = t.churn > 0 ? `закрывается сам: ${Math.round(t.churn * 100)}% за релиз` : t.pays_waiting ? '—' : 'не платит, пока не получит свой блок';
      this.label(
        x,
        y + 10,
        `<b>${t.title}</b> · ${pay}<i>терпение ${t.patience} спр. · с ${t.from_stage}-го этапа</i>` +
          `<i>ждёт: ${t.asks === 'corp' ? 'блок для крупных' : 'блок, который просит рынок'}</i><i>${special}</i>`,
      );
    });
    IDEAS.aud.forEach((a, k) => {
      const x = 130 + k * 237;
      const y = 690;
      this.picture(a.texture, x, y, 132);
      this.label(x, y + 10, `<b>для ${a.name}</b><i>$${a.pay} за спринт</i><i>${(a.does || 'без особенностей').replace(', ', '</i><i>')}</i>`);
    });
    const big = [...IDEAS.corp, IDEAS.startup[0], IDEAS.gov[0]];
    big.forEach((c, k) => {
      const x = 130 + k * 237;
      const y = 990;
      this.picture(c.texture, x, y, 122);
      this.label(x, y + 8, `<b>${c.name}</b>`);
    });
  }

  private picture(texture: string, x: number, y: number, height: number): void {
    const img = this.add.image(x, y, `node_${texture}`).setOrigin(0.5, 1);
    img.setScale(height / img.height);
  }

  private label(x: number, y: number, html: string, cls = ''): void {
    const el = document.createElement('div');
    el.className = `bl-tag small ${cls}`;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.background = 'none';
    el.innerHTML = html;
    this.labels.append(el);
  }
}
