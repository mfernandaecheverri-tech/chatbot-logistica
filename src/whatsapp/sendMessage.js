const fs = require("fs");
const path = require("path");

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

async function sendDocument(to, rutaArchivo, caption = "") {
    const token = process.env.WHATSAPP_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const apiVersion = process.env.WHATSAPP_API_VERSION;

    if (!token || !phoneNumberId || !apiVersion) {
        throw new Error("Faltan variables de configuración de WhatsApp");
    }

    const destinatario = normalizarNumero(to);

    if (!/^\d{8,15}$/.test(destinatario)) {
        throw new Error("El número del destinatario no tiene un formato válido");
    }

    const autorizados = obtenerDestinatariosAutorizados();

    if (autorizados.size === 0 || !autorizados.has(destinatario)) {
        throw new Error("Envío de documento bloqueado: destinatario no autorizado");
    }

    if (!rutaArchivo || !fs.existsSync(rutaArchivo)) {
        throw new Error("No se encontró el archivo que se desea enviar");
    }

    const nombreArchivo = path.basename(rutaArchivo);

    if (path.extname(nombreArchivo).toLowerCase() !== ".csv") {
        throw new Error("El archivo debe tener formato CSV");
    }

    const contenido = await fs.promises.readFile(rutaArchivo);

    const formulario = new FormData();

    formulario.append("messaging_product", "whatsapp");
    formulario.append("type", "application/vnd.ms-excel");
    formulario.append(
        "file",
        new Blob([contenido], { type: "application/vnd.ms-excel" }),
        nombreArchivo
    );

    const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/media`;

    // Primero se carga el archivo a Meta.
    const respuestaCarga = await fetch(url, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`
        },
        body: formulario
    });

    const datosCarga = await respuestaCarga.json();

    if (!respuestaCarga.ok || !datosCarga.id) {
        console.error("Error al cargar el CSV:", datosCarga);
        throw new Error("No fue posible cargar el documento a WhatsApp");
    }

    // Después se envía el documento al administrador.
    const respuestaEnvio = await fetch(
        `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                messaging_product: "whatsapp",
                recipient_type: "individual",
                to: destinatario,
                type: "document",
                document: {
                    id: datosCarga.id,
                    filename: nombreArchivo,
                    caption: caption
                }
            })
        }
    );

    const datosEnvio = await respuestaEnvio.json();

    if (!respuestaEnvio.ok) {
        console.error("Error al enviar el CSV:", datosEnvio);
        throw new Error("WhatsApp no pudo enviar el documento");
    }

    console.log("Documento enviado correctamente a:", destinatario);

    return datosEnvio;
}

module.exports = sendMessage;
module.exports.sendDocument = sendDocument;
