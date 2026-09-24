// The one file allowed to do all of this.
import pg from 'pg';
export const url = process.env.TS_DB_URL;
export default pg;
