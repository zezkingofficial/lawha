// Types mirror replica/schema.sql. The Supabase data layer (replica-backend)
// must return exactly these shapes so no screen code changes when it swaps in.

export type Role = 'admin' | 'member' | 'viewer' | 'guest';

export type LabelColor =
  | 'green' | 'orange' | 'red' | 'blue' | 'purple' | 'teal' | 'pink'
  | 'navy' | 'brown' | 'grey' | 'yellow' | 'lime' | 'empty';

export interface Profile {
  id: string;
  fullName: string;
  color: LabelColor;
  role: Role;
}

export interface Account {
  id: string;
  name: string;
}

export interface Workspace {
  id: string;
  accountId: string;
  name: string;
  kind: 'open' | 'closed';
  position: string;
}

export interface Board {
  id: string;
  accountId: string;
  workspaceId: string;
  name: string;
  description: string;
  kind: 'main' | 'shareable' | 'private';
  itemNoun: string;
  position: string;
  createdBy: string | null;
  deletedAt: string | null;
}

export interface Group {
  id: string;
  boardId: string;
  title: string;
  color: LabelColor;
  position: string;
  deletedAt: string | null;
}

export type ColumnType =
  | 'status' | 'people' | 'date' | 'text' | 'numbers'
  | 'long_text' | 'dropdown' | 'checkbox' | 'phone' | 'timeline' | 'files' | 'link' | 'email';

export interface StatusLabel {
  id: string;
  name: string;
  color: LabelColor;
  done: boolean;
}

export interface DropdownOption { id: string; name: string }

export interface ColumnSettings {
  labels?: StatusLabel[];
  options?: DropdownOption[];
  unit?: string;
  unitPosition?: 'before' | 'after';
}

export interface Column {
  id: string;
  boardId: string;
  scope: 'item' | 'subitem';
  title: string;
  type: ColumnType;
  settings: ColumnSettings;
  position: string;
  width: number;
}

export type StatusValue = { label_id: string };
export type PeopleValue = { user_ids: string[] };
export type DateValue = { date: string }; // YYYY-MM-DD, a calendar date with no time zone
export type TextValue = { text: string };
export type NumbersValue = { number: string };
export type DropdownValue = { option_ids: string[] };
export type CheckboxValue = { checked: boolean };
export type PhoneValue = { phone: string };
export type TimelineValue = { from: string; to: string };
export type FilesValue = { asset_ids: string[] };
export type LinkValue = { url: string; label?: string };
export type EmailValue = { email: string };
export type CellValue =
  | StatusValue | PeopleValue | DateValue | TextValue | NumbersValue
  | DropdownValue | CheckboxValue | PhoneValue | TimelineValue | FilesValue | LinkValue | EmailValue;

export interface Item {
  id: string;
  boardId: string;
  groupId: string | null;
  parentItemId: string | null;
  name: string;
  vals: Record<string, CellValue>;
  position: string;
  createdBy: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Update {
  id: string;
  boardId: string;
  itemId: string;
  parentUpdateId: string | null;
  authorId: string | null;
  bodyText: string;          // plain text; mentions appear as @Name and are listed in mentionedUserIds
  mentionedUserIds: string[];
  assetIds: string[];
  createdAt: string;
  editedAt: string | null;
}

export interface Asset {
  id: string;
  boardId: string;
  itemId: string | null;
  updateId: string | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  url: string;               // fake layer: a data: URL; Supabase: a signed storage URL
  uploadedBy: string | null;
  createdAt: string;
}

export type NotificationKind = 'mention' | 'assigned' | 'update';

export interface Notification {
  id: string;
  userId: string;
  kind: NotificationKind;
  actorId: string | null;
  boardId: string;
  itemId: string;
  updateId: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface ActivityEntry {
  id: string;
  boardId: string;
  itemId: string;
  actorId: string | null;
  action: 'item_created' | 'name_changed' | 'cell_changed' | 'item_moved' | 'item_deleted' | 'item_restored';
  columnId: string | null;
  before: unknown;
  after: unknown;
  createdAt: string;
}

export interface MyWorkRow {
  item: Item;
  board: Board;
  date: string | null;        // first date column with a value
  statusLabel: StatusLabel | null;
  done: boolean;
}

export interface NewFile { name: string; type: string; size: number; dataUrl: string }

export interface BoardBundle {
  board: Board;
  groups: Group[];   // ordered by position, deleted excluded
  columns: Column[]; // ordered by position
  items: Item[];     // ordered by position, deleted excluded
  updateCounts: Record<string, number>; // item id -> number of updates (replies included)
}

export interface Place {
  groupId: string;
  beforeId?: string | null; // item that will come right before
  afterId?: string | null;  // item that will come right after
}

export interface DataLayer {
  // session (Supabase Auth later)
  me(): Promise<Profile | null>;
  signIn(userId: string): Promise<Profile>;
  signOut(): Promise<void>;
  members(): Promise<Profile[]>;
  account(): Promise<Account>;

  // structure
  workspaces(): Promise<Workspace[]>;
  boards(workspaceId: string): Promise<Board[]>;
  getBoard(boardId: string): Promise<BoardBundle | null>;
  createBoard(workspaceId: string, name: string): Promise<Board>;
  renameBoard(boardId: string, name: string): Promise<void>;

  createGroup(boardId: string, title: string): Promise<Group>;
  renameGroup(groupId: string, title: string): Promise<void>;
  deleteGroup(groupId: string): Promise<void>;
  restoreGroup(groupId: string): Promise<void>;

  // items
  createItem(boardId: string, name: string, place: Place): Promise<Item>;
  renameItem(itemId: string, name: string): Promise<void>;
  setCell(itemId: string, columnId: string, value: CellValue | null): Promise<Item>;
  moveItem(itemId: string, place: Place): Promise<void>;
  deleteItem(itemId: string): Promise<void>;
  restoreItem(itemId: string): Promise<void>;

  // columns
  createColumn(boardId: string, type: ColumnType, title: string, scope?: 'item' | 'subitem'): Promise<Column>;
  renameColumn(columnId: string, title: string): Promise<void>;
  deleteColumn(columnId: string): Promise<void>;
  updateColumnSettings(columnId: string, settings: ColumnSettings): Promise<void>;

  // subitems: the first one also creates the board's subitem columns
  createSubitem(parentItemId: string, name: string): Promise<Item>;

  // item card
  updates(itemId: string): Promise<Update[]>;
  postUpdate(itemId: string, bodyText: string, mentionedUserIds: string[], opts?: { parentUpdateId?: string; files?: NewFile[] }): Promise<Update>;
  editUpdate(updateId: string, bodyText: string): Promise<void>;
  deleteUpdate(updateId: string): Promise<void>;
  assets(itemId: string): Promise<Asset[]>;
  uploadToCell(itemId: string, columnId: string, file: NewFile): Promise<Asset>;
  activity(itemId: string): Promise<ActivityEntry[]>;

  // personal
  notifications(): Promise<Notification[]>;
  markRead(ids: string[] | 'all'): Promise<void>;
  myWork(): Promise<MyWorkRow[]>;

  // realtime: called whenever this board changes, here or in another tab/device
  subscribe(boardId: string, onChange: () => void): () => void;
  subscribeAll(onChange: () => void): () => void;
}
