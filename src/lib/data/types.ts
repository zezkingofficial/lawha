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

export type ColumnType = 'status' | 'people' | 'date' | 'text' | 'numbers';

export interface StatusLabel {
  id: string;
  name: string;
  color: LabelColor;
  done: boolean;
}

export interface ColumnSettings {
  labels?: StatusLabel[];
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
export type CellValue = StatusValue | PeopleValue | DateValue | TextValue | NumbersValue;

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

export interface BoardBundle {
  board: Board;
  groups: Group[];   // ordered by position, deleted excluded
  columns: Column[]; // ordered by position
  items: Item[];     // ordered by position, deleted excluded
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

  // realtime: called whenever this board changes, here or in another tab/device
  subscribe(boardId: string, onChange: () => void): () => void;
  subscribeAll(onChange: () => void): () => void;
}
