'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Lang = 'ar' | 'en';

const dict = {
  ar: {
    app: 'لوحة',
    demoNote: 'نسخة تجريبية: البيانات أمثلة ومحفوظة في متصفحك بس.',
    signInTitle: 'ادخل كـ',
    signInHelp: 'تسجيل الدخول الحقيقي بالإيميل وجوجل بيتضاف في مرحلة الباك إند. اختار شخص تجرّب بيه.',
    roleAdmin: 'مدير', roleMember: 'عضو', roleViewer: 'مشاهد فقط', roleGuest: 'ضيف',
    home: 'الرئيسية', myWork: 'شغلي', inbox: 'الإشعارات', search: 'ابحث',
    newBoard: 'لوحة جديدة', boardNamePrompt: 'اسم اللوحة',
    tableView: 'الجدول الرئيسي', kanbanView: 'كانبان', calendarView: 'تقويم', soon: 'قريبًا',
    newItem: 'جديد', searchItems: 'ابحث في اللوحة', mine: 'المكلّف بيها أنا', clearFilters: 'مسح الفلاتر',
    addItem: '+ أضف', addGroup: 'مجموعة جديدة', groupMenu: 'خيارات المجموعة', collapse: 'طي المجموعة', expand: 'فتح المجموعة',
    renameGroup: 'إعادة تسمية', deleteGroup: 'حذف المجموعة', deleteItem: 'حذف', openItem: 'فتح', rename: 'إعادة تسمية', itemMenu: 'خيارات',
    deleted: 'تم الحذف', undo: 'تراجع', saved: 'اتحفظ', statusChanged: 'الحالة بقت',
    emptyBoard: 'اللوحة فاضية. أضف أول عنصر وابدأ.', emptyFilter: 'مفيش حاجة تطابق البحث أو الفلتر', emptyGroup: 'مفيش عناصر هنا لسه',
    item: 'العنصر', unassigned: 'مش متكلّف بيها حد', assignMe: 'كلّفني أنا', clear: 'مسح', today: 'النهارده', tomorrow: 'بكرة', nextWeek: 'الأسبوع الجاي',
    editLabels: 'تعديل التسميات', overdue: 'متأخر', viewOnly: 'للعرض فقط', viewOnlyError: 'حسابك للعرض فقط، مش هتقدر تعدّل',
    invalidNumber: 'اكتب رقم، مثلًا 500', liveSync: 'مباشر', liveHelp: 'افتح الصفحة دي في تابة تانية وعدّل، هتشوف التغيير هنا فورًا.',
    total: 'المجموع', notFound: 'اللوحة دي مش موجودة أو اتحذفت.', backHome: 'رجوع للرئيسية', loading: 'بيحمّل',
    theme: 'الوضع الليلي', language: 'English', signOut: 'خروج', members: 'أعضاء اللوحة', invite: 'دعوة',
    dropHere: 'اسحب هنا', moveTo: 'نقل إلى', boards: 'اللوح', recent: 'آخر اللوح', welcome: 'أهلًا', homeHelp: 'اختار لوحة من الشمال أو ابدأ واحدة جديدة.',

    details: 'التفاصيل', files: 'الملفات', activity: 'النشاط', close: 'اقفل',
    writeUpdate: 'اكتب تحديث… استخدم @ عشان تذكر حد', send: 'إرسال', attach: 'إرفاق ملف', reply: 'رد', edit: 'تعديل', edited: 'متعدّل', save: 'حفظ',
    noUpdates: 'مفيش تحديثات لسه. اكتب أول تحديث وذكر حد من الفريق بـ @.', noFiles: 'مفيش ملفات على العنصر ده.', noActivity: 'مفيش نشاط مسجّل.',
    fileTooLarge: 'الملف أكبر من ٢ ميجا (حد النسخة التجريبية)', mentionNoAccess: 'مش هيقدر يشوف اللوحة',
    subitems: 'مهام فرعية', addSubitem: '+ أضف مهمة فرعية', showSubitems: 'اعرض المهام الفرعية', hideSubitems: 'اخفي المهام الفرعية',
    addColumn: 'إضافة عمود', columnMenu: 'خيارات العمود', renameColumn: 'إعادة تسمية العمود', deleteColumn: 'حذف العمود', columnDeleted: 'اتحذف العمود',
    deleteColumnConfirm: 'هتتمسح كل القيم في العمود ده. متأكد؟', confirmDelete: 'أيوه، احذف',
    newOption: 'اختيار جديد', addOption: 'إضافة', from: 'من', to: 'إلى', upload: 'رفع ملف', openLink: 'فتح الرابط', urlLabel: 'النص (اختياري)',
    invalidValue: 'القيمة دي مش مظبوطة', inboxEmpty: 'مفيش إشعارات. أول ما حد يذكرك أو يكلّفك بحاجة هتلاقيها هنا.', markAllRead: 'علّم الكل كمقروء',
    all: 'الكل', unread: 'غير مقروء', mentions: 'المنشن', assigned: 'التكليفات',
    nMention: 'ذكرك في', nAssigned: 'كلّفك بـ', nUpdate: 'كتب تحديث على',
    myWorkEmpty: 'مفيش حاجة متكلّف بيها دلوقتي.', overdueGroup: 'متأخر', todayGroup: 'النهارده', weekGroup: 'خلال أسبوع', laterGroup: 'بعدين', noDateGroup: 'من غير تاريخ', doneGroup: 'خلصت',
    showDone: 'اعرض اللي خلص', board: 'اللوحة', justNow: 'دلوقتي', you: 'انت',
    aCreated: 'أضاف العنصر', aName: 'غيّر الاسم', aCell: 'غيّر', aMoved: 'نقل العنصر لمجموعة تانية', aDeleted: 'حذف العنصر', aRestored: 'رجّع العنصر',
    items: 'عنصر', sidebarToggle: 'القائمة', closeMenu: 'اقفل القائمة', updates: 'تحديثات', cancel: 'إلغاء', create: 'إنشاء',
  },
  en: {
    app: 'Lawha',
    demoNote: 'Demo build: sample data, saved only in your browser.',
    signInTitle: 'Continue as',
    signInHelp: 'Real email and Google sign-in arrive with the backend stage. Pick someone to try it as.',
    roleAdmin: 'Admin', roleMember: 'Member', roleViewer: 'View only', roleGuest: 'Guest',
    home: 'Home', myWork: 'My work', inbox: 'Inbox', search: 'Search',
    newBoard: 'New board', boardNamePrompt: 'Board name',
    tableView: 'Main table', kanbanView: 'Kanban', calendarView: 'Calendar', soon: 'Soon',
    newItem: 'New', searchItems: 'Search this board', mine: 'Assigned to me', clearFilters: 'Clear filters',
    addItem: '+ Add', addGroup: 'New group', groupMenu: 'Group options', collapse: 'Collapse group', expand: 'Expand group',
    renameGroup: 'Rename', deleteGroup: 'Delete group', deleteItem: 'Delete', openItem: 'Open', rename: 'Rename', itemMenu: 'Options',
    deleted: 'Deleted', undo: 'Undo', saved: 'Saved', statusChanged: 'Status is now',
    emptyBoard: 'This board is empty. Add your first item.', emptyFilter: 'Nothing matches this search or filter', emptyGroup: 'No items here yet',
    item: 'Item', unassigned: 'Unassigned', assignMe: 'Assign me', clear: 'Clear', today: 'Today', tomorrow: 'Tomorrow', nextWeek: 'Next week',
    editLabels: 'Edit labels', overdue: 'Overdue', viewOnly: 'View only', viewOnlyError: 'Your account is view only',
    invalidNumber: 'Enter a number, e.g. 500', liveSync: 'Live', liveHelp: 'Open this page in another tab and edit; changes show here at once.',
    total: 'Total', notFound: 'This board does not exist or was deleted.', backHome: 'Back to home', loading: 'Loading',
    theme: 'Dark mode', language: 'العربية', signOut: 'Sign out', members: 'Board members', invite: 'Invite',
    dropHere: 'Drop here', moveTo: 'Move to', boards: 'Boards', recent: 'Recent boards', welcome: 'Welcome', homeHelp: 'Pick a board from the sidebar or start a new one.',

    details: 'Details', files: 'Files', activity: 'Activity', close: 'Close',
    writeUpdate: 'Write an update… use @ to mention someone', send: 'Send', attach: 'Attach file', reply: 'Reply', edit: 'Edit', edited: 'edited', save: 'Save',
    noUpdates: 'No updates yet. Write the first one and @mention a teammate.', noFiles: 'No files on this item.', noActivity: 'No activity recorded.',
    fileTooLarge: 'File is over 2 MB (demo limit)', mentionNoAccess: 'cannot see this board',
    subitems: 'Subitems', addSubitem: '+ Add subitem', showSubitems: 'Show subitems', hideSubitems: 'Hide subitems',
    addColumn: 'Add column', columnMenu: 'Column options', renameColumn: 'Rename column', deleteColumn: 'Delete column', columnDeleted: 'Column deleted',
    deleteColumnConfirm: 'Every value in this column will be removed. Delete it?', confirmDelete: 'Yes, delete',
    newOption: 'New option', addOption: 'Add', from: 'From', to: 'To', upload: 'Upload file', openLink: 'Open link', urlLabel: 'Text (optional)',
    invalidValue: 'That value is not valid', inboxEmpty: 'No notifications. Mentions and assignments will show up here.', markAllRead: 'Mark all read',
    all: 'All', unread: 'Unread', mentions: 'Mentions', assigned: 'Assigned',
    nMention: 'mentioned you in', nAssigned: 'assigned you to', nUpdate: 'posted an update on',
    myWorkEmpty: 'Nothing is assigned to you right now.', overdueGroup: 'Overdue', todayGroup: 'Today', weekGroup: 'Next 7 days', laterGroup: 'Later', noDateGroup: 'No date', doneGroup: 'Done',
    showDone: 'Show done', board: 'Board', justNow: 'just now', you: 'you',
    aCreated: 'created the item', aName: 'renamed it', aCell: 'changed', aMoved: 'moved it to another group', aDeleted: 'deleted it', aRestored: 'restored it',
    items: 'items', sidebarToggle: 'Menu', closeMenu: 'Close menu', updates: 'updates', cancel: 'Cancel', create: 'Create',
  },
} as const;

export type MsgKey = keyof (typeof dict)['ar'];

interface LangCtx { lang: Lang; setLang: (l: Lang) => void; t: (k: MsgKey) => string; locale: string }
const Ctx = createContext<LangCtx | null>(null);

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('ar');
  useEffect(() => {
    try { const s = localStorage.getItem('lawha:lang'); if (s === 'en' || s === 'ar') setLangState(s); } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try { localStorage.setItem('lawha:lang', l); } catch { /* ignore */ }
  }, []);
  const value = useMemo<LangCtx>(() => ({
    lang, setLang,
    t: (k) => dict[lang][k],
    // Latin digits in Arabic UI: easier to read in tables and matches how prices are written in the UAE
    locale: lang === 'ar' ? 'ar-AE-u-nu-latn' : 'en-GB',
  }), [lang, setLang]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLang() {
  const c = useContext(Ctx);
  if (!c) throw new Error('LangProvider missing');
  return c;
}
