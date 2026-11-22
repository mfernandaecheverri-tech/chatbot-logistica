
const sendMessage = require("./sendMessage");
const { procesarMensaje } = require("./conversation/messageRouter");

// Control temporal de mensajes ya procesados.
const mensajesProcesados = new Map();

const TIEMPO_DEDUPLICACION = 24 * 60 * 60 * 1000;
const MAX_MENSAJES_GUARDADOS = 5000;

// Normaliza los números para compararlos sin +, espacios ni guiones.
function normalizarNumero(numero) {
    return String(numero || "").replace(/\D/g, "");
}

// Obtiene los números de prueba autorizados desde .env.
function obtenerDestinatariosAutorizados() {
    const configuracion = process.env.WHATSAPP_ALLOWED_RECIPIENTS || "";

    return new Set(
        configuracion
            .split(",")
            .map(normalizarNumero)
            .filter(Boolean)
    );
}

// Comprueba si WhatsApp ya había enviado este mismo mensaje.
function registrarMensajeNuevo(idMensaje) {
    const ahora = Date.now();

    // Eliminar identificadores vencidos.
    for (const [id, expiracion] of mensajesProcesados) {
        if (expiracion <= ahora) {
            mensajesProcesados.delete(id);
        }
    }

    if (mensajesProcesados.has(idMensaje)) {
        return false;
    }

    mensajesProcesados.set(
        idMensaje,
        ahora + TIEMPO_DEDUPLICACION
    );

    // Evitar que el Map crezca indefinidamente.
    while (mensajesProcesados.size > MAX_MENSAJES_GUARDADOS) {
        const primerId = mensajesProcesados.keys().next().value;
        mensajesProcesados.delete(primerId);
    }

    return true;
}

// Procesa un mensaje individual y genera su respuesta.
async function procesarMensajeEntrante(message) {
    const remitente = normalizarNumero(message.from);
    const tipo = message.type;
    const contenido = message.text?.body?.trim();
    const idMensaje = message.id;

    console.log("Remitente:", remitente);
    console.log("Tipo de mensaje:", tipo);

    // Verificar que el remitente esté autorizado para las pruebas.
    const autorizados = obtenerDestinatariosAutorizados();

    if (!autorizados.has(remitente)) {
        console.warn(
            "Mensaje ignorado: remitente no autorizado para las pruebas."
        );
        return;
    }

    // Por ahora el motor conversacional procesa mensajes de texto.
    if (tipo !== "text" || !contenido) {
        console.log("Mensaje ignorado: tipo no compatible.");
        return;
    }

    // El identificador es necesario para evitar respuestas duplicadas.
    if (!idMensaje) {
        console.warn("Mensaje ignorado: no contiene identificador.");
        return;
    }

    if (!registrarMensajeNuevo(idMensaje)) {
        console.log("Mensaje duplicado ignorado:", idMensaje);
        return;
    }

    console.log("ID del mensaje:", idMensaje);
    console.log("Mensaje recibido:", contenido);

    try {
        // Enviar el mensaje recibido al motor conversacional de Nane.
        const respuesta = await procesarMensaje(remitente, contenido);

        if (typeof respuesta !== "string" || !respuesta.trim()) {
            console.warn("El motor conversacional no generó una respuesta.");
            return;
        }

        console.log("Respuesta generada por el chatbot:", respuesta);

        // Enviar por WhatsApp la respuesta del motor conversacional.
        await sendMessage(remitente, respuesta);

        console.log("Respuesta enviada correctamente a:", remitente);

    } catch (error) {
        console.error(
            "Error al procesar o responder el mensaje:",
            error.message
        );
    }
}

// Procesa las notificaciones recibidas desde Meta.
async function procesarNotificacion(body) {
    const entradas = body.entry || [];

    // Procesamiento secuencial para conservar el orden de los mensajes
    // incluidos en una misma notificación.
    for (const entrada of entradas) {
        const cambios = entrada.changes || [];

        for (const cambio of cambios) {
            const valor = cambio.value || {};
            const mensajes = valor.messages || [];

            for (const message of mensajes) {
                await procesarMensajeEntrante(message);
            }
        }
    }
}

// Endpoint POST utilizado por Meta.
function webhook(req, res) {
    const body = req.body || {};

    if (body.object !== "whatsapp_business_account") {
        return res.sendStatus(404);
    }

    // Confirmar inmediatamente a Meta que recibimos la notificación.
    res.sendStatus(200);

    // Procesar los mensajes después de confirmar la recepción.
    procesarNotificacion(body).catch(error => {
        console.error("Error general del webhook:", error.message);
    });
}

module.exports = webhook;
