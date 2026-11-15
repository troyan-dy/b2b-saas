import { L } from '../core/lang';
import { PALETTE } from '../data/palette';

export const BUILD_CATEGORIES = ['product', 'growth', 'service', 'infra'] as const;
export type BuildCategory = (typeof BUILD_CATEGORIES)[number];
export const CATEGORY_TITLE: Record<BuildCategory, string> = {
  product: L('Продукт', 'Product'),
  growth: L('Продажи', 'Growth'),
  service: L('Сервис', 'Service'),
  infra: L('Инфра', 'Infra'),
};
export const CATEGORY_COLOR: Record<BuildCategory, number> = {
  product: PALETTE.blue,
  growth: PALETTE.sage,
  service: PALETTE.sand,
  infra: PALETTE.coral,
};
const IDS: Record<BuildCategory, readonly string[]> = {
  product: ['core', 'dash', 'mobile', 'api', 'excel', 'dark', 'webhook'],
  growth: ['landing', 'pay', 'wait', 'ref', 'push', 'ab'],
  service: ['bot', 'onb', 'crm', 'c1', 'help', 'portal'],
  infra: ['cheap', 'sso', 'shield', 'roles', 'audit', 'cache', 'monitor'],
};
export function buildCategory(id: string): BuildCategory {
  return BUILD_CATEGORIES.find((category) => IDS[category].includes(id)) ?? 'product';
}
