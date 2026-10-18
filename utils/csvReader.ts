import fs from 'fs';
import path from 'path';

export interface UserCredential {
  username: string;
  password: string;
}

/**
 * Reads a simple two-column CSV (user_login_name,password) and returns
 * an array of credential objects. Assumes no quoted/escaped commas in
 * the values, which matches the exported login CSV format used here.
 */
export function readUsersFromCsv(filePath: string): UserCredential[] {
  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(process.cwd(), filePath);

  const content = fs.readFileSync(absolutePath, 'utf-8');

  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  // First line is the header: user_login_name,password
  const [, ...dataLines] = lines;

  const users: UserCredential[] = dataLines
    .map((line) => {
      const [username, password] = line.split(',');
      return {
        username: (username ?? '').trim(),
        password: (password ?? '').trim(),
      };
    })
    .filter((user) => user.username.length > 0 && user.password.length > 0);

  return users;
}
