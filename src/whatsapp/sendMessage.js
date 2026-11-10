
async function sendMessage(to, message) {
    const token = process.env.WHATSAPP_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const apiVersion = process.env.WHATSAPP_API_VERSION;

    if (!token || !phoneNumberId || !apiVersion) {
        throw new Error("Faltan variables de configuración de WhatsApp");
    }

    const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;

    try {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                messaging_product: "whatsapp",
                recipient_type: "individual",
                to: to,
                type: "text",
                text: {
                    preview_url: false,
                    body: message
                }
            })
        });

        const data = await response.json();

        if (!response.ok) {
            console.error("Error de Meta:", data);
            throw new Error("No se pudo enviar el mensaje");
        }

        console.log("Mensaje enviado correctamente");
        return data;

    } catch (error) {
        console.error("Error al enviar mensaje:", error.message);
        throw error;
    }
}

module.exports = sendMessage;
