import "dotenv/config";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
await sql.unsafe("drop owned by current_user cascade");
await sql.end();
console.log("Database reset");
