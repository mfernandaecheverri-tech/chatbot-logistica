
const sendMessage = require("./sendMessage");

function webhook(req, res) {
    const body = req.body || {};

    if (body.object !== "whatsapp_business_account") {
        return res.sendStatus(404);
    }

    // Confirmar inmediatamente la recepción a Meta
    res.sendStatus(200);

    const entries = body.entry || [];

    entries.forEach(entry => {
        const changes = entry.changes || [];

        changes.forEach(change => {
            const value = change.value || {};
            const messages = value.messages || [];

            messages.forEach(message => {
                const remitente = message.from;
                const tipo = message.type;

                console.log("Remitente:", remitente);
                console.log("Tipo de mensaje:", tipo);

                if (tipo === "text") {
                    const contenido = message.text.body;

                    console.log("Mensaje:", contenido);

                    // Respuesta automática provisional
                    sendMessage(
                        remitente,
                        "¡Hola! Somos el Chatbot Logístico. Recibimos tu mensaje correctamente. Pronto te atenderemos."
                    ).catch(error => {
                        console.error(
                            "No se pudo responder al remitente:",
                            error.message
                        );
                    });
                }
            });
        });
    });
}

module.exports = webhook;
