//script para validaciones y funciones auxiliares reutilizables.
// Validaciones y conversiones reutilizables para los flujos del chatbot.

// Convierte una fecha DD/MM/AAAA a formato ISO YYYY-MM-DD.
function convertirFecha(fecha) {
    const partes = fecha.trim().split('/');

    if (partes.length !== 3) {
        return null;
    }

    const [dia, mes, anio] = partes.map(Number);

    if (
        !Number.isInteger(dia) ||
        !Number.isInteger(mes) ||
        !Number.isInteger(anio)
    ) {
        return null;
    }

    const fechaObjeto = new Date(anio, mes - 1, dia);

    // Comprueba que la fecha exista realmente.
    if (
        fechaObjeto.getFullYear() !== anio ||
        fechaObjeto.getMonth() !== mes - 1 ||
        fechaObjeto.getDate() !== dia
    ) {
        return null;
    }

    // Evita fechas anteriores al día actual.
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    if (fechaObjeto < hoy) {
        return null;
    }

    return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

// Valida el formato de hora de 24 horas HH:MM.
function validarHora(hora) {
    const formato = /^([01]\d|2[0-3]):([0-5]\d)$/;
    return formato.test(hora.trim());
}

// Valida que un texto no esté vacío.
function validarTexto(texto) {
    return typeof texto === 'string' && texto.trim().length > 0;
}

// Valida que un valor sea un número entero positivo.
function validarNumeroPositivo(valor) {
    return /^\d+$/.test(String(valor).trim()) &&
        Number(valor) > 0;
}

// Valida respuestas afirmativas o negativas.
function validarSiNo(respuesta) {
    const valor = respuesta.trim().toUpperCase();
    return valor === 'SI' || valor === 'SÍ' || valor === 'NO';
}

// Normaliza respuestas SI/SÍ/NO.
function normalizarSiNo(respuesta) {
    const valor = respuesta.trim().toUpperCase();

    if (valor === 'SÍ') return 'SI';
    if (valor === 'SI') return 'SI';
    if (valor === 'NO') return 'NO';

    return null;
}

// Convierte una lista de fechas DD/MM/AAAA a fechas ISO.
// Devuelve null si alguna fecha no es válida.
function convertirListaFechas(texto) {
    const fechas = texto.split(',').map(fecha => fecha.trim());

    if (fechas.length === 0 || fechas.some(fecha => !fecha)) {
        return null;
    }

    const fechasISO = fechas.map(convertirFecha);

    if (fechasISO.some(fecha => fecha === null)) {
        return null;
    }

    // Evita fechas repetidas.
    if (new Set(fechasISO).size !== fechasISO.length) {
        return null;
    }

    return fechasISO;
}

// Convierte fechas ISO a formato DD/MM/AAAA para mostrarlas.
function formatearFechas(fechas) {
    return fechas.map(fecha => {
        const [anio, mes, dia] = fecha.split('-');
        return `${dia}/${mes}/${anio}`;
    }).join(', ');
}

module.exports = {
    convertirFecha,
    validarHora,
    validarTexto,
    validarNumeroPositivo,
    validarSiNo,
    normalizarSiNo,
    convertirListaFechas,
    formatearFechas
};
