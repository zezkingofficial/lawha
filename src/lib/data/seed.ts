import { generateNKeysBetween } from 'fractional-indexing';
import type { Account, ActivityEntry, Asset, Board, Column, Group, Item, Notification, Profile, StatusLabel, Update, Workspace } from './types';

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
  updates: Update[];
  assets: Asset[];
  notifications: Notification[];
  subscriptions: { userId: string; itemId: string }[];
  activity: ActivityEntry[];
}

export const DB_VERSION = 2;

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

  const ck = keys(8);
  const columns: Column[] = [
    col('c-o-owner', 'b-orders', 'المسؤول', 'people', ck[0], {}, 120),
    col('c-o-status', 'b-orders', 'الحالة', 'status', ck[1], { labels: ORDER_LABELS }, 150),
    col('c-o-date', 'b-orders', 'التسليم', 'date', ck[2], {}, 120),
    col('c-o-qty', 'b-orders', 'الكمية', 'numbers', ck[3], { unit: 'قطعة', unitPosition: 'after' }, 110),
    col('c-o-value', 'b-orders', 'القيمة', 'numbers', ck[4], { unit: 'AED', unitPosition: 'after' }, 130),
    col('c-o-type', 'b-orders', 'نوع العلبة', 'dropdown', ck[5], { options: [
      { id: 'magnet', name: 'مغناطيس' }, { id: 'drawer', name: 'درج' }, { id: 'lid', name: 'غطاء وقاعدة' }, { id: 'carton', name: 'كرتون' },
    ] }, 150),
    col('c-o-phone', 'b-orders', 'واتساب العميل', 'phone', ck[6], {}, 160),
    col('c-o-notes', 'b-orders', 'ملاحظات', 'text', ck[7], {}, 200),
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

  const order = (id: string, g: string, pos: string, name: string, st: string, who: string[], date: string, qty: number, value: number, note = '', type = '', phone = ''): Item => ({
    id, boardId: 'b-orders', groupId: g, parentItemId: null, name, position: pos,
    vals: {
      'c-o-status': { label_id: st },
      'c-o-owner': { user_ids: who },
      'c-o-date': { date },
      'c-o-qty': { number: String(qty) },
      'c-o-value': { number: String(value) },
      ...(note ? { 'c-o-notes': { text: note } } : {}),
      ...(type ? { 'c-o-type': { option_ids: [type] } } : {}),
      ...(phone ? { 'c-o-phone': { phone } } : {}),
    },
    createdBy: 'u-ahmed', deletedAt: null, createdAt: T0, updatedAt: T0,
  });
  const ik = keys(4);
  const items: Item[] = [
    order('i-1', 'g-nov', ik[0], 'علب عطور ٥٠ مل · براند ورد الشيخ', 'prod', ['u-mohamed'], '2026-11-12', 500, 7250, 'طباعة ذهبي على الغطاء', 'lid', '+971 50 000 0001'),
    order('i-2', 'g-nov', ik[1], 'بوكس هدايا شركات · ٢٠٠ قطعة', 'design', ['u-sara'], '2026-11-18', 200, 9400, '', 'drawer'),
    order('i-3', 'g-nov', ik[2], 'علب ملابس مغناطيس · متجر لمسة', 'stuck', ['u-mohamed', 'u-ahmed'], '2026-11-05', 300, 5100, 'مستني موافقة العميل على اللون', 'magnet', '+971 55 000 0002'),
    order('i-4', 'g-nov', ik[3], 'طقم عطر كامل: زجاجة + غطاء + علبة', 'quote', ['u-ahmed'], '2026-11-20', 1000, 24500),
    order('i-5', 'g-ready', ik[0], 'علب بخور فاخرة · عود الإمارات', 'ready', ['u-sara'], '2026-11-09', 150, 3300),
    order('i-6', 'g-ready', ik[1], 'أكياس ورقية مطبوعة', 'done', ['u-mohamed'], '2026-11-03', 800, 2400),
    {
      id: 'i-p-1', boardId: 'b-production', groupId: 'g-prod-1', parentItemId: null, name: 'قص كرتون علب العطور', position: ik[0],
      vals: { 'c-b-production-status': { label_id: 'working' }, 'c-b-production-owner': { user_ids: ['u-mohamed'] } },
      createdBy: 'u-ahmed', deletedAt: null, createdAt: T0, updatedAt: T0,
    },
  ];

  // subitems on the first order (and the board's subitem columns)
  const sk = keys(3);
  columns.push(
    { ...col('c-o-sub-owner', 'b-orders', 'المسؤول', 'people', sk[0], {}, 120), scope: 'subitem' },
    { ...col('c-o-sub-status', 'b-orders', 'الحالة', 'status', sk[1], { labels: DEFAULT_LABELS }, 150), scope: 'subitem' },
    { ...col('c-o-sub-date', 'b-orders', 'التاريخ', 'date', sk[2], {}, 120), scope: 'subitem' },
  );
  const sub = (id: string, pos: string, name: string, st: string, who: string): Item => ({
    id, boardId: 'b-orders', groupId: null, parentItemId: 'i-1', name, position: pos,
    vals: { 'c-o-sub-status': { label_id: st }, 'c-o-sub-owner': { user_ids: [who] } },
    createdBy: 'u-ahmed', deletedAt: null, createdAt: T0, updatedAt: T0,
  });
  const subKeys = keys(3);
  items.push(
    sub('i-1-a', subKeys[0], 'قص الكرتون المقوى', 'done', 'u-mohamed'),
    sub('i-1-b', subKeys[1], 'طباعة الشعار الذهبي', 'working', 'u-mohamed'),
    sub('i-1-c', subKeys[2], 'تغليف وتجهيز للشحن', 'working', 'u-sara'),
  );

  const updates: Update[] = [
    { id: 'up-1', boardId: 'b-orders', itemId: 'i-3', parentUpdateId: null, authorId: 'u-mohamed',
      bodyText: '@أحمد العميل لسه مأكدش اللون. نستنى ولا نبدأ بالأسود؟', mentionedUserIds: ['u-ahmed'], assetIds: [],
      createdAt: '2026-11-07T10:15:00.000Z', editedAt: null },
    { id: 'up-2', boardId: 'b-orders', itemId: 'i-1', parentUpdateId: null, authorId: 'u-sara',
      bodyText: 'البروفة اتوافق عليها، الطباعة تبدأ بكرة.', mentionedUserIds: [], assetIds: [],
      createdAt: '2026-11-06T14:00:00.000Z', editedAt: null },
  ];
  const notifications: Notification[] = [
    { id: 'n-1', userId: 'u-ahmed', kind: 'mention', actorId: 'u-mohamed', boardId: 'b-orders', itemId: 'i-3', updateId: 'up-1', readAt: null, createdAt: '2026-11-07T10:15:00.000Z' },
  ];
  const subscriptions = [
    { userId: 'u-ahmed', itemId: 'i-3' }, { userId: 'u-mohamed', itemId: 'i-3' },
    { userId: 'u-sara', itemId: 'i-1' }, { userId: 'u-mohamed', itemId: 'i-1' },
  ];

  return {
    version: DB_VERSION, account: { id: ACC, name: 'تفصيل بوكسز' }, members, workspaces, boards, groups, columns, items,
    updates, assets: [], notifications, subscriptions, activity: [],
  };
}
