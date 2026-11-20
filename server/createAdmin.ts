import bcrypt from "bcryptjs";
import { db, id, now } from "./db";

const [name, email, password] = process.argv.slice(2);
if (!name || !email || !password || password.length < 12 || !email.includes("@")) {
  console.error("Usage: npm run admin:create -- \"Admin name\" admin@example.org \"A-strong-password\"");
  process.exitCode = 1;
} else try {
  const existingAdmin = await db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();
  if (existingAdmin) {
    console.error("An administrator already exists. Ask an existing administrator to manage the pilot.");
    process.exitCode = 1;
  } else {
    try {
      await db.prepare(`INSERT INTO users (id, name, email, password_hash, role, status, area, created_at)
        VALUES (?, ?, ?, ?, 'admin', 'approved', 'MKU Thika', ?)`)
        .run(id(), name.trim(), email.trim().toLowerCase(), bcrypt.hashSync(password, 12), now());
      console.log("Administrator created. Sign in to manage accounts and the pilot catalogue.");
    } catch (error) {
      console.error("Could not create administrator:", error);
      process.exitCode = 1;
    }
  }
} catch (error) {
  console.error("Could not connect to the database:", error);
  process.exitCode = 1;
}
