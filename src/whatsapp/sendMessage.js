
function normalizarNumero(numero) {
    return String(numero || "").replace(/\D/g, "");
}

function obtenerDestinatariosAutorizados() {
    const configuracion =
        process.env.WHATSAPP_ALLOWED_RECIPIENTS || "";

    return new Set(
        configuracion
            .split(",")
            .map(normalizarNumero)
            .filter(Boolean)
    );
}

async function sendMessage(to, message) {
    // Validar configuración de Meta.
    const token = process.env.WHATSAPP_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const apiVersion = process.env.WHATSAPP_API_VERSION;

    if (!token || !phoneNumberId || !apiVersion) {
        throw new Error("Faltan variables de configuración de WhatsApp");
    }

    // Validar destinatario.
    const destinatario = normalizarNumero(to);

    if (!/^\d{8,15}$/.test(destinatario)) {
        throw new Error("El número del destinatario no tiene un formato válido");
    }

    // Verificar lista de destinatarios autorizados.
    const autorizados = obtenerDestinatariosAutorizados();

    if (autorizados.size === 0) {
        throw new Error("No hay destinatarios autorizados configurados");
    }

    if (!autorizados.has(destinatario)) {
        throw new Error(
            "Envío bloqueado: el destinatario no está autorizado para las pruebas"
        );
    }

    // Validar contenido.
    if (typeof message !== "string" || !message.trim()) {
        throw new Error("El contenido del mensaje no puede estar vacío");
    }

    const url =
        `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;

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
                to: destinatario,
                type: "text",
                text: {
                    preview_url: false,
                    body: message.trim()
                }
            })
        });

        const data = await response.json();

        if (!response.ok) {
            console.error("Error de Meta:", {
                status: response.status,
                respuesta: data
            });

            throw new Error(
                `Meta rechazó el envío (HTTP ${response.status})`
            );
        }

        console.log("Mensaje enviado correctamente a:", destinatario);

        return data;

    } catch (error) {
        console.error("Error al enviar mensaje:", error.message);
        throw error;
    }
}

module.exports = sendMessage;
