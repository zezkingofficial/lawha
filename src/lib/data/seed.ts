import { generateNKeysBetween } from 'fractional-indexing';
import type { Account, Board, Column, Group, Item, Profile, StatusLabel, Workspace } from './types';

// Example data for the Tafseel build. Every order below is a sample, not a real customer.

export interface DB {
  version: number;
  account: Account;
  members: Profile[];
  workspaces: Workspace[];
  boards: Board[];
  groups: Group[];
  columns: Column[];
  items: Item[];
}

export const ORDER_LABELS: StatusLabel[] = [
  { id: 'quote', name: 'عرض سعر', color: 'grey', done: false },
  { id: 'design', name: 'تصميم', color: 'purple', done: false },
  { id: 'prod', name: 'في الإنتاج', color: 'orange', done: false },
  { id: 'stuck', name: 'متوقف', color: 'red', done: false },
  { id: 'ready', name: 'جاهز', color: 'blue', done: false },
  { id: 'done', name: 'تم التسليم', color: 'green', done: true },
];

export const DEFAULT_LABELS: StatusLabel[] = [
  { id: 'working', name: 'قيد التنفيذ', color: 'orange', done: false },
  { id: 'done', name: 'تم', color: 'green', done: true },
  { id: 'stuck', name: 'متوقف', color: 'red', done: false },
];

const T0 = '2026-11-01T08:00:00.000Z';
const ACC = 'acc-tafseel';

function keys(n: number) {
  return generateNKeysBetween(null, null, n);
}

function board(id: string, ws: string, name: string, description: string, noun: string, pos: string): Board {
  return { id, accountId: ACC, workspaceId: ws, name, description, kind: 'main', itemNoun: noun, position: pos, createdBy: 'u-ahmed', deletedAt: null };
}

function col(id: string, boardId: string, title: string, type: Column['type'], pos: string, settings: Column['settings'] = {}, width = 140): Column {
  return { id, boardId, scope: 'item', title, type, settings, position: pos, width };
}

