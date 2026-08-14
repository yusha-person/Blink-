import { argon2id } from "hash-wasm";
import crypto from "node:crypto";

const [, , username, password] = process.argv;

if (!username || !password) {
  console.error("Usage: bun server/setup-admin.ts <username> <password>");
  process.exit(1);
}

const salt = crypto.randomBytes(16);
const hash = await argon2id({
  password,
  salt,
  parallelism: 1,
  iterations: 3,
  memorySize: 65536,
  hashLength: 32,
  outputType: "encoded",
});

console.log("\nAdd these to your server environment:\n");
console.log(`BLINK_ADMIN_USER=${username}`);
console.log(`BLINK_ADMIN_HASH=${hash}`);
console.log(`BLINK_SESSION_SECRET=${crypto.randomBytes(32).toString("hex")}`);
console.log("");
