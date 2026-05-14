declare module "sql.js" {
  export interface QueryExecResult {
    columns: string[];
    values: unknown[][];
  }

  export interface Database {
    exec(sql: string): QueryExecResult[];
    run(sql: string, params?: unknown[]): void;
    export(): Uint8Array;
    close(): void;
  }

  export interface SqlJsStatic {
    Database: new (data?: Uint8Array) => Database;
  }

  export default function initSqlJs(config?: {
    locateFile?: (file: string) => string;
  }): Promise<SqlJsStatic>;
}