export function makeSeed(): DB {
  const members: Profile[] = [
    { id: 'u-ahmed', fullName: 'أحمد', color: 'teal', role: 'admin' },
    { id: 'u-sara', fullName: 'سارة', color: 'purple', role: 'member' },
    { id: 'u-mohamed', fullName: 'محمد', color: 'orange', role: 'member' },
    { id: 'u-yousef', fullName: 'يوسف', color: 'navy', role: 'viewer' },
  ];
  const wk = keys(2);
  const workspaces: Workspace[] = [
    { id: 'ws-factory', accountId: ACC, name: 'المصنع', kind: 'open', position: wk[0] },
    { id: 'ws-sales', accountId: ACC, name: 'المبيعات', kind: 'open', position: wk[1] },
  ];
  const bk = keys(4);
  const boards: Board[] = [
    board('b-orders', 'ws-factory', 'طلبات العملاء', 'كل طلب من أول عرض السعر لحد التسليم', 'طلب', bk[0]),
    board('b-production', 'ws-factory', 'خط الإنتاج', 'مراحل التصنيع لكل طلب', 'مهمة', bk[1]),
    board('b-delivery', 'ws-factory', 'التسليمات', 'مواعيد ومكان التسليم', 'تسليم', bk[2]),
    board('b-leads', 'ws-sales', 'عملاء محتملين', 'استفسارات واتساب وإنستجرام', 'عميل', bk[3]),
  ];

  const ck = keys(6);
  const columns: Column[] = [
    col('c-o-owner', 'b-orders', 'المسؤول', 'people', ck[0], {}, 120),
    col('c-o-status', 'b-orders', 'الحالة', 'status', ck[1], { labels: ORDER_LABELS }, 150),
    col('c-o-date', 'b-orders', 'التسليم', 'date', ck[2], {}, 120),
    col('c-o-qty', 'b-orders', 'الكمية', 'numbers', ck[3], { unit: 'قطعة', unitPosition: 'after' }, 110),
    col('c-o-value', 'b-orders', 'القيمة', 'numbers', ck[4], { unit: 'AED', unitPosition: 'after' }, 130),
    col('c-o-notes', 'b-orders', 'ملاحظات', 'text', ck[5], {}, 200),
  ];
  for (const b of ['b-production', 'b-delivery', 'b-leads']) {
    const k = keys(3);
    columns.push(
      col(`c-${b}-owner`, b, 'المسؤول', 'people', k[0], {}, 120),
      col(`c-${b}-status`, b, 'الحالة', 'status', k[1], { labels: DEFAULT_LABELS }, 150),
      col(`c-${b}-date`, b, 'التاريخ', 'date', k[2], {}, 120),
    );
  }

  const gk = keys(2);
  const groups: Group[] = [
    { id: 'g-nov', boardId: 'b-orders', title: 'طلبات نوفمبر', color: 'blue', position: gk[0], deletedAt: null },
    { id: 'g-ready', boardId: 'b-orders', title: 'جاهز للتسليم', color: 'green', position: gk[1], deletedAt: null },
    { id: 'g-prod-1', boardId: 'b-production', title: 'الأسبوع ده', color: 'orange', position: gk[0], deletedAt: null },
    { id: 'g-del-1', boardId: 'b-delivery', title: 'مواعيد قادمة', color: 'teal', position: gk[0], deletedAt: null },
    { id: 'g-leads-1', boardId: 'b-leads', title: 'جديد', color: 'purple', position: gk[0], deletedAt: null },
  ];

  const order = (id: string, g: string, pos: string, name: string, st: string, who: string[], date: string, qty: number, value: number, note = ''): Item => ({
    id, boardId: 'b-orders', groupId: g, parentItemId: null, name, position: pos,
    vals: {
      'c-o-status': { label_id: st },
      'c-o-owner': { user_ids: who },
      'c-o-date': { date },
      'c-o-qty': { number: String(qty) },
      'c-o-value': { number: String(value) },
      ...(note ? { 'c-o-notes': { text: note } } : {}),
    },
    createdBy: 'u-ahmed', deletedAt: null, createdAt: T0, updatedAt: T0,
  });
  const ik = keys(4);
  const items: Item[] = [
    order('i-1', 'g-nov', ik[0], 'علب عطور ٥٠ مل · براند ورد الشيخ', 'prod', ['u-mohamed'], '2026-11-12', 500, 7250, 'طباعة ذهبي على الغطاء'),
    order('i-2', 'g-nov', ik[1], 'بوكس هدايا شركات · ٢٠٠ قطعة', 'design', ['u-sara'], '2026-11-18', 200, 9400),
    order('i-3', 'g-nov', ik[2], 'علب ملابس مغناطيس · متجر لمسة', 'stuck', ['u-mohamed', 'u-ahmed'], '2026-11-05', 300, 5100, 'مستني موافقة العميل على اللون'),
    order('i-4', 'g-nov', ik[3], 'طقم عطر كامل: زجاجة + غطاء + علبة', 'quote', ['u-ahmed'], '2026-11-20', 1000, 24500),
    order('i-5', 'g-ready', ik[0], 'علب بخور فاخرة · عود الإمارات', 'ready', ['u-sara'], '2026-11-09', 150, 3300),
    order('i-6', 'g-ready', ik[1], 'أكياس ورقية مطبوعة', 'done', ['u-mohamed'], '2026-11-03', 800, 2400),
    {
      id: 'i-p-1', boardId: 'b-production', groupId: 'g-prod-1', parentItemId: null, name: 'قص كرتون علب العطور', position: ik[0],
      vals: { 'c-b-production-status': { label_id: 'working' }, 'c-b-production-owner': { user_ids: ['u-mohamed'] } },
      createdBy: 'u-ahmed', deletedAt: null, createdAt: T0, updatedAt: T0,
    },
  ];

  return { version: 1, account: { id: ACC, name: 'تفصيل بوكسز' }, members, workspaces, boards, groups, columns, items };
}
