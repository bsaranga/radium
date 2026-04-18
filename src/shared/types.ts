export type Book = {
  id: string;
  title: string;
  author: string | null;
  format: 'pdf' | 'epub';
  filePath: string;
  coverPath: string | null;
  addedAt: number;
  lastOpenedAt: number | null;
  position: string | null;
};
