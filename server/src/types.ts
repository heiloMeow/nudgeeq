export type Role = {
  id: string;
  name: string;
  avatar: string;     // /avatars/xxx.png
  signals: string[];
  tableId: string;
  seatId: number;     // 1..6
  createdAt: string;
};

export type TableRow = {
  id: string;
  seats: (string | null)[]; // role ids
};

export type DB = {
  roles: Role[];
  tables: TableRow[];
};
