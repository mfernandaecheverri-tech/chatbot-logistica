//script encargado de extablecer el funcionamineto de los comandos del chatbot (MENU, CANCELAR, VOLVER) 
//y de las opciones numericas (1-5) que el usuario puede enviar al chatbot

// Normaliza los mensajes recibidos
function normalizarMensaje(mensaje) {
    return mensaje
        .trim()
        .toUpperCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

// Identifica los comandos generales del chatbot
function identificarComando(mensaje) {
    const texto = normalizarMensaje(mensaje);

    if (texto === 'MENU') {
        return 'MENU';
    }

    if (texto === 'CANCELAR') {
        return 'CANCELAR';
    }

    if (texto === 'VOLVER') {
        return 'VOLVER';
    }

    return null;
}

// Identifica una opción numérica entre 1 y 5
function identificarOpcion(mensaje) {
    const texto = normalizarMensaje(mensaje);

    if (/^[1-5]$/.test(texto)) {
        return Number(texto);
    }

    return null;
}

module.exports = {
    normalizarMensaje,
    identificarComando,
    identificarOpcion
};
