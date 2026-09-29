import { seedDemo } from "../src/lib/seed";

process.env.DEMO_MODE = process.env.DEMO_MODE || "1";
const result = seedDemo();
console.log("Seeded demo fixtures:", result);
