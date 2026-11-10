function verifyWebhook(req, res) {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

    if (mode === "subscribe" && token === verifyToken) {
        console.log("Webhook verificado correctamente");
        return res.status(200).send(challenge);
    }

    console.log("Error al verificar el webhook");
    return res.sendStatus(403);
}

module.exports = verifyWebhook;