import { initDB } from "./database.js";

const db = await initDB();

// Clear old products (important)
await db.exec("DELETE FROM products");

// Add products
await db.run(
  "INSERT INTO products (name, price, description, image_url) VALUES (?, ?, ?, ?)",
  [
    "Classic White Shirt",
    "$25",
    "Clean white cotton shirt, perfect for all occasions",
    "https://via.placeholder.com/300"
  ]
);

await db.run(
  "INSERT INTO products (name, price, description, image_url) VALUES (?, ?, ?, ?)",
  [
    "Black Hoodie",
    "$40",
    "Comfortable hoodie, stylish and warm",
    "https://via.placeholder.com/300"
  ]
);

await db.run(
  "INSERT INTO products (name, price, description, image_url) VALUES (?, ?, ?, ?)",
  [
    "Denim Jacket",
    "$60",
    "Premium denim jacket, durable and trendy",
    "https://via.placeholder.com/300"
  ]
);

console.log("✅ Products added");

process.exit();