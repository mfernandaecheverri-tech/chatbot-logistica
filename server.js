require("dotenv").config();

const express = require("express");

const app = express();
const PORT = 3000;

// Importar módulos de WhatsApp
const verifyWebhook = require("./src/whatsapp/verifyWebhook");
const webhook = require("./src/whatsapp/webhook");
const sendMessage = require("./src/whatsapp/sendMessage");

// Configuración
app.use(express.json());

app.locals.sendWhatsAppMessage = sendMessage;

// Ruta principal
app.get("/", (req, res) => {
    res.send("¡Servidor del Chatbot Logístico funcionando!");
});

// Rutas de WhatsApp
app.get("/webhook", verifyWebhook);
app.post("/webhook", webhook);

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`Servidor funcionando en http://localhost:${PORT}`);
});
