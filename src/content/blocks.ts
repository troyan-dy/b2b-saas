import { rect, ring, type Stroke } from '../view/iso';

/** What a block is for: decides the rare fill on its side. */
export type BlockGroup = 'core' | 'sell' | 'ai' | 'corp';

export interface BlockKind {
  id: string;
  /** written on the side of the module: nine letters at most */
  short: string;
  /** the full name, for the shelf */
  name: string;
  /** one dry line for the shelf: the joke lives here */
  note: string;
  group: BlockGroup;
  /** height of the module on the sheet, px */
  height: number;
  glyph: readonly Stroke[];
}

/** Product blocks: the words and the pictures. The numbers (work, tokens) live in src/data/balance/blocks.json. */
export const BLOCKS: readonly BlockKind[] = [
  {
    id: 'core',
    short: 'ядро',
    name: 'Обёртка над Клодом',
    note: 'ядро продукта: поле ввода и чужая модель',
    group: 'core',
    height: 54,
    glyph: [
      { pts: rect(0.3, 0.3, 0.4, 0.4), fill: 'coral', bare: true },
      { pts: rect(0.4, 0.42, 0.06, 0.14), fill: 'ink', bare: true },
      { pts: rect(0.4, 0.62, 0.06, 0.14), fill: 'ink', bare: true },
    ],
  },
  {
    id: 'landing',
    short: 'лендинг',
    name: 'Лендинг',
    note: '«Мы переосмыслили это с помощью ИИ»',
    group: 'sell',
    height: 40,
    glyph: [
      { pts: rect(0.2, 0.2, 0.6, 0.6), closed: true },
      { pts: [[0.2, 0.36], [0.8, 0.36]] },
      { pts: [[0.3, 0.5], [0.62, 0.5]] },
      { pts: rect(0.3, 0.6, 0.22, 0.1), fill: 'ink', bare: true },
    ],
  },
  {
    id: 'pay',
    short: 'оплата',
    name: 'Приём оплаты',
    note: 'без него клиенты платят словом «спасибо»',
    group: 'sell',
    height: 40,
    glyph: [
      { pts: rect(0.2, 0.28, 0.6, 0.44), closed: true },
      { pts: rect(0.2, 0.38, 0.6, 0.08), fill: 'ink', bare: true },
      { pts: rect(0.28, 0.56, 0.14, 0.08), closed: true },
    ],
  },
  {
    id: 'sso',
    short: 'вход SSO',
    name: 'Вход по корпоративной почте',
    note: 'закупщики зовут это SSO и без него не разговаривают',
    group: 'corp',
    height: 46,
    glyph: [
      { pts: rect(0.3, 0.46, 0.4, 0.3), closed: true },
      { pts: ring(0.5, 0.46, 0.13, 10, Math.PI, Math.PI * 2) },
      { pts: rect(0.47, 0.56, 0.06, 0.1), fill: 'ink', bare: true },
    ],
  },
  {
    id: 'crm',
    short: 'CRM',
    name: 'Интеграция с CRM',
    note: 'никто не знает зачем, но в таблице требований есть',
    group: 'corp',
    height: 46,
    glyph: [
      { pts: rect(0.18, 0.4, 0.2, 0.2), closed: true },
      { pts: rect(0.62, 0.4, 0.2, 0.2), closed: true },
      { pts: [[0.38, 0.5], [0.62, 0.5]] },
    ],
  },
  {
    id: 'dash',
    short: 'дашборд',
    name: 'Дашборд',
    note: 'графики, которые открывают один раз — на демо',
    group: 'sell',
    height: 40,
    glyph: [
      { pts: rect(0.24, 0.56, 0.12, 0.2), fill: 'ink', bare: true },
      { pts: rect(0.44, 0.42, 0.12, 0.34), fill: 'ink', bare: true },
      { pts: rect(0.64, 0.26, 0.12, 0.5), fill: 'ink', bare: true },
    ],
  },
  {
    id: 'bot',
    short: 'поддержка',
    name: 'ИИ-поддержка',
    note: 'Клод отвечает клиентам за Клода',
    group: 'ai',
    height: 46,
    glyph: [
      { pts: [[0.22, 0.28], [0.78, 0.28], [0.78, 0.62], [0.46, 0.62], [0.34, 0.76], [0.34, 0.62], [0.22, 0.62]], closed: true },
      { pts: rect(0.36, 0.42, 0.06, 0.06), fill: 'coral', bare: true },
      { pts: rect(0.47, 0.42, 0.06, 0.06), fill: 'coral', bare: true },
      { pts: rect(0.58, 0.42, 0.06, 0.06), fill: 'coral', bare: true },
    ],
  },
  {
    id: 'api',
    short: 'API',
    name: 'Публичный API',
    note: 'чтобы другие обёртки могли оборачивать твою',
    group: 'ai',
    height: 46,
    glyph: [
      { pts: [[0.36, 0.3], [0.22, 0.5], [0.36, 0.7]] },
      { pts: [[0.64, 0.3], [0.78, 0.5], [0.64, 0.7]] },
      { pts: [[0.56, 0.3], [0.44, 0.7]] },
    ],
  },
  {
    id: 'mobile',
    short: 'мобайл',
    name: 'Мобильное приложение',
    note: 'тот же сайт, но его можно скачать',
    group: 'sell',
    height: 40,
    glyph: [
      { pts: rect(0.36, 0.2, 0.28, 0.6), closed: true },
      { pts: [[0.44, 0.72], [0.56, 0.72]] },
    ],
  },
  {
    id: 'shield',
    short: 'SOC 2',
    name: 'Сертификат безопасности',
    note: 'PDF с печатью; открывает двери корпораций',
    group: 'corp',
    height: 52,
    glyph: [
      { pts: [[0.5, 0.2], [0.76, 0.3], [0.72, 0.6], [0.5, 0.8], [0.28, 0.6], [0.24, 0.3]], closed: true },
      { pts: [[0.4, 0.5], [0.48, 0.6], [0.62, 0.4]] },
    ],
  },
  {
    id: 'dark',
    short: 'тёмная',
    name: 'Тёмная тема',
    note: 'самая запрашиваемая функция в истории отрасли',
    group: 'sell',
    height: 40,
    glyph: [
      { pts: ring(0.5, 0.5, 0.26, 18), closed: true },
      { pts: ring(0.5, 0.5, 0.26, 10, Math.PI / 2, (Math.PI * 3) / 2), fill: 'ink', bare: true },
    ],
  },
  {
    id: 'cheap',
    short: 'эконом',
    name: 'Модель подешевле',
    note: 'клиенты не заметили. Счёт за токены — заметил',
    group: 'ai',
    height: 46,
    glyph: [
      { pts: rect(0.26, 0.26, 0.48, 0.12), closed: true },
      { pts: rect(0.26, 0.44, 0.48, 0.12), closed: true },
      { pts: rect(0.26, 0.62, 0.48, 0.12), closed: true },
    ],
  },
  {
    id: 'excel',
    short: 'Excel',
    name: 'Экспорт в Excel',
    note: 'единственная функция, которой пользуются все',
    group: 'sell',
    height: 40,
    glyph: [
      { pts: rect(0.2, 0.24, 0.6, 0.52), closed: true },
      { pts: [[0.4, 0.24], [0.4, 0.76]] },
      { pts: [[0.6, 0.24], [0.6, 0.76]] },
      { pts: [[0.2, 0.42], [0.8, 0.42]] },
      { pts: [[0.2, 0.59], [0.8, 0.59]] },
    ],
  },
  {
    id: 'push',
    short: 'пуши',
    name: 'Пуш-уведомления',
    note: '«Вы давно не заходили» — в три часа ночи',
    group: 'sell',
    height: 40,
    glyph: [
      { pts: [[0.5, 0.2], [0.66, 0.34], [0.7, 0.62], [0.78, 0.7], [0.22, 0.7], [0.3, 0.62], [0.34, 0.34]], closed: true },
      { pts: rect(0.45, 0.72, 0.1, 0.08), fill: 'coral', bare: true },
    ],
  },
  {
    id: 'roles',
    short: 'роли',
    name: 'Роли и права',
    note: 'чтобы стажёр не удалил всё. Он всё равно удалит',
    group: 'corp',
    height: 46,
    glyph: [
      { pts: ring(0.36, 0.38, 0.1, 12), closed: true },
      { pts: ring(0.36, 0.74, 0.18, 10, Math.PI, Math.PI * 2) },
      { pts: ring(0.66, 0.38, 0.1, 12), closed: true },
      { pts: ring(0.66, 0.74, 0.18, 10, Math.PI, Math.PI * 2) },
    ],
  },
];

export const BLOCK_BY_ID: Readonly<Record<string, BlockKind>> = Object.fromEntries(BLOCKS.map((b) => [b.id, b]));
