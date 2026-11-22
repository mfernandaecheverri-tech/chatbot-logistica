
//creacion de menus de administrador y trabajador
function menuAdministrador() {
    return `
¡Bienvenido al menú administrativo!

Selecciona una opción:

1. CREAR EVENTO
2. VER EVENTOS
3. EDITAR EVENTO
4. CERRAR EVENTO
5. VER INSCRITOS

Escribe el número de la opción que deseas ejecutar.

Escribe MENU para volver a este menú.
Escribe CANCELAR para abandonar la operación actual.
    `.trim();
}

function menuTrabajador() {
    return `
¡Bienvenido al chatbot de logística!

Selecciona una opción:

1. VER EVENTOS DISPONIBLES
2. INSCRIBIRME A UN EVENTO
3. CONSULTAR MIS INSCRIPCIONES
4. CANCELAR MI INSCRIPCIÓN
5. AYUDA

Escribe el número de la opción que deseas ejecutar.

Escribe MENU para volver a este menú.
Escribe CANCELAR para abandonar la operación actual.
    `.trim();
}

module.exports = {
    menuAdministrador,
    menuTrabajador
};
