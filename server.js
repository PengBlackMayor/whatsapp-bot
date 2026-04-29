import cors from "cors";
import { initDB } from "./database.js";
import dotenv from "dotenv";
import OpenAI from "openai";
import express from "express";
import twilio from "twilio";

dotenv.config();

// 🔥 INIT DB
const db = await initDB();

// 🔥 OPENAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// 🔥 TWILIO CLIENT
const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// 🔐 ADMIN NUMBER
const ADMIN_NUMBER = "whatsapp:+2349130096909";
const SELLER_NUMBER = ADMIN_NUMBER;

// 🔥 EXPRESS
const app = express();
app.use(cors());
app.use(express.urlencoded({ extended: false }));

// 🧠 MEMORY
const chats = {};
const userState = {};

// 🧠 SYSTEM MESSAGE
const SYSTEM_MESSAGE = {
  role: "system",
  content:
    "You are a professional customer support and sales assistant. Be polite and helpful.",
};

// 🧠 INTENT
function detectIntent(message) {
  const msg = message.toLowerCase();

  if (msg.includes("payment")) return "payment";
  if (msg.includes("order") || msg.includes("track")) return "order";
  if (msg.includes("product") || msg.includes("show") || msg.includes("buy"))
    return "products";

  return "general";
}

function detectProductSelection(message) {
  const match = message.match(/^\d+$/);
  return match ? parseInt(match[0]) : null;
}

// ✅ HEALTH
app.get("/", (req, res) => {
  res.send("Server working ✅");
});

// 🚀 WEBHOOK
app.post("/webhook", async (req, res) => {
  try {
    const message = req.body.Body?.trim() || "";
    const from = req.body.From;

    const isAdmin = from === ADMIN_NUMBER;

    console.log("FROM:", from);
    console.log("ADMIN:", ADMIN_NUMBER);
    console.log("User said:", message);

    if (!message) {
      return res.end("<Response><Message></Message></Response>");
    }

    // 🔄 RESET
    if (message.toLowerCase() === "reset") {
      chats[from] = [];
      userState[from] = null;

      return res.end(
        `<Response><Message>Session reset. How can I help you?</Message></Response>`
      );
    }

    // =========================
    // 🔐 ADMIN COMMANDS
    // =========================
    if (isAdmin) {
      const msg = message.toLowerCase();

      console.log("✅ ADMIN COMMAND DETECTED");

      // 📦 VIEW ORDERS
      if (msg === "orders") {
        const allOrders = await db.all(
          "SELECT * FROM orders ORDER BY id DESC LIMIT 5"
        );

        let reply = "";

        if (allOrders.length === 0) {
          reply = "No orders yet.";
        } else {
          reply = "📦 Recent Orders:\n\n";

          allOrders.forEach((o) => {
            reply += `🧾 #${o.id}
${o.product_name} - $${o.price}
Status: ${o.status}

`;
          });
        }

        return res.end(`<Response><Message>${reply}</Message></Response>`);
      }
// =========================
// 📊 ADMIN DASHBOARD API
// =========================

// GET all orders
app.get("/admin/orders", async (req, res) => {
  try {
    const orders = await db.all(
      "SELECT * FROM orders ORDER BY id DESC"
    );
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});

// UPDATE order status
app.post("/admin/update", express.json(), async (req, res) => {
  try {
    const { id, status } = req.body;

    if (!id || !status) {
      return res.status(400).json({ error: "Missing data" });
    }

    await db.run("UPDATE orders SET status = ? WHERE id = ?", [
      status,
      id,
    ]);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Update failed" });
  }
});
      // 🔄 UPDATE ORDER
      if (msg.startsWith("update")) {
        const parts = msg.split(" ");
        const id = parts[1];
        const status = parts[2];

        if (!id || !status) {
          return res.end(
            `<Response><Message>Use: update 1 shipped</Message></Response>`
          );
        }

        await db.run("UPDATE orders SET status = ? WHERE id = ?", [
          status,
          id,
        ]);

        return res.end(
          `<Response><Message>✅ Order #${id} updated to ${status}</Message></Response>`
        );
      }
    }

    // =========================
    // 🧠 USER FLOW
    // =========================

    if (!chats[from]) {
      chats[from] = [SYSTEM_MESSAGE];
    }

    chats[from].push({ role: "user", content: message });

    const intent = detectIntent(message);
    let reply = "";

    const products = await db.all("SELECT * FROM products");

    // 🛍️ PRODUCTS
    if (intent === "products") {
      if (products.length === 0) {
        reply = "No products available.";
      } else {
        reply = "Here are our products:\n\n";

        products.forEach((p, index) => {
          reply += `${index + 1}. ${p.name}
Price: $${p.price}
${p.description}

`;
        });

        reply += "Reply with the product number.";
      }
    }

    // 🛒 SELECT PRODUCT
    else if (message.match(/^\d+$/)) {
      const index = detectProductSelection(message);

      if (!index || index > products.length) {
        reply = "Invalid product number.";
      } else {
        const selected = products[index - 1];

        const result = await db.run(
          "INSERT INTO orders (phone, product_name, price, status) VALUES (?, ?, ?, ?)",
          [from, selected.name, selected.price, "pending"]
        );

        const orderId = result.lastID;

        userState[from] = {
          lastProduct: selected,
          orderId,
        };

        reply = `Nice choice 🔥

You selected *${selected.name}* ($${selected.price})

Place order now? (yes/no)`;
      }
    }

    // ✅ CONFIRM ORDER
    else if (message.toLowerCase() === "yes") {
      const state = userState[from];

      if (!state) {
        reply = "Please select a product first.";
      } else {
        const { lastProduct: product, orderId } = state;

        await db.run(
          "UPDATE orders SET status = ? WHERE id = ?",
          ["confirmed", orderId]
        );

        reply = `✅ Order confirmed!

🧾 Order ID: #${orderId}

You ordered *${product.name}* for $${product.price}.`;

        // 🔔 ADMIN ALERT
        try {
          await client.messages.create({
            from: "whatsapp:+14155238886",
            to: SELLER_NUMBER,
            body: `📢 NEW ORDER!

🧾 #${orderId}
${product.name} - $${product.price}
Customer: ${from}`,
          });

          console.log("✅ Alert sent");
        } catch (err) {
          console.log("❌ Twilio error:", err.message);
        }

        delete userState[from];
      }
    }

    // 📦 TRACK ORDER
    else if (intent === "order") {
      const match = message.match(/\d+/);

      if (!match) {
        reply = "Send your order ID.";
      } else {
        const order = await db.get(
          "SELECT * FROM orders WHERE id = ?",
          [match[0]]
        );

        if (!order) {
          reply = "Order not found.";
        } else {
          reply = `🧾 Order #${order.id}
${order.product_name}
Status: ${order.status}`;
        }
      }
    }

    // 🤖 AI
    else {
      const response = await openai.responses.create({
        model: "gpt-4.1-mini",
        input: chats[from],
      });

      reply = response.output_text || "How can I help?";
    }

    console.log("Reply:", reply);

    chats[from].push({ role: "assistant", content: reply });

    res.writeHead(200, { "Content-Type": "text/xml" });
    res.end(`<Response><Message>${reply}</Message></Response>`);
  } catch (err) {
    console.log("🔥 ERROR:", err.message);

    res.writeHead(200, { "Content-Type": "text/xml" });
    res.end(`<Response><Message>Error occurred</Message></Response>`);
  }
});

// 🚀 START
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("SERVER STARTED 🚀 on port", PORT);
});